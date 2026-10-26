// Thèmes personnalisés : moteur, réglage enregistré, étiquettes renommées ou supprimées.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../core");
const {BUILTIN_PROFILES} = require("../core/builtin-profiles");

const labeled = JSON.parse(fs.readFileSync(path.join(__dirname, "../scripts/fixtures/labeled_cards.json"), "utf8"));
const card = (title, category = "", summary = "") => ({wikipedia_title: title, category, summary});
const themeOf = (c, themes) => core.categorize(c, {themes})[0];

// Liste par défaut modifiée par `fn` (sur une copie)
function edited(fn) {
  const list = core.defaultThemeList();
  fn(list);
  return list;
}
const byId = (list, id) => list.themes.find((t) => t.id === id);

test("liste par défaut : même classement que sans liste, sur tout le jeu de test", () => {
  const list = core.defaultThemeList();
  for (const c of labeled) {
    const k = {wikipedia_title: c.title, category: c.category, summary: c.summary, image_url: c.image_url};
    assert.deepEqual(core.categorize(k, {themes: list, profiles: BUILTIN_PROFILES}), core.categorize(k, {profiles: BUILTIN_PROFILES}), c.title);
  }
  assert.deepEqual(core.managedTags({themes: list}), core.managedTags());
  assert.deepEqual(Object.keys(core.DEFAULT_THEME_SET.tags), Object.keys(core.THEME_COLORS), "ordre d'affichage conservé");
  assert.deepEqual(core.validateThemes(list), []);
  assert.equal(core.storeThemes(list), null, "rien à enregistrer");
});

test("thème renommé, recoloré, ajouté ; les règles des profils suivent le renommage", () => {
  const list = edited((l) => {
    Object.assign(byId(l, "Sports"), {name: "Sport", color: "#000000"});
    l.themes.push({...core.newTheme("Gastronomie"), kw: "fromages?|plats? (?:cuisinés?|traditionnels?)"});
  });
  assert.equal(themeOf(card("Kasper Hjulmand", "footballeur danois"), list), "Sport");
  assert.equal(themeOf(card("Brie de Meaux", "fromage à pâte molle"), list), "Gastronomie");
  const tags = core.managedTags({themes: list});
  assert.equal(tags.Sport, "#000000");
  assert.ok(!("Sports" in tags) && "Gastronomie" in tags);
  assert.ok(core.isThemeTag("Sport", list) && !core.isThemeTag("Sports", list));
  // Profil (ou famille) écrit avec le nom d'origine
  const fan = {name: "Fan", rules: [{theme: "Sports"}]};
  assert.deepEqual(core.categorize(card("Kasper Hjulmand", "footballeur danois"), {themes: list, profiles: [fan]}), ["Sport", "Pour : Fan"]);
  assert.ok(core.matchesFamilyRule(card("Kasper Hjulmand", "footballeur danois"), {themes: ["Sports"]}, {themes: list}));
  assert.ok(core.matchesFamilyRule(card("Kasper Hjulmand", "footballeur danois"), {themes: ["Sport"]}, {themes: list}));
});

test("thèmes supprimés : les règles à part tombent dans « Autre », un thème scindé peut ne plus l'être", () => {
  const homonymie = card("Martin", "page d'homonymie");
  const latin = card("Crataegus punctata");
  assert.equal(themeOf(homonymie), "Divers & Homonymies");
  assert.equal(themeOf(latin), "Faune & Flore");
  const list = edited((l) => {
    l.themes = l.themes.filter((t) => t.id !== "Divers & Homonymies" && t.id !== "Faune & Flore");
    l.other.name = "Sans thème";
    byId(l, "Politique").split = null;
  });
  assert.equal(themeOf(homonymie, list), "Sans thème");
  assert.equal(themeOf(latin, list), "Sans thème");
  assert.equal(themeOf(card("Jean Jaurès", "homme politique français"), list), "Politique");
  assert.equal(themeOf(card("Viktor Orbán", "homme politique hongrois"), list), "Politique");
});

