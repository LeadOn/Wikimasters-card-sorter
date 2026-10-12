// Prix moyens de vente (résumé du marché par rareté) et valeurs dérivées.
"use strict";

const RARITIES = ["L", "UR", "SR", "R", "PC", "C"];
const RARITY_RANK = {L: 5, UR: 4, SR: 3, R: 2, PC: 1, C: 0};
const RARITY_LABEL = {L: "Légendaire", UR: "Ultra Rare", SR: "Super Rare", R: "Rare", PC: "Peu commune", C: "Commune"};
const rarityRank = (r) => RARITY_RANK[r] ?? -1;

// summary : {RARETÉ: {average, count, latest}} (réponse du site) → prix moyen pour cette rareté, ou null
function averagePrice(summary, rarity) {
  const s = summary?.[rarity];
  return s && Number.isFinite(Number(s.average)) ? Math.round(Number(s.average)) : null;
}

// Valeur d'une liste d'exemplaires : [{card_id, rarity, count?}] ; prices : Map(card_id → summary)
function collectionValue(copies, prices) {
  let value = 0;
  let priced = 0;
  let total = 0;
  for (const c of copies) {
    const n = Math.max(1, Number(c.count) || 1);
    total += n;
    const p = averagePrice(prices.get(c.card_id), c.rarity);
    if (p == null) continue;
    value += p * n;
    priced += n;
  }
  return {value, priced, total};
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
  for (const e of byCard.values()) {
    if (e.copies < 2) continue;
    const rarity = e.rows.map((r) => r.rarity).sort((a, b) => rarityRank(a) - rarityRank(b))[0] || null;
    spares.push({...e, spare: e.copies - 1, rarity});
  }
  return spares;
}

// Résumé du marché calculé à partir des ventes conclues (table `auctions`, statut settled_sold),
// identique à celui du site : par rareté, moyenne des `window` dernières ventes, nombre et dernière.
// rows : [{card_id, snapshot_rarity, final_price, settled_at}] dans n'importe quel ordre
// Renvoie Map(card_id → {RARETÉ: {average, count, latest}})
function summarizeSales(rows, {window = 200} = {}) {
  const groups = new Map();
  for (const r of rows) {
    if (r.final_price == null || !r.snapshot_rarity) continue;
    const key = `${r.card_id}|${r.snapshot_rarity}`;
    (groups.get(key) || groups.set(key, []).get(key)).push(r);
  }
  const out = new Map();
  for (const [key, list] of groups) {
    const [cardId, rarity] = key.split("|");
    list.sort((a, b) => (a.settled_at < b.settled_at ? 1 : a.settled_at > b.settled_at ? -1 : 0));
    const recent = list.slice(0, window);
    const average = Math.round(recent.reduce((n, r) => n + Number(r.final_price), 0) / recent.length);
    if (!out.has(cardId)) out.set(cardId, {});
    out.get(cardId)[rarity] = {average, count: recent.length, latest: Number(recent[0].final_price)};
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

module.exports = {RARITIES, RARITY_RANK, RARITY_LABEL, rarityRank, averagePrice, collectionValue, spareCards, summarizeSales, priceBatches, packNovelty};
