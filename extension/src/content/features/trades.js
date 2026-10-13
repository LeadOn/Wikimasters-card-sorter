// Recherche d'échanges avec un ami (équivalent de scripts/trade_finder.js) et échanges en cours.
import {site} from "../api/site";
import {rest} from "../api/supabase";
import {runAll} from "../lib/http";
import {createStore} from "../lib/store";
import {load, save} from "../lib/storage";
import {ensureSession} from "../lib/session";
import {on} from "../lib/bus";
import {loadMyCollection} from "../state/collection";
import {activeProfiles, profileFor} from "../state/profiles";
import {priceMap} from "../state/prices";
import {findTrades, tagForProfile} from "../../../../core";

const MAX_AGE_H = 12;
const CONCURRENCY = 6;

export const friendsState = createStore({list: null, loading: false, error: null});
export const tradeState = createStore({friend: null, running: false, step: "", progress: null, result: null, error: null});

export async function loadFriends() {
  friendsState.set({loading: true, error: null});
  try {
    const session = await ensureSession();
    const {friendships = []} = await site.friends();
    const list = friendships
      .filter((f) => f.status === "accepted")
      .map((f) => (f.requester?.id === session.userId ? f.addressee : f.requester))
      .filter(Boolean)
      .sort((a, b) => a.username.localeCompare(b.username));
    friendsState.set({list});
    return list;
  } catch (e) {
    friendsState.set({error: e.message});
    throw e;
  } finally {
    friendsState.set({loading: false});
  }
}

const cacheKey = (username, rarities) => `friend:${username.toLowerCase()}${rarities.length ? `:${[...rarities].sort().join("-")}` : ""}`;

const compact = (it) => ({
  id: it.id,
  card_id: it.card_id,
  count: it.count || 1,
  is_shiny: Boolean(it.is_shiny),
  card: {
    id: it.card?.id || it.card_id,
    wikipedia_title: it.card?.wikipedia_title,
    category: it.card?.category,
    rarity: it.card?.rarity,
    image_url: it.card?.hide_image ? null : it.card?.image_url,
    wikipedia_url: it.card?.wikipedia_url,
    pageviews: it.card?.pageviews,
  },
});

// Collection d'un ami, mise en cache page par page (reprise possible après une interruption)
async function friendCollection(username, {rarities, refresh, signal}) {
  const key = cacheKey(username, rarities);
  let cache = refresh ? null : await load(key, null);
  const usable = cache && typeof cache.pages === "object" && Number.isInteger(cache.pageCount) && cache.summaries && typeof cache.summaries === "object";
  if (!usable || (Date.now() - new Date(cache.fetched_at)) / 3.6e6 > MAX_AGE_H) cache = null;
  if (!cache) {
    tradeState.set({step: `Lecture de la collection de ${username}`, progress: null});
    const first = await site.profileCollection(username, 0, {rarities, stats: true, signal});
    if (!Array.isArray(first?.collection)) throw new Error(`Collection de ${username} : réponse inattendue du site.`);
    const pageSize = first.collection.length || 50;
    const total = Number(first.total) || 0;
    cache = {
      fetched_at: new Date().toISOString(),
      total,
      pageCount: Math.ceil(total / pageSize),
      pendingTradeCardIds: first.pendingTradeCardIds || [],
      pages: {0: first.collection.map(compact)},
      summaries: {},
    };
    await save(key, cache).catch(() => {});
  }
  const missing = [];
  for (let p = 0; p < cache.pageCount; p++) if (!cache.pages[p]) missing.push(p);
  let done = cache.pageCount - missing.length;
  // Enregistrement au plus toutes les 1,5 s : une lecture interrompue reprend où elle s'était arrêtée
  let saveTimer = null;
  const persist = () => {
    saveTimer ||= setTimeout(() => {
      saveTimer = null;
      save(key, cache).catch(() => {});
    }, 1500);
  };
  const progress = () => tradeState.set({step: `Collection de ${username} : ${cache.total.toLocaleString("fr-FR")} cartes`, progress: {done, total: cache.pageCount}});
  progress();
  try {
    // À la première page en échec (après réessais), plus aucune page n'est demandée
    await runAll(
      missing,
      async (p) => {
        const res = await site.profileCollection(username, p, {rarities, signal});
        if (!Array.isArray(res?.collection)) throw new Error(`Collection de ${username} : réponse inattendue du site (page ${p + 1}).`);
        cache.pages[p] = res.collection.map(compact);
        done++;
        progress();
        persist();
      },
      {concurrency: CONCURRENCY, signal},
    );
  } finally {
    clearTimeout(saveTimer);
    await save(key, cache).catch(() => {});
  }
  // La pagination par décalage peut renvoyer deux fois une carte si la collection bouge pendant la lecture
  const items = new Map();
  for (const page of Object.values(cache.pages)) for (const it of page) items.set(it.id, it);
  return {cache, key, items: [...items.values()]};
}

