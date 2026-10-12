// Profils d'intérêts : règles, éditeur simple, validation.
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../core");

const card = (title, category, extra = {}) => ({wikipedia_title: title, category, summary: "", ...extra});
const tagsFor = (profile, c) => core.categorize(c, {profiles: [profile]}).slice(1);

test("éditeur simple : mots-clés, pluriels, préfixes et exclusions", () => {
  assert.equal(core.keywordsToPattern("requin, Star Wars, haltérophil*"), "requin[sx]?|star wars|haltérophil[a-zà-ÿ]*");
  const p = core.simpleToProfile({name: "Bob", color: "#000", keywords: "requin, python", exclude: "langage"});
  assert.deepEqual(tagsFor(p, card("Requin-tigre", "espèce de requins")), ["Pour : Bob"]);
  assert.deepEqual(tagsFor(p, card("Python (langage)", "langage de programmation")), []);
  assert.deepEqual(tagsFor(p, card("Python royal", "espèce de serpents")), ["Pour : Bob"]);
});

test("éditeur simple : thèmes entiers", () => {
  const p = core.simpleToProfile({name: "Ana", themes: ["Sports"]});
  assert.deepEqual(tagsFor(p, card("Zinédine Zidane", "footballeur français")), ["Pour : Ana"]);
  assert.deepEqual(tagsFor(p, card("Lyon", "commune française du département du Rhône")), []);
});

test("règles : with, unless, image, field et prédicat", () => {
  const p = {
    name: "X",
    rules: [
      {kw: "rap", with: "jul"},
      {kw: "église", image: true},
      {kw: "julien", field: "title"},
      {match: "musicAlbum"},
    ],
  };
  assert.deepEqual(tagsFor(p, card("Jul (chanteur)", "chanteur de rap français")), ["Pour : X"]);
  assert.deepEqual(tagsFor(p, card("Rap", "genre musical")), []);
  assert.deepEqual(tagsFor(p, card("Église Saint-Paul", "église située à Lyon")), []);
  assert.deepEqual(tagsFor(p, card("Église Saint-Paul", "église située à Lyon", {image_url: "x"})), ["Pour : X"]);
  assert.deepEqual(tagsFor(p, card("Julien Doré", "chanteur")), ["Pour : X"]);
  assert.deepEqual(tagsFor(p, card("Nevermind", "album de Nirvana")), ["Pour : X"]);
});

test("une règle sans condition positive ne s'applique à rien", () => {
  assert.deepEqual(tagsFor({name: "Vide", rules: [{unless: "x"}, {image: true}]}, card("A", "b", {image_url: "x"})), []);
});

test("validation des profils", () => {
  assert.deepEqual(core.validateProfile(core.BUILTIN_PROFILES[0]), []);
  assert.ok(core.validateProfile({name: "", rules: []}).length >= 2);
  assert.match(core.validateProfile({name: "a", rules: [{kw: "(" }]}).join(), /invalide/);
  assert.match(core.validateProfile({name: "a", rules: [{match: "inconnu"}]}).join(), /inconnu/);
});