test("réglage enregistré : seulement les différences, un thème non modifié suit la liste par défaut", () => {
  const list = edited((l) => {
    byId(l, "Sports").color = "#111111";
    l.themes = l.themes.filter((t) => t.id !== "Militaire & Armement");
    l.themes.push({...core.newTheme("Cuisine"), kw: "recettes?"});
  });
  const stored = core.storeThemes(list);
  assert.deepEqual(stored.edits, {Sports: {color: "#111111"}});
  assert.deepEqual(stored.deleted, ["Militaire & Armement"]);
  assert.equal(stored.added[0].name, "Cuisine");
  assert.deepEqual(stored.removed, ["Militaire & Armement"]);
  assert.deepEqual(core.resolveThemes(stored), list);
  assert.equal(byId(core.resolveThemes(stored), "Histoire").kw, core.THEMES.Histoire.kw, "mots-clés d'origine non copiés");
  // Enregistrer la même liste ne change rien ; revenir aux thèmes par défaut garde l'étiquette retirée
  assert.deepEqual(core.storeThemes(core.resolveThemes(stored), stored), stored);
  assert.deepEqual(core.storeThemes(core.defaultThemeList(), stored), {edits: {}, added: [], deleted: [], other: {}, renames: {}, removed: ["Cuisine"]});
});

test("suivi des étiquettes : renommages enchaînés, retour au nom d'origine, suppression, scission", () => {
  const base = core.defaultThemeList();
  const rename = (list, id, name) => edited((l) => (l.themes = list.themes.map((t) => (t.id === id ? {...t, name} : t))));
  const a = rename(base, "Sports", "Sport");
  const b = rename(a, "Sports", "Sport & Jeux");
  let stored = core.storeThemes(a);
  assert.deepEqual(stored.renames, {Sports: "Sport"});
  stored = core.storeThemes(b, stored);
  assert.deepEqual(stored.renames, {Sports: "Sport & Jeux", Sport: "Sport & Jeux"}, "l'étiquette déjà renommée suit aussi");
  stored = core.storeThemes(base, stored);
  assert.deepEqual(stored.renames, {"Sport & Jeux": "Sports", Sport: "Sports"});
  // Thème renommé puis supprimé : l'ancienne étiquette est retirée
  const gone = edited((l) => (l.themes = l.themes.filter((t) => t.id !== "Sports")));
  assert.deepEqual(core.trackTagChanges(a, gone, {renames: {Sports: "Sport"}}), {renames: {}, removed: ["Sports", "Sport"]});
  // Nom repris par un autre thème : ni renommé ni retiré
  const reused = edited((l) => {
    byId(l, "Sports").name = "Sport";
    byId(l, "Histoire").name = "Sports";
  });
  assert.deepEqual(core.trackTagChanges(base, reused), {renames: {Histoire: "Sports"}, removed: []});
  // Politique sans scission : l'étiquette française prend le nom du thème, l'internationale est retirée
  const unsplit = edited((l) => (byId(l, "Politique").split = null));
  assert.deepEqual(core.trackTagChanges(base, unsplit), {renames: {"Politique Française": "Politique"}, removed: ["Politique Internationale"]});
  // Après un tri : les noms traités sont oubliés
  assert.equal(core.settleThemes(core.storeThemes(unsplit), ["Politique Française"]).renames["Politique Française"], undefined);
  assert.equal(core.settleThemes({renames: {Sports: "Sport"}, removed: []}, ["Sports"]), null);
});