// Résumés Wikipédia (absents de la route du site), lus dans la table `cards`, tronqués
async function loadSummaries(cardIds, cache, key, signal) {
  const todo = [...new Set(cardIds)].filter((id) => !(id in cache.summaries));
  const batches = [];
  for (let i = 0; i < todo.length; i += 100) batches.push(todo.slice(i, i + 100));
  let done = 0;
  // Un résumé illisible n'empêche pas l'analyse (la carte est classée sur sa description) ;
  // il sera redemandé à la prochaine recherche.
  await runAll(
    batches,
    async (ids) => {
      try {
        const rows = await rest(`cards?select=id,summary&id=in.(${ids.join(",")})`, {retries: 4, signal});
        for (const r of rows) cache.summaries[r.id] = (r.summary || "").slice(0, 1000);
      } catch (e) {
        if (e.name === "AbortError") throw e;
      }
      done += ids.length;
      tradeState.set({step: "Lecture des résumés des cartes", progress: {done, total: todo.length}});
    },
    {concurrency: 4, signal},
  );
  await save(key, cache).catch(() => {});
}

// themes : null → mon tag « Pour : <moi> » ; sinon liste de thèmes génériques recherchés
export async function findTradesWith(friend, {themes = null, rarities = [], refresh = false, signal} = {}) {
  tradeState.set({friend: friend.username, running: true, result: null, error: null, step: "Préparation", progress: null});
  try {
    const session = await ensureSession();
    const profiles = activeProfiles();
    const myProfile = profileFor(session.username);
    const wanted = themes?.length ? themes : myProfile ? [tagForProfile(myProfile)] : null;
    if (!wanted) throw new Error("Définissez d'abord votre profil d'intérêts (onglet Profils), ou choisissez des thèmes à rechercher.");
    const friendProfile = profileFor(friend.username);
    const friendTag = friendProfile ? tagForProfile(friendProfile) : null;

    tradeState.set({step: "Lecture de ma collection et de ma liste de souhaits"});
    const [copies, wishlist] = await Promise.all([loadMyCollection({withSummary: true}), rest("wishlist_items?select=card_id").catch(() => [])]);
    const mine = copies.map((c) => ({id: c.id, card_id: c.card_id, count: c.count, cards: c.card}));
    const {cache, key, items} = await friendCollection(friend.username, {rarities, refresh, signal});
    const myIds = new Set(mine.map((m) => m.card_id));
    await loadSummaries(items.filter((it) => !myIds.has(it.card_id)).map((it) => it.card_id), cache, key, signal);

    tradeState.set({step: "Analyse", progress: null});
    const result = findTrades({
      mine,
      friendItems: items,
      summaries: new Map(Object.entries(cache.summaries)),
      wishlist: new Set(wishlist.map((w) => w.card_id)),
      pending: new Set(cache.pendingTradeCardIds),
      wanted,
      friendTag,
      profiles,
      rarities,
      prices: priceMap(),
    });
    const full = {...result, wanted, friendTag, friend: friend.username, fetchedAt: cache.fetched_at, total: cache.total, rarities};
    tradeState.set({result: full, step: "", progress: null});
    return full;
  } catch (e) {
    if (e.name !== "AbortError") tradeState.set({error: e.message});
    throw e;
  } finally {
    tradeState.set({running: false});
  }
}

// --- Échanges en cours (valeur de chaque côté)
export const activeTrades = createStore({list: null, at: 0});
// `/api/trades?active=1` (compteurs du site) n'a ni la rareté ni la carte : seule la liste complète compte
on("trades", ({data, path}) => {
  if (!path.includes("active=1") && Array.isArray(data?.trades)) activeTrades.set({list: data.trades, at: Date.now()});
});
export async function refreshTrades() {
  const res = await site.trades();
  if (!Array.isArray(res?.trades)) throw new Error("Échanges : réponse inattendue du site.");
  activeTrades.set({list: res.trades, at: Date.now()});
  return res.trades;
}
