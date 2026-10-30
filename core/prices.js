// Prix de marché (résumé des ventes conclues par rareté) et valeurs dérivées.
//
// Le site affiche la moyenne des 200 dernières ventes de la rareté, hors cartes shiny. Une seule vente
// aberrante suffit à fausser une moyenne (une Commune vendue 15 000 ₩) : le prix retenu ici est la
// médiane des 30 dernières ventes, la moyenne du site restant disponible pour l'affichage. Un prix
// n'est fiable qu'à partir d'un nombre minimum de ventes, sans compter les toutes premières ventes de
// la carte dans cette rareté (réglages `minSales` et `skipFirst`).
"use strict";

const {L} = require("./i18n");

const RARITIES = ["L", "UR", "SR", "R", "PC", "C"];
const RARITY_RANK = {L: 5, UR: 4, SR: 3, R: 2, PC: 1, C: 0};
// Nom de chaque rareté dans la langue courante (core/i18n.js)
const RARITY_NAMES = {L: ["Légendaire", "Legendary"], UR: ["Ultra Rare", "Ultra Rare"], SR: ["Super Rare", "Super Rare"], R: ["Rare", "Rare"], PC: ["Peu commune", "Uncommon"], C: ["Commune", "Common"]};
const RARITY_LABEL = Object.defineProperties({}, Object.fromEntries(Object.entries(RARITY_NAMES).map(([r, [fr, en]]) => [r, {get: () => L(fr, en), enumerable: true}])));
// Couleurs des raretés sur wiki-masters.com (badges, filtres et lueur des cartes), relevées le 13/10/2026.
// Reprises telles quelles dans extension/src/content/ui/panel.css (--r-L, …) et le rapport de trade_finder.js.
const RARITY_COLORS = {L: "#ffe144", UR: "#fa9931", SR: "#ed6fa3", R: "#c6a7f2", PC: "#b1cff2", C: "#b8f2d5"};
const rarityRank = (r) => RARITY_RANK[r] ?? -1;

// Ventes prises en compte : la médiane des RECENT_SALES dernières ; le site, lui, fait la moyenne des SITE_WINDOW dernières
const RECENT_SALES = 30;
const SITE_WINDOW = 200;
// Réglages par défaut (modifiables dans l'extension) : ventes nécessaires pour un prix fiable, premières ventes ignorées
const PRICE_DEFAULTS = {minSales: 3, skipFirst: 1};

const amount = (v) => (v != null && Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return Math.round(s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2);
}

// Prix d'une carte dans une rareté. summary : {RARETÉ: {average, count, latest, recent?, shiny?}}, celui de
// summarizeSales ou celui du site (moyenne seule, sans `recent` : les premières ventes ne peuvent alors pas
// être écartées). shiny : prix d'un exemplaire shiny (ventes shiny seulement).
// → null si jamais vendue (dans cette rareté et cette version), sinon
//   {price, sales, total, reliable, average, latest} : sales = ventes prises en compte, total = toutes
//   (au plus SITE_WINDOW), reliable = au moins minSales ventes prises en compte.
function priceInfo(summary, rarity, {shiny = false, minSales = PRICE_DEFAULTS.minSales, skipFirst = PRICE_DEFAULTS.skipFirst} = {}) {
  const entry = summary?.[rarity];
  const s = shiny ? entry?.shiny : entry;
  const total = Number(s?.count) || 0;
  if (!total) return null;
  let sales;
  let price;
  if (Array.isArray(s.recent)) {
    // Les ventes ignorées sont les plus anciennes ; `recent` contient les plus récentes
    sales = Math.max(0, total - Math.max(0, skipFirst));
    price = median(s.recent.slice(0, sales));
  } else {
    sales = total;
    price = amount(s.average);
  }
  return {price, sales, total, reliable: price != null && sales >= Math.max(1, minSales), average: amount(s.average), latest: amount(s.latest)};
}

// Prix fiable, ou null (jamais vendue, ou trop peu de ventes prises en compte). Seul ce prix entre dans
// les totaux, les comparaisons et les mises de départ proposées.
function marketPrice(summary, rarity, options) {
  const info = priceInfo(summary, rarity, options);
  return info?.reliable ? info.price : null;
}

