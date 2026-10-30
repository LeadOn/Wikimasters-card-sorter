// Historique d'achat-revente au marché (page « Stonks » de l'extension) : opérations du joueur,
// appariement de chaque vente avec son achat, plus-value, regroupement par jour, semaine ou mois.
// Fonctions pures : aucune lecture réseau, aucune écriture.
"use strict";

const {L} = require("./i18n");

const UNITS = ["day", "week", "month"];

const amount = (v) => (v != null && Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);

// Enchères conclues du joueur → opérations, de la plus ancienne à la plus récente.
// rows : [{id, card_id, snapshot_rarity, final_price, settled_at, is_shiny, seller_id, winner_id}]
// (table `auctions`, statut settled_sold) ; me : id du joueur. Une enchère où il est à la fois vendeur
// et acheteur (impossible sur le site) ne compte pas.
// → [{id, side: "buy" | "sell", cardId, rarity, shiny, price, at (ms)}]
function ledger(rows, me) {
  const ops = [];
  const seen = new Set();
  for (const r of rows || []) {
    if (!r?.id || seen.has(r.id)) continue;
    const price = amount(r.final_price);
    const at = Date.parse(r.settled_at);
    const sell = r.seller_id === me;
    const buy = r.winner_id === me;
    if (price == null || !Number.isFinite(at) || sell === buy) continue;
    seen.add(r.id);
    ops.push({id: r.id, side: buy ? "buy" : "sell", cardId: r.card_id, rarity: r.snapshot_rarity || null, shiny: Boolean(r.is_shiny), price, at});
  }
  return ops.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
}

// Appariement « premier entré, premier sorti » : chaque vente est rattachée au plus ancien achat
// encore en stock de la même carte, dans la même rareté et la même version (shiny ou non), acheté
// avant elle. Une vente sans achat correspondant vient d'un paquet, d'un échange ou d'avant
// l'historique : elle n'a pas de prix de revient.
// → {ops : opérations complétées (ventes : cost, profit, buyId, boughtAt, heldMs ; achats : soldId, soldAt),
//    open : achats pas encore revendus}
function matchTrades(ops) {
  const stock = new Map(); // carte|rareté|shiny → achats en stock, du plus ancien au plus récent
  const key = (op) => `${op.cardId}|${op.rarity || ""}|${op.shiny ? 1 : 0}`;
  const out = [];
  for (const op of [...ops].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1))) {
    if (op.side === "buy") {
      const buy = {...op, soldId: null, soldAt: null};
      out.push(buy);
      if (!stock.has(key(op))) stock.set(key(op), []);
      stock.get(key(op)).push(buy);
      continue;
    }
    const lot = stock.get(key(op))?.shift();
    out.push(
      lot
        ? {...op, cost: lot.price, profit: op.price - lot.price, buyId: lot.id, boughtAt: lot.at, heldMs: op.at - lot.at}
        : {...op, cost: null, profit: null, buyId: null, boughtAt: null, heldMs: null},
    );
    if (lot) {
      lot.soldId = op.id;
      lot.soldAt = op.at;
    }
  }
  return {ops: out, open: out.filter((op) => op.side === "buy" && !op.soldId)};
}

// Achat-revente seulement : les ventes de cartes achetées au marché, chacune avec son achat (prix,
// date) ; une revente compte à la date de la vente. Les ventes de cartes tirées et les achats pas
// encore revendus sont écartés.
const resalesOnly = (ops) => ops.filter((op) => op.side === "sell" && op.cost != null);

// Résumé d'une liste d'opérations (une période, ou tout l'historique).
// profit : plus-value réalisée (reventes seulement) ; cost : prix d'achat des cartes revendues ;
// pulledRevenue : ventes de cartes qui n'ont pas été achetées (paquets, échanges) ; net : ventes − achats.
function tradeStats(ops) {
  const s = {buys: 0, spent: 0, sells: 0, revenue: 0, resold: 0, cost: 0, profit: 0, wins: 0, losses: 0, pulled: 0, pulledRevenue: 0, heldMs: 0};
  for (const op of ops) {
    if (op.side === "buy") {
      s.buys++;
      s.spent += op.price;
      continue;
    }
    s.sells++;
    s.revenue += op.price;
    if (op.cost == null) {
      s.pulled++;
      s.pulledRevenue += op.price;
      continue;
    }
    s.resold++;
    s.cost += op.cost;
    s.profit += op.profit;
    s.heldMs += op.heldMs;
    if (op.profit > 0) s.wins++;
    else if (op.profit < 0) s.losses++;
  }
  return {
    ...s,
    net: s.revenue - s.spent,
    // Rendement de l'achat-revente : plus-value / prix d'achat des cartes revendues
    roi: s.cost > 0 ? s.profit / s.cost : null,
    winRate: s.resold ? s.wins / s.resold : null,
    avgHeldMs: s.resold ? Math.round(s.heldMs / s.resold) : null,
  };
}

// --- Périodes, en heure locale
const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Début de la période qui contient `at` (ms) : minuit, lundi minuit, ou le 1er du mois à minuit
function periodStart(at, unit) {
  const d = new Date(at);
  if (unit === "month") return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (unit === "week") day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day.getTime();
}

// Début de la période suivante (les jours de changement d'heure durent 23 ou 25 h)
function nextPeriod(start, unit) {
  const d = new Date(start);
  if (unit === "month") return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + (unit === "week" ? 7 : 1)).getTime();
}

// Identifiant d'une période : "2026-10-15" (jour), "2026-10-12" (semaine : son lundi), "2026-10" (mois)
function periodKey(at, unit) {
  const d = new Date(periodStart(at, unit));
  return unit === "month" ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}` : dayKey(d);
}

// Opérations regroupées par période, de la plus ancienne à la plus récente, sans trou entre la
// première opération et `until` (les périodes sans opération comptent pour le graphique).
// → [{key, start, end, ops, stats}]
function byPeriod(ops, unit, {until = Date.now()} = {}) {
  if (!UNITS.includes(unit)) throw new Error(L(`Période inconnue : ${unit}`, `Unknown period: ${unit}`));
  if (!ops.length) return [];
  const groups = new Map();
  for (const op of ops) {
    const start = periodStart(op.at, unit);
    if (!groups.has(start)) groups.set(start, []);
    groups.get(start).push(op);
  }
  const first = Math.min(...groups.keys());
  const last = Math.max(periodStart(until, unit), ...groups.keys());
  const periods = [];
  for (let start = first; start <= last; start = nextPeriod(start, unit)) {
    const list = groups.get(start) || [];
    periods.push({key: periodKey(start, unit), start, end: nextPeriod(start, unit), ops: list, stats: tradeStats(list)});
  }
  return periods;
}

module.exports = {ledger, matchTrades, resalesOnly, tradeStats, byPeriod, periodStart, periodKey, nextPeriod, STONKS_UNITS: UNITS};
