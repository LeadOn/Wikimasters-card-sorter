// Familles : groupes de cartes à collectionner (manuelles ou intelligentes), partage par code,
// cartes manquantes en vente ou ajoutées à la liste de souhaits, conversion en étiquette WikiMasters.
import {site} from "../api/site";
import {rest, fetchAll, tagClient} from "../api/supabase";
import {ensureSession} from "../lib/session";
import {persistentStore} from "../lib/storage";
import {createStore} from "../lib/store";
import {createLimiter} from "../lib/http";
import {withLock} from "../lib/locks";
import {loadMyCollection} from "../state/collection";
import {newId} from "../state/profiles";
import {themeSet, isTheme} from "../state/themes";
import {
  matchesFamilyRule,
  titleHasWords,
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
import {L} from "../../shared/i18n";

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
export async function searchCatalog(q, {page = 0, rarities = [], signal} = {}) {
  const res = await site.searchCards({q, page, rarities, signal});
  return {cards: res.cards || [], hasMore: (res.cards || []).length >= 50 || Boolean(res.searchHasMore)};
}

// Titre exact : la recherche du site classe ses résultats par ordre alphabétique et lit des morceaux
// de mots, si bien que « Mars » n'arrive qu'après des centaines de « … mars … ». On lit donc
// directement dans le catalogue la carte au titre exact et ses homonymes « Mars (…) ». Un titre de
// Wikipédia commence par une majuscule : on essaie la recherche telle quelle et avec une majuscule.
const CATALOG_FIELDS = "id,wikipedia_title,category,rarity,image_url,hide_image";
const quoted = (v) => `"${v.replace(/["\\]/g, "\\$&")}"`;
export async function searchExactTitle(q, {signal} = {}) {
  const typed = q.trim().replace(/\s+/g, " ");
  if (!typed) return [];
  const upper = typed[0].toLocaleUpperCase() + typed.slice(1);
  const variants = [...new Set([typed, upper])];
  const exact = rest(`cards?select=${CATALOG_FIELDS}&wikipedia_title=in.(${encodeURIComponent(variants.map(quoted).join(","))})&order=id.asc`, {retries: 2, signal});
  // « * » est le joker de PostgREST : pas de recherche d'homonymes pour une recherche qui en contient
  const homonyms = typed.includes("*")
    ? Promise.resolve([])
    : rest(`cards?select=${CATALOG_FIELDS}&wikipedia_title=like.${encodeURIComponent(`${upper.replace(/[\\%_]/g, "\\$&")} (*`)}&order=wikipedia_title.asc,id.asc&limit=100`, {retries: 2, signal});
  const [a, b] = await Promise.all([exact, homonyms]);
  return [...a, ...b].map((c) => ({...c, image_url: c.hide_image ? null : c.image_url}));
}

// Recherche au mot exact : le site renvoie aussi les cartes où la recherche n'est qu'un morceau de
// mot (« Mars » → « Marseille »), si bien que la carte voulue peut se trouver à la 30e page. On
// parcourt les pages à partir de `page` et on garde les cartes dont le titre contient la recherche
// en mots entiers, jusqu'à en avoir `want` ou avoir lu `maxPages` pages (charge limitée).
// nextPage : page où reprendre la recherche. Interrompue (signal), renvoie ce qui a été trouvé.
export async function searchCatalogExact(q, {page = 0, want = 20, maxPages = 10, onProgress, signal} = {}) {
  const cards = [];
  let next = page;
  let hasMore = true;
  while (hasMore && cards.length < want && next - page < maxPages) {
    let res;
    try {
      res = await searchCatalog(q, {page: next, signal});
    } catch (e) {
      // Arrêtée par le joueur : les cartes déjà trouvées sont gardées
      if (signal?.aborted) break;
      throw e;
    }
    cards.push(...res.cards.filter((c) => titleHasWords(c.wikipedia_title || c.title || "", q)));
    hasMore = res.hasMore;
    next++;
    onProgress?.({pages: next - page, found: cards.length});
  }
  return {cards, nextPage: next, hasMore};
}

// Famille intelligente : parcourt la recherche du catalogue (query) et garde les cartes qui
// passent la règle (mots-clés, exclusions, thèmes, raretés). maxPages limite la charge.
export async function refreshSmartFamily(id, {maxPages = 10, onProgress, signal} = {}) {
  const family = families.get().list.find((f) => f.id === id);
  if (!family?.rule?.query?.trim()) throw new Error(L("Indiquez une recherche (ex. « Star Wars ») pour remplir la famille.", "Enter a search (e.g. \"Star Wars\") to fill the family."));
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

// Liste de souhaits du site (table Supabase wishlist_items) : ids des cartes souhaitées, null tant
// qu'elle n'a pas été lue. Le site prévient quand une carte de la liste est mise en vente.
export const wishlist = createStore({ids: null});

export async function loadWishlist() {
  const session = await ensureSession();
  const rows = await fetchAll(`wishlist_items?select=card_id&user_id=eq.${session.userId}&order=card_id.asc`, {key: "card_id"});
  const ids = new Set(rows.map((r) => r.card_id));
  wishlist.set({ids});
  return ids;
}

// Cartes manquantes d'une famille à ajouter à la liste de souhaits, d'après la collection et la
// liste relues : {toAdd: [carte], wished, owned} (wished : manquantes déjà souhaitées).
export async function planWishlist(family) {
  const [copies, wished] = await Promise.all([loadMyCollection(), loadWishlist()]);
  const ownedIds = new Set(copies.map((c) => c.card_id));
  const missing = family.cards.filter((c) => !ownedIds.has(c.id));
  const toAdd = missing.filter((c) => !wished.has(c.id));
  return {toAdd, wished: missing.length - toAdd.length, owned: family.cards.length - missing.length};
}

// Ajout à la liste de souhaits, sur clic du joueur, comme le bouton « Ajouter aux souhaits » du site :
// une carte déjà présente est ignorée (rejouer l'ajout est sans risque). Lots de 100, arrêt à la
// première erreur : renvoie le nombre de cartes ajoutées, ou lève l'erreur avec `added`.
export async function addToWishlist(cardIds, {onProgress} = {}) {
  const session = await ensureSession();
  const ids = [...new Set(cardIds)];
  let added = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    try {
      await rest("wishlist_items?on_conflict=user_id,card_id", {
        method: "POST",
        body: batch.map((card_id) => ({user_id: session.userId, card_id})),
        prefer: "resolution=ignore-duplicates,return=minimal",
        retries: 3,
      });
    } catch (e) {
      // Lot incertain ou refusé : la liste est relue plutôt que supposée
      loadWishlist().catch(() => {});
      throw Object.assign(e, {added});
    }
    added += batch.length;
    const now = new Set(wishlist.get().ids || []);
    for (const id of batch) now.add(id);
    wishlist.set({ids: now});
    onProgress?.(added, ids.length);
  }
  return added;
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
    throw new Error(
      L(
        `« ${name} » est une étiquette gérée par le tri automatique : renommez la famille avant d'en faire une étiquette.`,
        `"${name}" is a tag managed by automatic sorting: rename the family before turning it into a tag.`,
      ),
    );
  const session = await ensureSession();
  const copies = await loadMyCollection();
  const ids = new Set(family.cards.map((c) => c.id));
  const mine = copies.filter((c) => ids.has(c.card_id));
  if (!mine.length) throw new Error(L("Vous ne possédez aucune carte de cette famille.", "You don't own any card from this family."));
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
