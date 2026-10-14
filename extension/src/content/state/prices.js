// Prix du marché : résumé des ventes par carte et par rareté, mis en cache.
//
// Source principale : les ventes conclues de la table Supabase `auctions`, lues par lots de cartes
// (une requête pour des dizaines de cartes) et résumées par core/prices.js (médiane des dernières
// ventes, hors shiny ; prix shiny à part). La route du site (/api/marketplace/cards/<id>/sales?scope=summary)
// met ~12 s par carte et ne donne qu'une moyenne : elle ne sert qu'en dernier recours, pour une carte isolée.
// Les résumés que le site charge lui-même servent aussi, pour une carte sans prix récent.
// Un prix n'est retenu qu'à partir du nombre de ventes réglé (réglages minSales et skipFirstSales).
import {site} from "../api/site";
import {rest} from "../api/supabase";
import {createStore} from "../lib/store";
import {createLimiter} from "../lib/http";
import {load, save, update, remove} from "../lib/storage";
import {on} from "../lib/bus";
import {lookupId} from "../lib/registry";
import {settings} from "./settings";
import {priceInfo as computePriceInfo, summarizeSales, priceBatches} from "../../../../core/prices";

// Format des résumés changé (prix shiny à part, dernières ventes) : les anciens sont abandonnés
const KEY = "prices-v2";
remove("prices");
// Le serveur renvoie souvent des erreurs passagères : un prix en échec est redemandé après 5 min
const ERROR_RETRY = 5 * 60 * 1000;
// Au-delà, une entrée est oubliée (le cache ne grossit pas indéfiniment)
const MAX_KEEP = 30 * 24 * 3600 * 1000;
const PAGE = 1000;
const cache = new Map(); // card_id → {s: summary, t: date, err?}
export const priceVersion = createStore({v: 0, loaded: false});

// Enregistrement au plus toutes les 2 s, y compris pendant un long chargement (un délai remis à
// zéro à chaque prix n'enregistrerait rien avant la fin). Seules les entrées modifiées sont écrites,
// fusionnées avec le cache enregistré : les prix chargés par un autre onglet sont conservés.
const dirty = new Set();
let flushTimer = null;
function touch(cardId) {
  priceVersion.set((s) => ({...s, v: s.v + 1}));
  if (cardId) dirty.add(cardId);
  flushTimer ||= setTimeout(flush, 2000);
}
async function flush() {
  flushTimer = null;
  if (!dirty.size) return;
  const ids = [...dirty];
  dirty.clear();
  await update(KEY, {}, (stored) => {
    for (const id of ids) {
      const entry = cache.get(id);
      if (entry && !(stored[id]?.t > entry.t)) stored[id] = entry;
    }
    return stored;
  }).catch(() => {});
}
// Dernier enregistrement quand l'onglet est fermé ou caché
addEventListener("pagehide", flush);
document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());

export const ready = load(KEY, {}).then((saved) => {
  const cutoff = Date.now() - MAX_KEEP;
  const expired = [];
  for (const [id, v] of Object.entries(saved || {})) {
    if (!v || !(v.t > cutoff)) expired.push(id);
    else if (!cache.has(id)) cache.set(id, v);
  }
  priceVersion.set((s) => ({v: s.v + 1, loaded: true}));
  if (expired.length)
    update(KEY, {}, (stored) => {
      for (const id of expired) if (!(stored[id]?.t > cutoff)) delete stored[id];
      return stored;
    }).catch(() => {});
});

const maxAge = () => settings.get().priceMaxAgeHours * 3600 * 1000;
const isFresh = (entry) => entry && Date.now() - entry.t < (entry.err ? ERROR_RETRY : maxAge());

// Réglages de fiabilité des prix, à passer aux fonctions de core/prices.js
export const priceOptions = () => {
  const s = settings.get();
  return {minSales: s.minSales, skipFirst: s.skipFirstSales};
};
// Réglages modifiés : les prix affichés sont recalculés
let rule = JSON.stringify(priceOptions());
settings.subscribe(() => {
  const next = JSON.stringify(priceOptions());
  if (next !== rule) {
    rule = next;
    priceVersion.set((s) => ({...s, v: s.v + 1}));
  }
});

