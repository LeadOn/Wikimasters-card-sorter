// Familles : groupes de cartes à collectionner. Manuelles (cartes choisies une à une) ou
// intelligentes (définies par une règle, remplies depuis une recherche dans le catalogue).
"use strict";

const {categorize} = require("./categorize");
const {hasKeyword, normalize} = require("./text");
const {keywordsToPattern} = require("./profiles");

// rule : {query, themes: [], keywords: "…", exclude: "…", rarities: []}
// Une carte du catalogue entre dans une famille intelligente si elle passe tous les filtres présents.
function matchesFamilyRule(card, rule) {
  if (rule.rarities?.length && !rule.rarities.includes(card.rarity)) return false;
  const text = normalize(`${card.wikipedia_title || ""} ${card.category || ""} ${(card.summary || "").split(/\n/)[0].slice(0, 400)}`);
  const kw = keywordsToPattern(rule.keywords);
  if (kw && !hasKeyword(text, kw)) return false;
  const ex = keywordsToPattern(rule.exclude);
  if (ex && hasKeyword(text, ex)) return false;
  if (rule.themes?.length && !rule.themes.includes(categorize(card)[0])) return false;
  return true;
}

// Carte réduite à ce qu'une famille conserve
const compactCard = (c) => ({
  id: c.id || c.card_id,
  title: c.wikipedia_title || c.title,
  rarity: c.rarity || null,
  category: c.category || "",
  image_url: c.image_url || null,
});

function familyProgress(family, ownedCardIds) {
  const total = family.cards.length;
  const owned = family.cards.filter((c) => ownedCardIds.has(c.id)).length;
  return {owned, total, missing: total - owned, percent: total ? Math.round((100 * owned) / total) : 0};
}

// Charge utile d'un code de partage (sans possessions)
function familyToShare(family) {
  return {
    v: 1,
    name: family.name,
    kind: family.kind,
    rule: family.kind === "smart" ? family.rule : undefined,
    cards: family.cards.map((c) => [c.id, c.title, c.rarity || "", c.category || "", c.image_url || ""]),
    cover: family.cover || null,
  };
}

function familyFromShare(payload) {
  if (!payload || !payload.name || !Array.isArray(payload.cards)) throw new Error("Code de famille illisible.");
  return {
    name: String(payload.name),
    kind: payload.kind === "smart" ? "smart" : "manual",
    rule: payload.rule || null,
    cards: payload.cards.map(([id, title, rarity, category, image_url]) => ({id, title, rarity: rarity || null, category, image_url: image_url || null})),
    cover: payload.cover || null,
  };
}

module.exports = {matchesFamilyRule, compactCard, familyProgress, familyToShare, familyFromShare};
