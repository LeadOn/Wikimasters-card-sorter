// Langue des textes affichés : français (scripts Node, par défaut) ou anglais. L'extension choisit la
// langue d'après celle du navigateur (extension/src/shared/i18n.js) ; les noms d'étiquettes (thèmes,
// Doublon, « Pour : … ») sont des données et ne sont jamais traduits.
"use strict";

const LANGS = ["fr", "en"];
let lang = "fr";

// Première langue prise en charge dans la liste du navigateur (navigator.languages), anglais à défaut
function pickLang(list) {
  for (const tag of list || []) {
    const base = String(tag || "").slice(0, 2).toLowerCase();
    if (LANGS.includes(base)) return base;
  }
  return "en";
}

const setLang = (l) => (lang = LANGS.includes(l) ? l : "fr");
const getLang = () => lang;
// Texte dans la langue courante : L("Réglages", "Settings")
const L = (fr, en) => (lang === "en" ? en : fr);

module.exports = {pickLang, setLang, getLang, L};
