// Recherche d'échanges avec un ami : ce que je peux lui demander, ce que je peux lui proposer.
"use strict";

const {categorize} = require("./categorize");
const {rarityRank, averagePrice} = require("./prices");

// mine        : mes exemplaires [{id, card_id, cards: {…carte avec résumé}}]
// friendItems : collection de l'ami [{id, card_id, count, is_shiny, card: {…}}]
// summaries   : Map(card_id → résumé Wikipédia) pour les cartes de l'ami (la route du site ne le donne pas)
// wanted      : tags recherchés pour moi (« Pour : <moi> », ou thèmes génériques)
// friendTag   : tag « Pour : <ami> », ou null (on propose alors mes doublons qu'il n'a pas)
// rarities    : si la collection de l'ami n'a été lue que pour certaines raretés, mes propositions s'y limitent
// prices      : Map(card_id → résumé de prix), facultatif
function findTrades({mine, friendItems, summaries = new Map(), wishlist = new Set(), pending = new Set(), wanted, friendTag, profiles = [], rarities = [], prices = new Map()}) {
  const myCopies = new Map();
  for (const uc of mine) myCopies.set(uc.card_id, (myCopies.get(uc.card_id) || 0) + 1);
  const friendOwns = new Set(friendItems.map((it) => it.card_id));
  const describe = (card, summary) => {
    const tags = categorize({...card, summary: summary || ""}, {profiles});
    return {theme: tags[0], tags};
  };

  const toAsk = [];
  for (const it of friendItems) {
    if (myCopies.has(it.card_id)) continue;
    const {theme, tags} = describe(it.card, summaries.get(it.card_id));
    const matched = wanted.filter((w) => tags.includes(w));
    const wished = wishlist.has(it.card_id);
    if (!matched.length && !wished) continue;
    toAsk.push({
      ...it,
      theme,
      matched,
      wished,
      spare: (it.count || 1) > 1,
      pending: pending.has(it.card_id),
      price: averagePrice(prices.get(it.card_id), it.card?.rarity),
    });
  }
  toAsk.sort(
    (a, b) =>
      b.wished - a.wished ||
      b.spare - a.spare ||
      rarityRank(b.card.rarity) - rarityRank(a.card.rarity) ||
      (b.card.pageviews || 0) - (a.card.pageviews || 0),
  );

  const seen = new Set();
  const toOffer = [];
  for (const uc of mine) {
    if (!uc.cards || seen.has(uc.card_id) || friendOwns.has(uc.card_id)) continue;
    if (rarities.length && !rarities.includes(uc.cards.rarity)) continue;
    seen.add(uc.card_id);
    const {theme, tags} = describe(uc.cards, uc.cards.summary);
    const copies = myCopies.get(uc.card_id);
    if (friendTag ? !tags.includes(friendTag) : copies < 2) continue;
    toOffer.push({
      card_id: uc.card_id,
      user_card_id: uc.id,
      card: uc.cards,
      theme,
      copies,
      spare: copies > 1,
      price: averagePrice(prices.get(uc.card_id), uc.cards.rarity),
    });
  }
  toOffer.sort(
    (a, b) =>
      b.spare - a.spare ||
      rarityRank(b.card.rarity) - rarityRank(a.card.rarity) ||
      (b.card.pageviews || 0) - (a.card.pageviews || 0),
  );
  return {toAsk, toOffer};
}

// Proposition équilibrée : parmi `candidates` (mes cartes à proposer, avec `price`), choisit des cartes
// dont la valeur totale approche `target`, en privilégiant mes doublons. Glouton, puis ajustement.
function balanceOffer(target, candidates, {preferSpare = true} = {}) {
  const pool = candidates
    .filter((c) => c.price > 0)
    .sort((a, b) => (preferSpare ? b.spare - a.spare : 0) || b.price - a.price);
  const chosen = [];
  let total = 0;
  for (const c of pool) {
    if (total >= target) break;
    if (total + c.price <= target * 1.15 || !chosen.length) {
      chosen.push(c);
      total += c.price;
    }
  }
  // Complète avec la plus petite carte qui fait passer le total au-dessus de 90 % de la cible
  if (total < target * 0.9) {
    const filler = pool.filter((c) => !chosen.includes(c)).sort((a, b) => a.price - b.price).find((c) => total + c.price >= target * 0.9);
    if (filler) {
      chosen.push(filler);
      total += filler.price;
    }
  }
  return {chosen, total};
}

module.exports = {findTrades, balanceOffer};
