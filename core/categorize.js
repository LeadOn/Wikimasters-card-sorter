// Point d'entrée du classement d'une carte.
"use strict";

const {extractFields} = require("./text");
const {genericCategory, manualCategory} = require("./engine");
const {profileTags} = require("./profiles");

// Renvoie les tags d'une carte : [thème générique, ...tags « Pour : … » des profils].
// options.profiles      : profils d'intérêts actifs (core/profiles.js)
// options.manualMapping : corrections manuelles { "Thème": [id de user_card, …] }
// options.userCardId    : id de l'exemplaire, pour appliquer les corrections manuelles
function categorize(card, {profiles = [], manualMapping = null, userCardId = null} = {}) {
  const f = extractFields(card);
  const generic = genericCategory(f);
  const genericCat = (!generic.confident && manualCategory(manualMapping, userCardId)) || generic.theme;
  return [genericCat, ...profileTags(profiles, card, f, genericCat)];
}

// Détail du calcul (scores par thème), pour le débogage et l'évaluation.
function explain(card) {
  const f = extractFields(card);
  return {fields: f, ...genericCategory(f)};
}

module.exports = {categorize, explain};