// Au moins une vente conclue dans cette rareté (shiny ou non), quels que soient les réglages
const soldIn = (summary, rarity) => Boolean(Number(summary?.[rarity]?.count) || Number(summary?.[rarity]?.shiny?.count));

// Valeur d'une liste d'exemplaires : [{card_id, rarity, count?, is_shiny?}] ; prices : Map(card_id → summary) ;
// options : réglages de priceInfo. Seuls les prix fiables comptent.
function collectionValue(copies, prices, options = {}) {
  let value = 0;
  let priced = 0;
  let total = 0;
  for (const c of copies) {
    const n = Math.max(1, Number(c.count) || 1);
    total += n;
    const p = marketPrice(prices.get(c.card_id), c.rarity, {...options, shiny: Boolean(c.is_shiny)});
    if (p == null) continue;
    value += p * n;
    priced += n;
  }
  return {value, priced, total};
}

// Exemplaires jamais vendus sur le marché : aucune vente conclue dans leur rareté, ou dans aucune
// rareté (anyRarity). prices : Map(card_id → summary) ; une carte sans résumé n'a pas encore été lue.
// Renvoie {unsold, unknown} : les exemplaires jamais vendus, et ceux dont on ne sait encore rien.
function unsoldCopies(copies, prices, {anyRarity = false} = {}) {
  const unsold = [];
  const unknown = [];
  for (const c of copies) {
    const summary = prices.get(c.card_id);
    if (!summary) unknown.push(c);
    else if (anyRarity ? !Object.keys(summary).some((r) => soldIn(summary, r)) : !soldIn(summary, c.rarity)) unsold.push(c);
  }
  return {unsold, unknown};
}

// Exemplaires regroupés par carte et par rareté : [{card_id, rarity, card, count, rows}], dans l'ordre
// de première apparition. rows : les exemplaires (id de user_cards) de ce groupe.
function groupCopies(copies) {
  const groups = new Map();
  for (const c of copies) {
    const key = `${c.card_id}|${c.rarity}`;
    const group = groups.get(key) || groups.set(key, {card_id: c.card_id, rarity: c.rarity, card: c.card, count: 0, rows: []}).get(key);
    group.count += Math.max(1, Number(c.count) || 1);
    group.rows.push(c);
  }
  return [...groups.values()];
}

// Exemplaire à mettre en vente ou à défausser : le moins rare, jamais un favori (le site les
// verrouille : ni vente, ni défausse, ni échange), une carte shiny en dernier. null si tous sont en favori.
function freeCopy(rows) {
  const free = rows.filter((r) => !r.starred).sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity) || Boolean(a.is_shiny) - Boolean(b.is_shiny));
  return free[0] || null;
}

// Cartes possédées en plusieurs exemplaires, avec le nombre d'exemplaires vendables (on en garde un).
// copies : [{id, card_id, count?, starred?, rarity, …}] → [{card_id, copies, spare, rarity, starred, rows}]
// La rareté retenue est celle du plus petit exemplaire (celui qu'on vendrait en premier).
function spareCards(copies) {
  const byCard = new Map();
  for (const c of copies) {
    const entry = byCard.get(c.card_id) || byCard.set(c.card_id, {card_id: c.card_id, copies: 0, rows: [], starred: false}).get(c.card_id);
    entry.copies += Math.max(1, Number(c.count) || 1);
    entry.rows.push(c);
    entry.starred ||= Boolean(c.starred);
  }
  const spares = [];
  const byRarity = (a, b) => rarityRank(a.rarity) - rarityRank(b.rarity);
  for (const e of byCard.values()) {
    if (e.copies < 2) continue;
    // sellCopyId : l'id de user_cards attendu par le site ; null si tous les exemplaires sont en favori
    const free = freeCopy(e.rows);
    const rarity = (free || [...e.rows].sort(byRarity)[0])?.rarity || null;
    spares.push({...e, spare: e.copies - 1, rarity, sellCopyId: free?.id || null});
  }
  return spares;
}

