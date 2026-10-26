// Profils d'intérêts : règles, éditeur simple, validation.
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../core");
const {BUILTIN_PROFILES} = require("../core/builtin-profiles");

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
  assert.deepEqual(core.validateProfile(BUILTIN_PROFILES[0]), []);
  assert.ok(core.validateProfile({name: "", rules: []}).length >= 2);
  assert.match(core.validateProfile({name: "a", rules: [{kw: "(" }]}).join(), /invalide/);
  assert.match(core.validateProfile({name: "a", rules: [{match: "inconnu"}]}).join(), /inconnu/);
});

test("validation d'un profil importé : structure, couleur, expressions dangereuses", () => {
  for (const p of BUILTIN_PROFILES) assert.deepEqual(core.validateProfile(p), [], p.name);
  const ok = {name: "Ana", color: "#123456", rules: [{kw: "rap"}]};
  assert.deepEqual(core.validateProfile(ok), []);
  const problems = (p) => core.validateProfile(p).join(" | ");
  assert.match(problems({...ok, color: "red; background:url(x)"}), /Couleur invalide/);
  assert.match(problems({...ok, name: "x".repeat(61)}), /Nom trop long/);
  assert.match(problems({...ok, rules: [null]}), /Règle illisible/);
  assert.match(problems({...ok, rules: [{kw: 42}]}), /texte attendu/);
  assert.match(problems({...ok, rules: [{kw: "(a+)+$"}]}), /quantificateurs imbriqués/);
  assert.match(problems({...ok, rules: [{kw: "a".repeat(5001)}]}), /trop longue/);
  assert.match(problems({...ok, rules: [{match: "constructor"}]}), /Prédicat inconnu/);
  assert.match(problems({...ok, rules: [{theme: ["Sports", 1]}]}), /Thème invalide/);
  assert.equal(core.categorize({wikipedia_title: "X", category: "y"}, {profiles: [{name: "Z", rules: [{match: "constructor"}]}]}).length, 1, "prédicat hérité ignoré");
});

test("profils de la bande : réservés aux scripts, absents du moteur partagé avec l'extension", () => {
  assert.equal(core.BUILTIN_PROFILES, undefined);
  assert.ok(BUILTIN_PROFILES.length > 0);
});

test("export / import JSON des profils : aller-retour exact, profil simple reconstruit depuis sa saisie", () => {
  const simple = {...core.simpleToProfile({name: "Ana", color: "#123456", about: "Requins", themes: ["Faune & Flore"], keywords: "requin, Star Wars", exclude: "lego", imageOnly: true}), enabled: false};
  const list = [...BUILTIN_PROFILES, simple];
  const {profiles, rejected, error} = core.importProfiles(JSON.stringify(core.exportProfiles(list)));
  assert.equal(error, null);
  assert.deepEqual(rejected, []);
  assert.deepEqual(
    profiles,
    list.map((p) => ({name: p.name, color: p.color, about: p.about || "", rules: p.rules, ...(p.simple && {simple: p.simple}), ...(p.enabled === false && {enabled: false})})),
  );
  // Règles d'un profil simple modifiées à la main dans le fichier : reconstruites depuis la saisie
  const tampered = core.importProfiles(JSON.stringify([{...simple, rules: [{kw: "tout"}]}])).profiles[0];
  assert.deepEqual(tampered.rules, simple.rules);
  // Un profil seul, ou une liste, est accepté ; id et champs inconnus ignorés
  const one = core.importProfiles(JSON.stringify({id: "x", name: "Bob", color: "#000000", rules: [{kw: "rap", evil: 1}], extra: true})).profiles[0];
  assert.deepEqual(one, {name: "Bob", color: "#000000", about: "", rules: [{kw: "rap"}]});
});

test("import JSON des profils : fichiers refusés, profils invalides écartés un à un", () => {
  const err = (text) => core.importProfiles(text).error;
  assert.match(err(""), /vide/);
  assert.match(err("{"), /illisible/);
  assert.match(err("42"), /pas de profils/);
  assert.match(err(JSON.stringify({format: "wikimasters-toolbox/themes", themes: []})), /pas un export de profils/);
  assert.match(err(JSON.stringify({profiles: Array.from({length: 201}, () => ({}))})), /Trop de profils/);
  assert.match(err("x".repeat(1000001)), /volumineux/);
  const r = core.importProfiles(
    JSON.stringify([
      {name: "Ok", color: "#111111", rules: [{kw: "rap"}]},
      {name: "Lent", rules: [{kw: "(a+)+"}]},
      {name: "ok", rules: [{kw: "jazz"}]},
      null,
      {name: "Vide", simple: {keywords: ""}},
    ]),
  );
  assert.deepEqual(r.profiles.map((p) => p.name), ["Ok"]);
  assert.deepEqual(r.rejected.map((x) => x.name), ["Lent", "ok", "Profil n° 4", "Vide"]);
  assert.match(r.rejected[1].problems.join(), /en double/);
});

test("fusion des profils importés : le mien par pseudo, amis remplacés en gardant id et état", () => {
  let n = 0;
  const newId = () => `id${++n}`;
  const state = {mine: {id: "m", name: "Moi", rules: [{kw: "a"}]}, friends: [{id: "f1", name: "Ana", rules: [{kw: "b"}], enabled: false}]};
  const imported = [
    {name: "moi", color: "#000000", rules: [{kw: "c"}], enabled: false},
    {name: "ANA", rules: [{kw: "d"}]},
    {name: "Bob", rules: [{kw: "e"}]},
  ];
  const m = core.mergeProfiles(state, imported, "Moi", newId);
  assert.equal(m.mine, "replaced");
  assert.deepEqual(m.state.mine, {name: "moi", color: "#000000", rules: [{kw: "c"}], id: "m"});
  assert.deepEqual(m.replaced, ["ANA"]);
  assert.deepEqual(m.added, ["Bob"]);
  assert.deepEqual(m.state.friends[0], {name: "ANA", rules: [{kw: "d"}], id: "f1", enabled: false});
  assert.deepEqual(m.state.friends[1], {name: "Bob", rules: [{kw: "e"}], id: "id1", enabled: true});
  assert.equal(state.friends.length, 1, "état d'origine intact");
  assert.equal(core.mergeProfiles({mine: null, friends: []}, imported.slice(0, 1), "Moi", newId).mine, "added");
});
