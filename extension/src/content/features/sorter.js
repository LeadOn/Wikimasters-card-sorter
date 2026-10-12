// Tri automatique de la collection : même moteur et mêmes garanties que scripts/categorize_cards.js.
// 1. Aperçu (planSort) : rien n'est écrit.  2. Application (applySort), sur clic du joueur.
import {rest, fetchAll} from "../api/supabase";
import {ensureSession} from "../lib/session";
import {withLock} from "../lib/locks";
import {createLimiter} from "../lib/http";
import {createStore} from "../lib/store";
import {load, save} from "../lib/storage";
import {activeProfiles} from "../state/profiles";
import {settings} from "../state/settings";
import {invalidateCollection} from "../state/collection";
import {managedTags, computeAssignments, managedTagIds, planChanges, planTagUpserts, countByTag, DOUBLON} from "../../../../core";

export const sortState = createStore({running: false, step: "", progress: null, plan: null, result: null, error: null, lastRun: null});
load("lastSort", null).then((lastRun) => lastRun && sortState.set({lastRun}));

const step = (label, progress = null) => sortState.set({step: label, progress});
const yieldToUi = () => new Promise((r) => setTimeout(r, 0));

async function classify(rows, profiles) {
  // Par tranches, pour garder la page réactive
  const out = [];
  for (let i = 0; i < rows.length; i += 400) {
    out.push(...computeAssignments(rows.slice(i, i + 400), {profiles}));
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

    step("Lecture de votre collection", {done: 0, total: null});
    const rows = await fetchAll(`user_cards?select=id,card_id,count,cards(id,wikipedia_title,category,summary,image_url)&order=obtained_at.desc`, {
      onPage: (n) => step("Lecture de votre collection", {done: n, total: null}),
    });

    // Les doublons se calculent sur toute la collection ; le classement est nécessaire partout en
    // mode complet, et en mode incrémental seulement pour les cartes non triées (calculé après).
    // Lecture étiquette par étiquette (une lecture globale dépasse le délai du serveur), 3 à la fois
    const ids = managedTagIds(existingTags, managed);
    const tagIds = Object.values(ids).flat();
    const current = new Map();
    let done = 0;
    step("Lecture des associations", {done, total: tagIds.length});
    const limit = createLimiter(3);
    await Promise.all(
      tagIds.map((id) =>
        limit(async () => {
          const links = await fetchAll(`user_card_tags?select=user_card_id&tag_id=eq.${id}`);
          current.set(id, new Set(links.map((l) => l.user_card_id)));
          step("Lecture des associations", {done: ++done, total: tagIds.length});
        }),
      ),
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

export async function applySort(plan) {
  if (Date.now() - plan.createdAt > 15 * 60 * 1000) throw new Error("Cet aperçu date de plus de 15 minutes : relancez l'aperçu avant d'appliquer.");
  sortState.set({running: true, error: null, result: null});
  try {
    return await withLock("sort", async () => {
      const {existing, create, recolor} = plan.upserts;
      const tagMap = Object.fromEntries(Object.entries(existing).map(([name, t]) => [name, t.id]));

      step("Mise à jour des étiquettes");
      for (const {id, color} of recolor) await rest(`tags?id=eq.${id}`, {method: "PATCH", body: {color}, retries: 3});
      for (const {name, color} of create) {
        const [created] = await rest("tags?select=*", {method: "POST", prefer: "return=representation", body: {user_id: plan.userId, name, color}});
        tagMap[name] = created.id;
      }

      // Ajouts d'abord, suppressions ensuite : une interruption laisse au pire un tag en trop.
      const rows = plan.toInsert.map((x) => ({user_card_id: x.userCardId, tag_id: tagMap[x.name]})).filter((r) => r.tag_id);
      let inserted = 0;
      let failed = 0;
      for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100);
        step("Ajout des étiquettes", {done: i, total: rows.length});
        try {
          await rest("user_card_tags", {method: "POST", body: chunk, prefer: "resolution=ignore-duplicates", retries: 4});
          inserted += chunk.length;
        } catch {
          for (const row of chunk) {
            try {
              await rest("user_card_tags", {method: "POST", body: [row], prefer: "resolution=ignore-duplicates", retries: 2});
              inserted++;
            } catch {
              failed++;
            }
          }
        }
      }

      let deleted = 0;
      const deleteTotal = plan.deleteCount;
      for (const {tagId, ids} of plan.toDelete) {
        for (let i = 0; i < ids.length; i += 100) {
          step("Retrait des étiquettes obsolètes", {done: deleted, total: deleteTotal});
          const chunk = ids.slice(i, i + 100);
          await rest(`user_card_tags?tag_id=eq.${tagId}&user_card_id=in.(${chunk.join(",")})`, {method: "DELETE", retries: 4});
          deleted += chunk.length;
        }
      }
      for (const id of plan.extraTagIds) await rest(`tags?id=eq.${id}`, {method: "DELETE", retries: 3});

      invalidateCollection();
      const result = {inserted, deleted, failed, sorted: plan.newOnly ? plan.scopedCount : plan.total, at: Date.now(), newOnly: plan.newOnly};
      save("lastSort", result).catch(() => {});
      sortState.set({result, lastRun: result, plan: null, step: "", progress: null});
      return result;
    });
  } catch (error) {
    sortState.set({error: error.message || String(error)});
    throw error;
  } finally {
    sortState.set({running: false});
  }
}