// Résumé du marché calculé à partir des ventes conclues (table `auctions`, statut settled_sold).
// rows : [{card_id, snapshot_rarity, final_price, settled_at, is_shiny}] dans n'importe quel ordre
// Renvoie Map(card_id → {RARETÉ: {average, count, latest, recent, shiny?}}) : average, count, latest
// comme le site (moyenne, nombre et dernière des `window` dernières ventes non shiny), recent : les
// `recent` derniers prix non shiny, du plus récent au plus ancien ; shiny : {count, latest, recent}
// pour les ventes shiny, quand il y en a.
function summarizeSales(rows, {window = SITE_WINDOW, recent = RECENT_SALES} = {}) {
  const groups = new Map();
  for (const r of rows) {
    if (r.final_price == null || !r.snapshot_rarity) continue;
    const key = `${r.card_id}|${r.snapshot_rarity}`;
    (groups.get(key) || groups.set(key, []).get(key)).push(r);
  }
  const prices = (list) => list.slice(0, recent).map((r) => Number(r.final_price));
  const out = new Map();
  for (const [key, list] of groups) {
    const [cardId, rarity] = key.split("|");
    list.sort((a, b) => (a.settled_at < b.settled_at ? 1 : a.settled_at > b.settled_at ? -1 : 0));
    const normal = list.filter((r) => !r.is_shiny).slice(0, window);
    const shiny = list.filter((r) => r.is_shiny).slice(0, window);
    const entry = {
      average: normal.length ? Math.round(normal.reduce((n, r) => n + Number(r.final_price), 0) / normal.length) : null,
      count: normal.length,
      latest: normal.length ? Number(normal[0].final_price) : null,
      recent: prices(normal),
    };
    if (shiny.length) entry.shiny = {count: shiny.length, latest: Number(shiny[0].final_price), recent: prices(shiny)};
    if (!out.has(cardId)) out.set(cardId, {});
    out.get(cardId)[rarity] = entry;
  }
  return out;
}

// Poids d'une carte dans un lot de requêtes de prix : les cartes rares ont beaucoup plus de ventes.
const SALES_WEIGHT = {L: 40, UR: 25, SR: 10, R: 4, PC: 2, C: 1};
// Découpe [{id, rarity}] en lots d'au plus `maxWeight` (et `maxSize` cartes), les plus lourdes ensemble.
function priceBatches(items, {maxWeight = 120, maxSize = 150} = {}) {
  const sorted = [...items].sort((a, b) => (SALES_WEIGHT[b.rarity] || 4) - (SALES_WEIGHT[a.rarity] || 4));
  const batches = [];
  let current = [];
  let weight = 0;
  for (const it of sorted) {
    const w = SALES_WEIGHT[it.rarity] || 4;
    if (current.length && (weight + w > maxWeight || current.length >= maxSize)) {
      batches.push(current);
      current = [];
      weight = 0;
    }
    current.push(it.id);
    weight += w;
  }
  if (current.length) batches.push(current);
  return batches;
}

// Nouveautés d'un paquet. cards : cartes tirées (dans l'ordre) ; copies : Map(card_id → exemplaires
// possédés après le tirage). Une carte est nouvelle si aucun exemplaire n'existait avant ; si elle
// sort plusieurs fois, seul le premier exemplaire est nouveau.
function packNovelty(cards, copies) {
  const pulled = new Map();
  for (const c of cards) pulled.set(c.id, (pulled.get(c.id) || 0) + 1);
  const seen = new Map();
  return cards.map((c) => {
    const before = (copies.get(c.id) ?? pulled.get(c.id)) - pulled.get(c.id);
    const rank = (seen.get(c.id) || 0) + 1;
    seen.set(c.id, rank);
    return before <= 0 && rank === 1;
  });
}

module.exports = {RARITIES, RARITY_RANK, RARITY_LABEL, RARITY_COLORS, rarityRank, RECENT_SALES, PRICE_DEFAULTS, priceInfo, marketPrice, soldIn, collectionValue, unsoldCopies, groupCopies, freeCopy, spareCards, summarizeSales, priceBatches, packNovelty};