test("vérification d'une liste modifiée", () => {
  const messages = (fn) => core.validateThemes(edited(fn)).map((p) => p.message).join("\n");
  assert.match(messages((l) => (byId(l, "Sports").name = "Histoire")), /utilisé deux fois/);
  assert.match(messages((l) => (byId(l, "Sports").name = "Doublon")), /réservé/);
  assert.match(messages((l) => (byId(l, "Sports").name = "Pour : moi")), /réservé/);
  assert.match(messages((l) => (byId(l, "Sports").name = " ")), /nom manquant/);
  assert.match(messages((l) => (byId(l, "Sports").kw = "")), /aucun mot-clé/);
  assert.match(messages((l) => (byId(l, "Sports").kw = "foot(")), /expression invalide/);
  assert.match(messages((l) => (byId(l, "Sports").head = "(a+)+")), /quantificateurs imbriqués/);
  assert.match(messages((l) => (byId(l, "Sports").color = "rouge")), /couleur invalide/);
  assert.match(messages((l) => (l.other.name = "Sports")), /utilisé deux fois/);
  assert.match(messages((l) => (l.themes = [])), /au moins un thème/);
});

test("mots-clés : une expression par ligne, aller-retour exact", () => {
  assert.deepEqual(core.splitPattern("a|b(?:c|d)|[|]e|f\\|g"), ["a", "b(?:c|d)", "[|]e", "f\\|g"]);
  assert.equal(core.joinPattern("  Star Wars \n\nrequins?\n’t\\D"), "star wars|requins?|'t\\D");
  for (const t of core.defaultThemeList().themes)
    for (const key of ["kw", "head"]) if (t[key]) assert.equal(core.joinPattern(core.splitPattern(t[key]).join("\n")), t[key], `${t.id} ${key}`);
});

test("export / import JSON : aller-retour exact, renommage suivi chez celui qui importe", () => {
  const list = edited((l) => {
    Object.assign(byId(l, "Sports"), {name: "Sport", color: "#000000"});
    l.themes = l.themes.filter((t) => t.id !== "Militaire & Armement");
    l.themes.push({...core.newTheme("Gastronomie"), kw: "fromages?"});
    l.other = {name: "Sans thème", color: "#333333"};
  });
  const json = JSON.stringify(core.exportThemes(list));
  const {list: back, problems} = core.importThemes(json);
  assert.deepEqual(problems, []);
  assert.deepEqual(back, list);
  // Chez un joueur aux thèmes par défaut : « Sports » renommé, « Militaire & Armement » retiré au prochain tri
  const stored = core.storeThemes(back, null);
  assert.deepEqual(stored.renames, {Sports: "Sport", Autre: "Sans thème"});
  assert.deepEqual(stored.removed, ["Militaire & Armement"]);
  assert.equal(byId(core.resolveThemes(stored), "Histoire").kw, core.THEMES.Histoire.kw, "thèmes non modifiés : pas de copie des mots-clés");
});

test("import JSON : texte illisible, structure inattendue, contenu à corriger", () => {
  const firstProblem = (text) => core.importThemes(text).problems[0];
  assert.equal(core.importThemes("{").list, null);
  assert.match(firstProblem("{"), /illisible/);
  assert.match(firstProblem(""), /vide/);
  assert.match(firstProblem("42"), /pas une liste/);
  assert.match(firstProblem(JSON.stringify({format: "autre", themes: []})), /pas une liste de thèmes de la Toolbox/);
  assert.match(firstProblem(JSON.stringify({themes: "Sports"})), /Aucune liste/);
  assert.match(firstProblem(JSON.stringify({themes: Array.from({length: 101}, () => ({}))})), /Trop de thèmes/);
  assert.match(firstProblem(JSON.stringify({themes: [null]})), /illisible/);
  assert.match(firstProblem("x".repeat(500001)), /volumineux/);
  // Tableau seul accepté ; champs inconnus ignorés, ids manquants ou en double remplacés, rôle inconnu ignoré
  const {list, problems} = core.importThemes(
    JSON.stringify([
      {name: "A", color: "#111111", kw: "a", evil: "x", role: "pirate", weight: 99},
      {id: "x", name: "B", color: "#222222", kw: "b"},
      {id: "x", name: "C", color: "#333333", kw: "(a+)+"},
    ]),
  );
  assert.equal(list.themes.length, 3);
  assert.deepEqual(Object.keys(list.themes[0]).sort(), ["color", "head", "id", "kw", "name"]);
  assert.equal(new Set(list.themes.map((t) => t.id)).size, 3);
  assert.equal(list.other.name, "Autre");
  assert.equal(problems.length, 1);
  assert.match(problems[0], /quantificateurs imbriqués/, "liste chargée pour être corrigée");
});

