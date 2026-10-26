// Point d'entrée du classement d'une carte.
"use strict";

const {extractFields} = require("./text");
const {genericCategory, manualCategory} = require("./engine");
const {profileTags} = require("./profiles");
const {themeSetOf, themeAliases} = require("./theme-set");

// Renvoie les tags d'une carte : [thème générique, ...tags « Pour : … » des profils].
// options.profiles      : profils d'intérêts actifs (core/profiles.js)
// options.manualMapping : corrections manuelles { "Thème": [id de user_card, …] }
// options.userCardId    : id de l'exemplaire, pour appliquer les corrections manuelles
// options.themes        : liste de thèmes du joueur (core/theme-set.js) ; par défaut, celle de core/themes.js
function categorize(card, {profiles = [], manualMapping = null, userCardId = null, themes = null} = {}) {
  const set = themeSetOf(themes);
  const f = extractFields(card);
  const generic = genericCategory(f, set);
  const genericCat = (!generic.confident && manualCategory(manualMapping, userCardId)) || generic.theme;
  return [genericCat, ...profileTags(profiles, card, f, themeAliases(set, genericCat))];
}

// Détail du calcul (scores par thème), pour le débogage et l'évaluation.
function explain(card, {themes = null} = {}) {
  const f = extractFields(card);
  return {fields: f, ...genericCategory(f, themeSetOf(themes))};
}

module.exports = {categorize, explain};
