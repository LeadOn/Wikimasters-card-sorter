// Tri automatique des cartes tirées (option, désactivée par défaut) : seuls les exemplaires qui
// viennent d'arriver sont classés, en quelques requêtes, sans relire toute la collection.
// - thème + tags « Pour : … » sur chaque nouvel exemplaire qui n'a encore aucun thème ;
// - Doublon sur tous les exemplaires d'une carte possédée en plusieurs exemplaires ;
// - aucune suppression, aucune autre carte touchée, étiquettes personnelles jamais modifiées.
import {restIn, rest, tagClient} from "../api/supabase";
import {ensureSession} from "../lib/session";
import {withLock} from "../lib/locks";
import {activeProfiles} from "../state/profiles";
import {settings} from "../state/settings";
import {invalidateCollection} from "../state/collection";
import {categorize, managedTags, isThemeTag, ensureTags, insertLinks, DOUBLON} from "../../../../core";

// Exemplaires des cartes tirées : user_card_id fourni par le site, sinon les plus récents de chaque carte
function pulledCopies(cards, rows) {
  const byCard = new Map();
  for (const r of rows) (byCard.get(r.card_id) || byCard.set(r.card_id, []).get(r.card_id)).push(r);
  const taken = new Set();
  return cards.map((c) => {
    if (c.user_card_id) return c.user_card_id;
    const recent = (byCard.get(c.id) || []).filter((r) => !taken.has(r.id)).sort((a, b) => (a.obtained_at < b.obtained_at ? 1 : -1))[0];
    if (recent) taken.add(recent.id);
    return recent?.id || null;
  });
}

// cards : cartes de la réponse du site ({id, wikipedia_title, category, summary, image_url, user_card_id…})
// Renvoie {byIndex: [{status: "sorted", tags} | {status: "already", doublon} | {status: "unknown"}], doublons}
// Verrou partagé avec le tri : deux tris simultanés (deux paquets, deux onglets) pourraient sinon
// créer deux fois la même étiquette. Celui-ci attend son tour au lieu d'échouer.
export function sortPulledCards(cards) {
  return withLock("sort", () => sortNow(cards), {wait: true});
}

async function sortNow(cards) {
  const session = await ensureSession();
  const profiles = activeProfiles();
  const managed = managedTags({profiles, themeColors: settings.get().themeColors});
  const ids = cards.map((c) => c.id);

  const [tags, copies, summaries] = await Promise.all([
    rest(`tags?select=id,name,color&user_id=eq.${session.userId}`, {retries: 3}),
    restIn("user_cards?select=id,card_id,count,obtained_at", "card_id", ids, {retries: 3}),
    cards.some((c) => c.summary == null) ? restIn("cards?select=id,summary", "id", ids, {retries: 3}) : Promise.resolve([]),
  ]);
  const summaryOf = new Map(summaries.map((s) => [s.id, s.summary]));
  const pulledIds = pulledCopies(cards, copies);

  // Étiquettes déjà présentes sur les exemplaires tirés (un exemplaire déjà trié n'est pas reclassé)
  const links = await restIn("user_card_tags?select=user_card_id,tag_id", "user_card_id", pulledIds, {retries: 3});
  const tagName = new Map(tags.map((t) => [t.id, t.name]));
  const hasTheme = new Set(links.filter((l) => isThemeTag(tagName.get(l.tag_id) || "")).map((l) => l.user_card_id));

  // Thème + profils pour chaque nouvel exemplaire
  const wanted = []; // {userCardId, name}
  const byIndex = cards.map((c, i) => {
    const ucId = pulledIds[i];
    if (!ucId) return {status: "unknown"};
    if (hasTheme.has(ucId)) return {status: "already"};
    const card = {...c, summary: c.summary ?? summaryOf.get(c.id) ?? ""};
    const names = categorize(card, {profiles});
    for (const name of names) wanted.push({userCardId: ucId, name});
    return {status: "sorted", tags: names};
  });

  // Doublon : tous les exemplaires des cartes possédées plusieurs fois
  const total = new Map();
  for (const r of copies) total.set(r.card_id, (total.get(r.card_id) || 0) + Math.max(1, Number(r.count) || 1));
  const doublons = copies.filter((r) => total.get(r.card_id) > 1);
  for (const r of doublons) wanted.push({userCardId: r.id, name: DOUBLON});
  cards.forEach((c, i) => {
    if (!(total.get(c.id) > 1)) return;
    if (byIndex[i].status === "sorted") byIndex[i].tags.push(DOUBLON);
    else byIndex[i].doublon = true;
  });

  // Étiquettes gérées manquantes : créées à la demande, après relecture (core/tag-writer.js)
  const client = tagClient(session.userId);
  const tagId = await ensureTags(client, Object.fromEntries([...new Set(wanted.map((w) => w.name))].map((name) => [name, managed[name]])), {known: tags});
  const rows = wanted.map((w) => ({user_card_id: w.userCardId, tag_id: tagId.get(w.name)})).filter((r) => r.tag_id);
  await insertLinks(client, rows);
  invalidateCollection();
  return {byIndex, doublons: doublons.length};
}