// ---------------------------------------------------------------------------
// Étiquettes en base après un renommage ou une suppression
// ---------------------------------------------------------------------------

const uc = (id, cardId, title, category) => ({id, card_id: cardId, cards: {id: cardId, wikipedia_title: title, category, summary: ""}});
const collection = [uc("u1", "c1", "Kasper Hjulmand", "footballeur danois"), uc("u2", "c2", "Mont Blanc", "sommet des Alpes"), uc("u3", "c3", "Saturne", "planète du Système solaire")];
const dbTags = [
  {id: "t-sport", name: "Sports", color: "#ea580c"},
  {id: "t-geo", name: "Géographie & Territoires", color: "#16a34a"},
  {id: "t-astro", name: "Astronomie & Espace", color: "#1e3a8a"},
  {id: "t-fav", name: "Favoris", color: "#ffffff"},
];
// u1 corrigée à la main en Géographie, u3 jamais triée
const links = () =>
  new Map([
    ["t-sport", new Set(["u1"])],
    ["t-geo", new Set(["u1", "u2"])],
    ["t-astro", new Set()],
    ["t-fav", new Set(["u2"])],
  ]);

function plan(list, stored, {newOnly}) {
  const managed = core.managedTags({themes: list});
  const {tags, renamed, retired} = core.planThemeTags(dbTags, managed, stored);
  const assignments = core.computeAssignments(collection, {themes: list});
  const changes = core.planChanges(assignments, tags, links(), {newOnly, managed, themes: list, retired});
  return {managed, tags, renamed, retired, ...changes, upserts: core.planTagUpserts(tags, managed, changes.toInsert, {newOnly})};
}

test("thème renommé : l'étiquette est renommée (associations et corrections gardées), pas recréée", () => {
  const list = edited((l) => (byId(l, "Sports").name = "Sport"));
  const stored = core.storeThemes(list);
  for (const newOnly of [true, false]) {
    const p = plan(list, stored, {newOnly});
    assert.deepEqual(p.renamed, [{id: "t-sport", from: "Sports", to: "Sport"}]);
    assert.deepEqual(p.retired, []);
    assert.ok(!p.upserts.create.some((t) => t.name === "Sport"), "pas de deuxième étiquette");
    assert.ok(!p.toDelete.some((d) => d.tagId === "t-fav") && !p.extraTagIds.includes("t-fav"), "étiquette personnelle intacte");
  }
  assert.deepEqual([...plan(list, stored, {newOnly: true}).fresh], ["u3"], "u1 reste triée sous le nouveau nom");
  // Nouveau nom déjà pris par une étiquette : l'ancienne est retirée (retri complet), jamais fusionnée en silence
  const taken = core.planThemeTags([...dbTags, {id: "t-sport-2", name: "Sport", color: "#000"}], core.managedTags({themes: list}), stored);
  assert.deepEqual(taken.renamed, []);
  assert.deepEqual(taken.retired.map((t) => t.id), ["t-sport"]);
});

