// Prix moyens de vente : résumé du marché par carte et par rareté, mis en cache.
//
// Source principale : les ventes conclues de la table Supabase `auctions`, lues par lots de cartes
// (une requête pour des dizaines de cartes) et résumées comme le fait le site (moyenne des
// 200 dernières ventes par rareté). La route du site (/api/marketplace/cards/<id>/sales?scope=summary)
// met ~12 s par carte : elle ne sert qu'en dernier recours, pour une carte isolée.
// Les résumés que le site charge lui-même sont aussi récupérés au passage.
import {site} from "../api/site";
import {rest} from "../api/supabase";
import {createStore} from "../lib/store";
import {createLimiter} from "../lib/http";
import {load, save} from "../lib/storage";
import {on} from "../lib/bus";
import {lookupId} from "../lib/registry";
import {settings} from "./settings";
import {averagePrice, summarizeSales, priceBatches} from "../../../../core/prices";

const KEY = "prices";
// Le serveur renvoie souvent des erreurs passagères : un prix en échec est redemandé après 5 min
const ERROR_RETRY = 5 * 60 * 1000;
const PAGE = 1000;
const cache = new Map(); // card_id → {s: summary, t: date, err?}
export const priceVersion = createStore({v: 0, loaded: false});
export const queueState = createStore({pending: 0, paused: false});

let dirty = false;
let flushTimer = null;
function touch() {
  priceVersion.set((s) => ({...s, v: s.v + 1}));
  dirty = true;
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 2000);
}
async function flush() {
  if (!dirty) return;
  dirty = false;
  await save(KEY, Object.fromEntries(cache)).catch(() => {});
}

export const ready = load(KEY, {}).then((saved) => {
  for (const [id, v] of Object.entries(saved)) if (!cache.has(id)) cache.set(id, v);
  priceVersion.set((s) => ({v: s.v + 1, loaded: true}));
});

const maxAge = () => settings.get().priceMaxAgeHours * 3600 * 1000;
const isFresh = (entry) => entry && Date.now() - entry.t < (entry.err ? ERROR_RETRY : maxAge());

export const summaryOf = (cardId) => cache.get(cardId)?.s || null;
export const priceOf = (cardId, rarity) => averagePrice(summaryOf(cardId), rarity);
export const pricedAt = (cardId) => cache.get(cardId)?.t || null;
export const hasFreshPrice = (cardId) => isFresh(cache.get(cardId));
// "ok" (prix connu), "none" (aucune vente pour cette rareté), "error" (lecture impossible), "unknown" (pas encore lu)
export function priceStatus(cardId, rarity) {
  const entry = cache.get(cardId);
  if (!entry) return "unknown";
  if (averagePrice(entry.s, rarity) != null) return "ok";
  return entry.err ? "error" : "none";
}
export const priceMap = () => new Map([...cache].map(([id, v]) => [id, v.s]));

function store(cardId, summary) {
  cache.set(cardId, {s: summary || {}, t: Date.now()});
  touch();
}
function markError(cardId) {
  cache.set(cardId, {s: cache.get(cardId)?.s || null, t: Date.now(), err: true});
  touch();
}

// Résumés que le site charge lui-même (fiche de mise en vente) : gratuits
on("sales-summary", ({data, match}) => data?.summary && store(match[1], data.summary));

// --- Lecture groupée
const inflight = new Set();
const runBatch = createLimiter(3);
let directSource = true; // passe à false si la table `auctions` n'est plus lisible
const updateQueue = () => queueState.set({pending: inflight.size + pending.size, paused: false});

// Ventes conclues d'un lot de cartes, triées par carte puis date, page par page
async function readSales(ids, signal) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await rest(
      `auctions?select=card_id,snapshot_rarity,final_price,settled_at&status=eq.settled_sold&card_id=in.(${ids.join(",")})&order=card_id,settled_at.desc&limit=${PAGE}&offset=${offset}`,
      {signal, retries: 2},
    );
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

async function siteSummary(id, signal) {
  try {
    const res = await site.salesSummary(id, {signal});
    store(id, res?.summary || {});
  } catch (e) {
    if (e.name === "AbortError") throw e;
    markError(id);
  }
}

// Un lot trop lourd (délai du serveur dépassé) est coupé en deux ; une carte seule passe par la route du site.
async function fetchBatch(ids, signal) {
  if (!directSource) {
    for (const id of ids) await siteSummary(id, signal);
    return;
  }
  try {
    const summaries = summarizeSales(await readSales(ids, signal));
    for (const id of ids) store(id, summaries.get(id) || {});
  } catch (e) {
    if (e.name === "AbortError") throw e;
    if ([401, 403, 404].includes(e.status)) directSource = false;
    if (ids.length > 1 && directSource) {
      const mid = Math.ceil(ids.length / 2);
      await fetchBatch(ids.slice(0, mid), signal);
      await fetchBatch(ids.slice(mid), signal);
    } else {
      for (const id of ids) await siteSummary(id, signal);
    }
  }
}

function runBatches(batches, {signal, onBatch} = {}) {
  return Promise.all(
    batches.map((ids) =>
      runBatch(async () => {
        if (signal?.aborted) return;
        for (const id of ids) inflight.add(id);
        updateQueue();
        try {
          await fetchBatch(ids, signal);
        } catch {
          // Annulé : les cartes restent sans prix
        } finally {
          for (const id of ids) inflight.delete(id);
          updateQueue();
          onBatch?.(ids.length);
        }
      }),
    ),
  );
}

// Rareté connue d'une carte (pour dimensionner les lots)
const rarityOf = (id, rarity) => rarity || lookupId(id)?.rarity || null;
const toItems = (list) => list.map((x) => (typeof x === "string" ? {id: x, rarity: rarityOf(x)} : {id: x.id, rarity: rarityOf(x.id, x.rarity)}));

// --- Demandes ponctuelles (badges, récapitulatifs) : regroupées toutes les 400 ms
const pending = new Map(); // id → rareté
let pendingTimer = null;
export function requestPrice(cardId, {force = false, rarity = null} = {}) {
  if (!cardId || inflight.has(cardId) || pending.has(cardId) || (!force && isFresh(cache.get(cardId)))) return;
  pending.set(cardId, rarityOf(cardId, rarity));
  updateQueue();
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    const items = [...pending].map(([id, r]) => ({id, rarity: r}));
    pending.clear();
    runBatches(priceBatches(items));
  }, 400);
}

// Chargement en masse avec progression. items : ids, ou {id, rarity} (lots mieux dimensionnés).
// Renvoie le nombre de cartes traitées.
export async function loadPrices(items, {force = false, onProgress, signal} = {}) {
  const seen = new Set();
  const todo = toItems(items).filter((it) => {
    if (!it.id || seen.has(it.id)) return false;
    seen.add(it.id);
    return !inflight.has(it.id) && (force || !isFresh(cache.get(it.id)));
  });
  if (!todo.length) return 0;
  let done = 0;
  onProgress?.(0, todo.length);
  await runBatches(priceBatches(todo), {
    signal,
    onBatch: (n) => {
      done += n;
      onProgress?.(done, todo.length);
    },
  });
  return done;
}

export async function clearPrices() {
  cache.clear();
  await save(KEY, {});
  touch();
}