export const summaryOf = (cardId) => cache.get(cardId)?.s || null;
// {price, sales, total, reliable, average, latest} (core/prices.js → priceInfo), null si jamais vendue
// ou pas encore lue. shiny : prix d'un exemplaire shiny.
export const priceInfo = (cardId, rarity, {shiny = false} = {}) => computePriceInfo(summaryOf(cardId), rarity, {...priceOptions(), shiny: Boolean(shiny)});
// Prix fiable (assez de ventes), ou null : le seul qui entre dans les totaux et les décisions
export function priceOf(cardId, rarity, options) {
  const info = priceInfo(cardId, rarity, options);
  return info?.reliable ? info.price : null;
}
export const hasFreshPrice = (cardId) => isFresh(cache.get(cardId));
// "ok" (prix fiable), "few" (vendue, mais trop peu de ventes prises en compte), "none" (aucune vente
// pour cette rareté), "error" (lecture impossible), "unknown" (pas encore lu)
export function priceStatus(cardId, rarity, options) {
  const entry = cache.get(cardId);
  if (!entry) return "unknown";
  const info = priceInfo(cardId, rarity, options);
  if (info) return info.reliable ? "ok" : "few";
  return entry.err ? "error" : "none";
}
// Prix à afficher sur une carte (props de CardRow) : le prix fiable, sinon le prix indicatif signalé
// comme tel (uncertain : explication), sinon rien
export function pricing(cardId, rarity, options) {
  const info = priceInfo(cardId, rarity, options);
  if (!info || info.price == null) return {price: null};
  if (info.reliable) return {price: info.price};
  return {price: info.price, uncertain: uncertainNote(info)};
}
export function uncertainNote(info) {
  const ignored = info.total - info.sales;
  return `Prix indicatif : ${info.sales} vente${info.sales > 1 ? "s" : ""} prise${info.sales > 1 ? "s" : ""} en compte${ignored ? ` (${ignored} première${ignored > 1 ? "s" : ""} ignorée${ignored > 1 ? "s" : ""})` : ""}, il en faut ${priceOptions().minSales} pour un prix fiable.`;
}
export const priceMap = () => new Map([...cache].map(([id, v]) => [id, v.s]));

function store(cardId, summary) {
  cache.set(cardId, {s: summary || {}, t: Date.now()});
  touch(cardId);
}
function markError(cardId) {
  cache.set(cardId, {s: cache.get(cardId)?.s || null, t: Date.now(), err: true});
  touch(cardId);
}

// Résumés que le site charge lui-même (fiche de mise en vente) : gratuits, mais réduits à une moyenne
// qui compte les toutes premières ventes. Ils ne remplacent jamais un prix récent.
on("sales-summary", ({data, match}) => {
  const entry = cache.get(match[1]);
  if (data?.summary && !(entry && !entry.err && isFresh(entry))) store(match[1], data.summary);
});

// --- Lecture groupée
const inflight = new Set();
const runBatch = createLimiter(3);
let directSource = true; // passe à false si la table `auctions` n'est plus lisible

// Ventes conclues d'un lot de cartes, triées par carte puis date, page par page
async function readSales(ids, signal) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await rest(
      `auctions?select=id,card_id,snapshot_rarity,final_price,settled_at,is_shiny&status=eq.settled_sold&card_id=in.(${ids.join(",")})&order=card_id,settled_at.desc,id&limit=${PAGE}&offset=${offset}`,
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

// Lot trop lourd pour le serveur (délai dépassé) : il est coupé en deux, et une carte seule passe
// par la route du site. Toute autre erreur (réseau, serveur en panne) marque simplement le lot en
// échec, sans multiplier les requêtes : il sera redemandé quelques minutes plus tard.
const tooHeavy = (e) => e.code === "57014" || e.code === "timeout" || [504, 522, 524].includes(e.status);

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
    // Table des ventes plus lisible (droits modifiés par le site) : route du site, plus lente
    if (e.status === 403 || e.status === 404) {
      directSource = false;
      return fetchBatch(ids, signal);
    }
    if (!tooHeavy(e)) {
      for (const id of ids) markError(id);
      return;
    }
    if (ids.length > 1) {
      const mid = Math.ceil(ids.length / 2);
      await fetchBatch(ids.slice(0, mid), signal);
      await fetchBatch(ids.slice(mid), signal);
    } else {
      await siteSummary(ids[0], signal);
    }
  }
}

function runBatches(batches, {signal, onBatch} = {}) {
  return Promise.all(
    batches.map((ids) =>
      runBatch(async () => {
        if (signal?.aborted) return;
        for (const id of ids) inflight.add(id);
        try {
          await fetchBatch(ids, signal);
        } catch {
          // Annulé : les cartes restent sans prix
        } finally {
          for (const id of ids) inflight.delete(id);
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
  dirty.clear();
  await save(KEY, {});
  touch();
}