test("thème supprimé : étiquette laissée par le tri des nouvelles cartes, retirée par le retri complet", () => {
  const list = edited((l) => (l.themes = l.themes.filter((t) => t.id !== "Géographie & Territoires")));
  const stored = core.storeThemes(list);
  assert.deepEqual(stored.removed, ["Géographie & Territoires"]);

  const incremental = plan(list, stored, {newOnly: true});
  assert.deepEqual(incremental.retired.map((t) => t.id), ["t-geo"]);
  assert.deepEqual([...incremental.fresh], ["u3"], "u2 (seulement dans l'étiquette retirée) compte comme triée");
  assert.deepEqual(incremental.toDelete, []);
  assert.deepEqual(incremental.extraTagIds, []);

  const full = plan(list, stored, {newOnly: false});
  assert.deepEqual(full.toDelete.find((d) => d.tagId === "t-geo"), {name: "Géographie & Territoires", tagId: "t-geo", ids: ["u1", "u2"]});
  assert.ok(full.extraTagIds.includes("t-geo"));
  assert.ok(!full.toDelete.some((d) => d.tagId === "t-fav") && !full.extraTagIds.includes("t-fav"), "étiquette personnelle intacte");
  assert.ok(full.toInsert.some((i) => i.userCardId === "u2"), "u2 reçoit un thème de la liste");

  // Sans liste personnalisée, rien n'est retiré
  assert.deepEqual(core.planThemeTags(dbTags, core.managedTags()).retired, []);
});

test("applyPlan : renommage avant tout le reste", async () => {
  const list = edited((l) => (byId(l, "Sports").name = "Sport"));
  const p = plan(list, core.storeThemes(list), {newOnly: false});
  const calls = [];
  const tags = dbTags.map((t) => ({...t}));
  const client = {
    listTags: async () => tags,
    createTag: async ({name, color}) => (calls.push(`create ${name}`), {id: `new-${name}`, name, color}),
    renameTag: async (id, name) => (calls.push(`rename ${id} ${name}`), (tags.find((t) => t.id === id).name = name)),
    recolorTag: async (id) => calls.push(`recolor ${id}`),
    insertLinks: async () => calls.push("insert"),
    deleteLinks: async () => calls.push("delete"),
    deleteTag: async (id) => calls.push(`deleteTag ${id}`),
  };
  await core.applyPlan(client, p);
  assert.equal(calls[0], "rename t-sport Sport");
  assert.ok(!calls.includes("create Sport"));
});

// ---------------------------------------------------------------------------
// Extension : réglage enregistré et liste utilisée par le tri
// ---------------------------------------------------------------------------

test("extension : couleurs choisies avant l'éditeur reprises dans la liste, tri avec la liste du joueur", async () => {
  const {loadExtensionModule} = require("./helpers/extension");
  const saved = {settings: {themeColors: {Sports: "#123456", "Politique Française": "#abcdef", Doublon: "#ff0000"}}};
  globalThis.chrome = {
    runtime: {id: "test"},
    storage: {
      local: {get: async (key) => (key in saved ? {[key]: structuredClone(saved[key])} : {}), set: async () => {}, remove: async () => {}},
      onChanged: {addListener() {}, removeListener() {}},
    },
  };
  try {
    const {settings, themes} = loadExtensionModule({settings: "extension/src/content/state/settings.js", themes: "extension/src/content/state/themes.js"});
    await settings.settings.ready;
    assert.deepEqual(settings.settings.get().themeColors, {Doublon: "#ff0000"}, "seule la couleur de Doublon reste à part");
    assert.equal(themes.tagColor("Sports"), "#123456");
    assert.equal(themes.tagColor("Politique Française"), "#abcdef");
    assert.equal(themes.tagColor("Doublon"), "#ff0000");
    assert.deepEqual(settings.settings.get().themes.renames, {});

    const set = themes.themeSet();
    assert.equal(themes.themeSet(), set, "liste compilée une seule fois");
    themes.saveThemes(edited((l) => (byId(l, "Sports").name = "Sport")));
    assert.notEqual(themes.themeSet(), set);
    assert.equal(themes.classify(card("Kasper Hjulmand", "footballeur danois"))[0], "Sport");
    assert.deepEqual(themes.pendingThemeTags().renames, {Sports: "Sport"});
    assert.ok(themes.isTheme("Sport") && !themes.isTheme("Sports"));
    themes.settleThemeTags(["Sports"]);
    assert.deepEqual(themes.pendingThemeTags().renames, {});
  } finally {
    delete globalThis.chrome;
  }
});
