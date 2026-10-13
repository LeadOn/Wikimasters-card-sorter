// Plan de synchronisation des tags : modes complet et incrémental.
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../core");

const uc = (id, cardId, title, category, extra = {}) => ({id, card_id: cardId, cards: {id: cardId, wikipedia_title: title, category, summary: ""}, ...extra});
const collection = [
  uc("u1", "c1", "Lyon", "commune française du département du Rhône"),
  uc("u2", "c2", "Zinédine Zidane", "footballeur français"),
  uc("u3", "c2", "Zinédine Zidane", "footballeur français"),
  uc("u4", "c4", "Saturne", "planète du Système solaire"),
];
const managed = core.managedTags();
const tags = [
  {id: "t-geo", name: "Géographie & Territoires", color: "#16a34a"},
  {id: "t-sport", name: "Sports", color: "#000000"},
  {id: "t-perso", name: "Favoris", color: "#fff"},
];

test("doublons : plusieurs lignes ou une ligne avec count > 1", () => {
  const a = core.computeAssignments([...collection, uc("u5", "c5", "Paris", "capitale de la France", {count: 2})]);
  const byId = Object.fromEntries(a.map((x) => [x.userCard.id, x.tags]));
  assert.ok(byId.u2.includes("Doublon") && byId.u3.includes("Doublon"));
  assert.ok(byId.u5.includes("Doublon"));
  assert.ok(!byId.u1.includes("Doublon"));
});

test("doublons : comptés sur toute la collection même quand le classement se fait par tranches", () => {
  // u2 et u3 (même carte) dans deux tranches différentes
  const copies = core.countCopies(collection);
  const chunked = [...core.computeAssignments(collection.slice(0, 2), {copies}), ...core.computeAssignments(collection.slice(2), {copies})];
  assert.deepEqual(chunked, core.computeAssignments(collection));
  const naive = core.computeAssignments(collection.slice(2));
  assert.ok(!naive.find((a) => a.userCard.id === "u3").tags.includes("Doublon"), "sans `copies`, une tranche seule ne voit pas le doublon");
});

test("mode incrémental : seules les cartes sans thème sont classées, Doublon recalculé partout", () => {
  const assignments = core.computeAssignments(collection);
  // u1 déjà triée (et corrigée à la main en Sports), u2 triée, u3 et u4 non triées
  const current = new Map([
    ["t-geo", new Set()],
    ["t-sport", new Set(["u1", "u2"])],
  ]);
  const plan = core.planChanges(assignments, tags, current, {newOnly: true, managed});
  assert.deepEqual([...plan.fresh].sort(), ["u3", "u4"]);
  const inserted = plan.toInsert.map((i) => `${i.name}:${i.userCardId}`).sort();
  assert.deepEqual(inserted, ["Astronomie & Espace:u4", "Doublon:u2", "Doublon:u3", "Sports:u3"]);
  assert.deepEqual(plan.toDelete, [], "aucune suppression hors Doublon");
});

test("mode complet : resynchronise et retire les tags gérés obsolètes, jamais les tags personnels", () => {
  const assignments = core.computeAssignments(collection);
  const current = new Map([
    ["t-geo", new Set()],
    ["t-sport", new Set(["u1", "u2", "u3"])],
  ]);
  const plan = core.planChanges(assignments, tags, current, {newOnly: false, managed});
  assert.ok(plan.toDelete.some((d) => d.tagId === "t-sport" && d.ids.includes("u1")));
  assert.ok(plan.toInsert.some((i) => i.name === "Géographie & Territoires" && i.userCardId === "u1"));
  assert.ok(!plan.toDelete.some((d) => d.tagId === "t-perso"));
});

test("tags en double supprimés en mode complet seulement", () => {
  const dupTags = [...tags, {id: "t-sport-2", name: "Sports", color: "#ea580c"}];
  const current = new Map([["t-geo", new Set()], ["t-sport", new Set()], ["t-sport-2", new Set(["u2"])]]);
  const assignments = core.computeAssignments(collection);
  assert.deepEqual(core.planChanges(assignments, dupTags, current, {newOnly: false, managed}).extraTagIds, ["t-sport-2"]);
  assert.deepEqual(core.planChanges(assignments, dupTags, current, {newOnly: true, managed}).extraTagIds, []);
});

test("création et recoloration des tags", () => {
  const {create, recolor} = core.planTagUpserts(tags, managed, [{name: "Astronomie & Espace", userCardId: "u4"}], {newOnly: true});
  assert.deepEqual(create.map((c) => c.name), ["Astronomie & Espace"]);
  assert.deepEqual(recolor.map((r) => r.id), ["t-sport"]);
  const full = core.planTagUpserts(tags, managed, [], {newOnly: false});
  assert.equal(full.create.length, Object.keys(managed).length - 2);
});

test("profils : les tags « Pour : … » gérés suivent les profils actifs", () => {
  const profiles = [{name: "Ana", color: "#123456", rules: [{theme: "Sports"}]}];
  const m = core.managedTags({profiles, themeColors: {Sports: "#111111"}});
  assert.equal(m["Pour : Ana"], "#123456");
  assert.equal(m.Sports, "#111111");
  assert.ok(!("Pour : Bob" in m));
  const a = core.computeAssignments(collection, {profiles});
  assert.ok(a.find((x) => x.userCard.id === "u2").tags.includes("Pour : Ana"));
});
