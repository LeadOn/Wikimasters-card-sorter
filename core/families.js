// Familles : groupes de cartes à collectionner. Manuelles (cartes choisies une à une) ou
// intelligentes (définies par une règle, remplies depuis une recherche dans le catalogue).
"use strict";

const {categorize} = require("./categorize");
const {hasKeyword, normalize} = require("./text");
const {keywordsToPattern} = require("./profiles");
const {RARITIES} = require("./prices");

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
// hide_image : image masquée par le site (true), visible (false) ou inconnu (null). Une carte sans
// image n'est complétée par une image de Wikimedia que si l'on sait qu'elle n'a pas été masquée.
const hidden = (v) => (v == null ? null : Boolean(v));

const compactCard = (c) => ({
  id: c.id || c.card_id,
  title: c.wikipedia_title || c.title,
  rarity: c.rarity || null,
  category: c.category || "",
  image_url: c.image_url || null,
  hide_image: hidden(c.hide_image),
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
    // 6e valeur : image masquée (1), visible (0), inconnue (absente) ; ignorée par les anciennes versions
    cards: family.cards.map((c) => [c.id, c.title, c.rarity || "", c.category || "", c.image_url || "", ...(c.hide_image == null ? [] : [c.hide_image ? 1 : 0])]),
    cover: family.cover || null,
  };
}

// Le code vient d'un autre joueur : chaque champ est vérifié et ramené au format attendu.
const text = (v, max = 500) => (typeof v === "string" ? v.slice(0, max) : "");
const httpUrl = (v) => (typeof v === "string" && /^https?:\/\//i.test(v) ? v : null);
const stringList = (v, allowed) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && (!allowed || allowed.includes(x))) : []);

function familyFromShare(payload) {
  const name = text(payload?.name, 80).trim();
  if (!name || !Array.isArray(payload.cards)) throw new Error("Code de famille illisible.");
  const cards = [];
  const seen = new Set();
  for (const entry of payload.cards) {
    if (!Array.isArray(entry)) continue;
    const [id, title, rarity, category, image_url, hideImage] = entry;
    if (typeof id !== "string" || !id || seen.has(id)) continue;
    seen.add(id);
    cards.push({id, title: text(title), rarity: RARITIES.includes(rarity) ? rarity : null, category: text(category), image_url: httpUrl(image_url), hide_image: hideImage === 1 ? true : hideImage === 0 ? false : null});
  }
  const smart = payload.kind === "smart";
  const rule = smart && payload.rule && typeof payload.rule === "object" ? payload.rule : null;
  return {
    name,
    kind: smart ? "smart" : "manual",
    rule: rule && {
      query: text(rule.query, 200),
      keywords: text(rule.keywords, 2000),
      exclude: text(rule.exclude, 2000),
      themes: stringList(rule.themes),
      rarities: stringList(rule.rarities, RARITIES),
    },
    cards,
    cover: typeof payload.cover === "string" && seen.has(payload.cover) ? payload.cover : null,
  };
}

module.exports = {matchesFamilyRule, compactCard, familyProgress, familyToShare, familyFromShare};
