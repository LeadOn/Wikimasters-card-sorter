// Familles : groupes de cartes à collectionner (manuelles ou intelligentes), partage par code,
// cartes manquantes en vente, conversion en étiquette WikiMasters.
import {site} from "../api/site";
import {rest, fetchAll, tagClient} from "../api/supabase";
import {ensureSession} from "../lib/session";
import {persistentStore} from "../lib/storage";
import {createLimiter} from "../lib/http";
import {withLock} from "../lib/locks";
import {loadMyCollection} from "../state/collection";
import {newId} from "../state/profiles";
import {themeSet, isTheme} from "../state/themes";
import {
  matchesFamilyRule,
  compactCard,
  familyToShare,
  familyFromShare,
  encodeShareCode,
  decodeShareCode,
  ensureTags,
  insertLinks,
  isFriendTag,
  DOUBLON,
} from "../../../../core";

// list : [{id, name, kind: "manual"|"smart", rule, cards: [{id, title, rarity, category, image_url}], cover, updatedAt}]
export const families = persistentStore("families", {list: []});

const update = (id, fn) => families.set((s) => ({list: s.list.map((f) => (f.id === id ? {...fn(f), updatedAt: Date.now()} : f))}));

export function createFamily({name, kind = "manual", rule = null}) {
  const family = {id: newId(), name: name.trim(), kind, rule, cards: [], cover: null, updatedAt: Date.now()};
  families.set((s) => ({list: [...s.list, family]}));
  return family;
}
export const renameFamily = (id, name) => update(id, (f) => ({...f, name}));
export const setRule = (id, rule) => update(id, (f) => ({...f, rule}));
export const setCover = (id, cardId) => update(id, (f) => ({...f, cover: cardId}));
export const deleteFamily = (id) => families.set((s) => ({list: s.list.filter((f) => f.id !== id)}));
export const addCard = (id, card) =>
  update(id, (f) => (f.cards.some((c) => c.id === (card.id || card.card_id)) ? f : {...f, cards: [...f.cards, compactCard(card)]}));
export const removeCard = (id, cardId) => update(id, (f) => ({...f, cards: f.cards.filter((c) => c.id !== cardId)}));

// Recherche dans le catalogue du site (50 cartes par page)
export async function searchCatalog(q, {page = 0, rarities = []} = {}) {
  const res = await site.searchCards({q, page, rarities});
  return {cards: res.cards || [], hasMore: (res.cards || []).length >= 50 || Boolean(res.searchHasMore)};
}

// Famille intelligente : parcourt la recherche du catalogue (query) et garde les cartes qui
// passent la règle (mots-clés, exclusions, thèmes, raretés). maxPages limite la charge.
export async function refreshSmartFamily(id, {maxPages = 10, onProgress, signal} = {}) {
  const family = families.get().list.find((f) => f.id === id);
  if (!family?.rule?.query?.trim()) throw new Error("Indiquez une recherche (ex. « Star Wars ») pour remplir la famille.");
  const found = new Map();
  for (let page = 0; page < maxPages; page++) {
    if (signal?.aborted) break;
    const res = await site.searchCards({q: family.rule.query.trim(), page, rarities: family.rule.rarities || [], signal});
    const cards = res.cards || [];
    for (const c of cards) if (matchesFamilyRule(c, family.rule, {themes: themeSet()})) found.set(c.id, compactCard(c));
    // Résultats visibles au fil des pages
    update(id, (f) => ({...f, cards: [...found.values()]}));
    onProgress?.({page: page + 1, maxPages, found: found.size});
    if (cards.length < 50) break;
  }
  return found.size;
}

// Cartes manquantes actuellement en vente (recherche par titre, au plus `limit` cartes)
export async function missingOnMarket(family, ownedIds, {limit = 40, onProgress, signal} = {}) {
  const missing = family.cards.filter((c) => !ownedIds.has(c.id)).slice(0, limit);
  const offers = [];
  let done = 0;
  const run = createLimiter(2);
  await Promise.all(
    missing.map((card) =>
      run(async () => {
        if (signal?.aborted) return;
        try {
          const res = await site.marketplaceSearch({q: card.title});
          for (const a of res.auctions || []) if (a.card_id === card.id && a.status === "active") offers.push({card, auction: a});
        } catch {}
        onProgress?.(++done, missing.length);
      }),
    ),
  );
  return offers.sort((a, b) => new Date(a.auction.end_at) - new Date(b.auction.end_at));
}

export const exportFamily = (family) => encodeShareCode("F", familyToShare(family));

export async function importFamily(code) {
  const {payload} = await decodeShareCode(code, "F");
  const data = familyFromShare(payload);
  const family = {id: newId(), ...data, updatedAt: Date.now()};
  families.set((s) => ({list: [...s.list, family]}));
  return family;
}

// Crée (ou complète) l'étiquette « <nom> » sur mes exemplaires des cartes de la famille.
// Étiquette personnelle : le tri automatique ne la touche jamais (un nom d'étiquette gérée par le
// tri est donc refusé, sinon le prochain retri complet retirerait ces associations).
export async function familyToTag(family, color = "#0ea5e9") {
  const name = family.name.trim();
  if (isTheme(name) || name === DOUBLON || isFriendTag(name))
    throw new Error(`« ${name} » est une étiquette gérée par le tri automatique : renommez la famille avant d'en faire une étiquette.`);
  const session = await ensureSession();
  const copies = await loadMyCollection();
  const ids = new Set(family.cards.map((c) => c.id));
  const mine = copies.filter((c) => ids.has(c.card_id));
  if (!mine.length) throw new Error("Vous ne possédez aucune carte de cette famille.");
  // Même verrou que le tri : une étiquette n'est jamais créée deux fois en parallèle
  return withLock(
    "sort",
    async () => {
      const client = tagClient(session.userId);
      const tagId = (await ensureTags(client, {[name]: color})).get(name);
      const {inserted, failed} = await insertLinks(
        client,
        mine.map((c) => ({user_card_id: c.id, tag_id: tagId})),
      );
      return {tag: name, count: inserted, failed};
    },
    {wait: true},
  );
}

// Famille manuelle à partir d'une étiquette existante (toutes ses associations, page par page)
export async function familyFromTag(tag) {
  const links = await fetchAll(`user_card_tags?select=user_card_id&tag_id=eq.${tag.id}&order=user_card_id.asc`);
  const set = new Set(links.map((l) => l.user_card_id));
  const copies = await loadMyCollection();
  const family = createFamily({name: tag.name});
  const seen = new Set();
  const cards = [];
  for (const c of copies) {
    if (!set.has(c.id) || seen.has(c.card_id)) continue;
    seen.add(c.card_id);
    cards.push(compactCard({...c.card, id: c.card_id}));
  }
  update(family.id, (f) => ({...f, cards}));
  return family;
}

export async function myTags() {
  const session = await ensureSession();
  return rest(`tags?select=id,name,color&user_id=eq.${session.userId}&order=name.asc`);
}
