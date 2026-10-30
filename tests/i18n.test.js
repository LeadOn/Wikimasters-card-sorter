// Langue de l'interface : choix d'après le navigateur, textes et raretés dans la langue courante.
const test = require("node:test");
const assert = require("node:assert/strict");
const {pickLang, setLang, getLang, L} = require("../core/i18n");
const {RARITY_LABEL} = require("../core/prices");
const {loadExtensionModule} = require("./helpers/extension");

test("pickLang : première langue prise en charge du navigateur, anglais à défaut", () => {
  assert.equal(pickLang(["fr-FR", "en-US"]), "fr");
  assert.equal(pickLang(["fr-BE"]), "fr");
  assert.equal(pickLang(["en-GB", "fr"]), "en");
  assert.equal(pickLang(["de-DE", "fr-CH"]), "fr");
  assert.equal(pickLang(["de-DE", "es"]), "en");
  assert.equal(pickLang(["FR"]), "fr");
  assert.equal(pickLang([]), "en");
  assert.equal(pickLang(undefined), "en");
});

test("L et RARITY_LABEL suivent la langue courante ; une langue inconnue revient au français", (t) => {
  t.after(() => setLang("fr"));
  assert.equal(getLang(), "fr");
  assert.equal(L("Réglages", "Settings"), "Réglages");
  assert.equal(RARITY_LABEL.PC, "Peu commune");
  setLang("en");
  assert.equal(L("Réglages", "Settings"), "Settings");
  assert.equal(RARITY_LABEL.PC, "Uncommon");
  assert.deepEqual(Object.keys(RARITY_LABEL), ["L", "UR", "SR", "R", "PC", "C"]);
  setLang("de");
  assert.equal(getLang(), "fr");
});

test("l'extension est en français dans les tests, quelle que soit la langue de la machine", () => {
  const {LANG, LOCALE} = loadExtensionModule("extension/src/shared/i18n.js");
  assert.equal(LANG, "fr");
  assert.equal(LOCALE, "fr-FR");
});
