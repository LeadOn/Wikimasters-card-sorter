// Tri automatique de la collection : même moteur et mêmes garanties que scripts/categorize_cards.js.
// 1. Aperçu (planSort) : rien n'est écrit.  2. Application (applySort), sur clic du joueur.
import {rest, fetchAll, tagClient} from "../api/supabase";
import {ensureSession} from "../lib/session";
import {withLock} from "../lib/locks";
import {runAll} from "../lib/http";
import {createStore} from "../lib/store";
import {load, save} from "../lib/storage";
import {activeProfiles} from "../state/profiles";
import {settings} from "../state/settings";
import {invalidateCollection} from "../state/collection";
import {managedTags, countCopies, computeAssignments, managedTagIds, planChanges, planTagUpserts, countByTag, applyPlan, DOUBLON} from "../../../../core";

export const sortState = createStore({running: false, step: "", progress: null, plan: null, result: null, error: null, lastRun: null});
load("lastSort", null).then((lastRun) => lastRun && sortState.set({lastRun}));

const step = (label, progress = null) => sortState.set({step: label, progress});
const yieldToUi = () => new Promise((r) => setTimeout(r, 0));

async function classify(rows, profiles) {
  // Par tranches, pour garder la page réactive. Les exemplaires sont comptés sur toute la
  // collection : deux exemplaires d'une carte peuvent tomber dans deux tranches différentes.
  const copies = countCopies(rows);
  const out = [];
  for (let i = 0; i < rows.length; i += 400) {
    out.push(...computeAssignments(rows.slice(i, i + 400), {profiles, copies}));
    step("Classement des cartes", {done: Math.min(i + 400, rows.length), total: rows.length});
    await yieldToUi();
  }
  return out;
}

export async function planSort({newOnly}) {
  sortState.set({running: true, plan: null, result: null, error: null});
  try {
    const session = await ensureSession();
    const profiles = activeProfiles();
    const managed = managedTags({profiles, themeColors: settings.get().themeColors});

    step("Lecture de vos étiquettes");
    const existingTags = await rest(`tags?select=*&user_id=eq.${session.userId}`);

    // Pagination triée de façon stable (`id` départage les cartes d'un même paquet), lignes
    // dédoublonnées : une carte lue deux fois serait prise pour un doublon, une carte manquée
    // resterait non triée.
    step("Lecture de votre collection", {done: 0, total: null});
    const rows = await fetchAll(`user_cards?select=id,card_id,count,cards(id,wikipedia_title,category,summary,image_url)&order=obtained_at.desc,id.asc`, {
      key: "id",
      onPage: (n) => step("Lecture de votre collection", {done: n, total: null}),
    });

    // Les doublons se calculent sur toute la collection ; le classement est nécessaire partout en
    // mode complet, et en mode incrémental seulement pour les cartes non triées (calculé après).
    // Lecture étiquette par étiquette (une lecture globale dépasse le délai du serveur), 3 à la fois.
    // Une association manquée ferait passer une carte triée (et corrigée à la main) pour non triée.
    const ids = managedTagIds(existingTags, managed);
    const tagIds = Object.values(ids).flat();
    const current = new Map();
    let done = 0;
    step("Lecture des associations", {done, total: tagIds.length});
    await runAll(
      tagIds,
      async (id) => {
        const links = await fetchAll(`user_card_tags?select=user_card_id&tag_id=eq.${id}&order=user_card_id.asc`);
        current.set(id, new Set(links.map((l) => l.user_card_id)));
        step("Lecture des associations", {done: ++done, total: tagIds.length});
      },
      {concurrency: 3},
    );

    const assignments = await classify(rows, profiles);
    const {fresh, toInsert, toDelete, extraTagIds} = planChanges(assignments, existingTags, current, {newOnly, managed});
    const upserts = planTagUpserts(existingTags, managed, toInsert, {newOnly});

    const byId = new Map(rows.map((r) => [r.id, r]));
    const scoped = fresh ? assignments.filter((a) => fresh.has(a.userCard.id)) : assignments;
    const titleOf = (id) => byId.get(id)?.cards?.wikipedia_title || "?";
    const plan = {
      newOnly,
      createdAt: Date.now(),
      userId: session.userId,
      total: rows.length,
      scopedCount: scoped.length,
      counts: countByTag(scoped, managed),
      cards: scoped.map((a) => ({id: a.userCard.id, title: a.userCard.cards.wikipedia_title, category: a.userCard.cards.category, tags: a.tags})),
      doublonAdds: toInsert.filter((x) => x.name === DOUBLON && !fresh?.has(x.userCardId)).map((x) => titleOf(x.userCardId)),
      doublonDels: toDelete.filter((d) => d.name === DOUBLON).flatMap((d) => d.ids.map(titleOf)),
      toInsert,
      toDelete,
      extraTagIds,
      upserts,
      managed,
      unmanaged: existingTags.filter((t) => !(t.name in managed)).map((t) => t.name),
    };
    plan.insertCount = toInsert.length;
    plan.deleteCount = toDelete.reduce((n, d) => n + d.ids.length, 0);
    sortState.set({plan, step: "", progress: null});
    return plan;
  } catch (error) {
    sortState.set({error: error.message || String(error)});
    throw error;
  } finally {
    sortState.set({running: false});
  }
}

const STEP_LABELS = {tags: "Mise à jour des étiquettes", insert: "Ajout des étiquettes", delete: "Retrait des étiquettes obsolètes"};

// Message d'une écriture interrompue : ce qui a été fait, et comment terminer.
function interruptedMessage(e) {
  const base = e?.message || String(e);
  const p = e?.partial;
  if (!p) return base;
  const done = [p.inserted && `${p.inserted} ajout(s)`, p.deleted && `${p.deleted} retrait(s)`].filter(Boolean).join(", ");
  return `${base} Écriture interrompue${done ? ` après ${done}` : ""} : cliquez à nouveau sur « Appliquer » pour terminer, rien ne sera écrit en double.`;
}

export async function applySort(plan) {
  if (Date.now() - plan.createdAt > 15 * 60 * 1000) throw new Error("Cet aperçu date de plus de 15 minutes : relancez l'aperçu avant d'appliquer.");
  sortState.set({running: true, error: null, result: null});
  try {
    return await withLock("sort", async () => {
      // core/tag-writer.js : étiquettes relues avant d'être créées, ajouts avant suppressions,
      // arrêt à la première panne. Relancer le même aperçu termine le travail sans doublon.
      const r = await applyPlan(tagClient(plan.userId), plan, {
        onProgress: ({step: s, done, total}) => step(STEP_LABELS[s], total != null ? {done, total} : null),
      });
      invalidateCollection();
      const result = {...r, sorted: plan.newOnly ? plan.scopedCount : plan.total, at: Date.now(), newOnly: plan.newOnly};
      save("lastSort", result).catch(() => {});
      sortState.set({result, lastRun: result, plan: null, step: "", progress: null});
      return result;
    });
  } catch (error) {
    invalidateCollection();
    const message = interruptedMessage(error);
    sortState.set({error: message});
    throw error?.partial ? Object.assign(new Error(message), {cause: error}) : error;
  } finally {
    sortState.set({running: false});
  }
}
