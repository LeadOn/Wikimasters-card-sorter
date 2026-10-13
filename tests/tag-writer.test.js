// Écriture des étiquettes : reprise après interruption, pas de doublon, politique d'erreur.
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../core");

const httpError = (status, code) => Object.assign(new Error(`HTTP ${status}`), {status, code});

// Base en mémoire. failures : [{op, when(args) → bool, error}] consommées dans l'ordre.
function fakeDb({tags = [], links = []} = {}) {
  const db = {tags: tags.map((t) => ({...t})), links: new Set(links.map(([u, t]) => `${u}|${t}`)), calls: [], failures: []};
  let nextId = 1;
  const maybeFail = (op, args) => {
    db.calls.push(op);
    const i = db.failures.findIndex((f) => f.op === op && (!f.when || f.when(args)));
    if (i >= 0) throw db.failures.splice(i, 1)[0].error;
  };
  db.client = {
    async listTags() {
      maybeFail("listTags");
      return db.tags.map((t) => ({...t}));
    },
    async createTag({name, color}) {
      maybeFail("createTag", {name});
      const tag = {id: `new-${nextId++}`, name, color};
      db.tags.push(tag);
      return tag;
    },
    async recolorTag(id, color) {
      maybeFail("recolorTag", {id});
      db.tags.find((t) => t.id === id).color = color;
    },
    async insertLinks(rows) {
      maybeFail("insertLinks", rows);
      if (rows.some((r) => r.user_card_id === "bad")) throw httpError(409, "23503");
      for (const r of rows) db.links.add(`${r.user_card_id}|${r.tag_id}`);
    },
    async deleteLinks(tagId, ids) {
      maybeFail("deleteLinks", {tagId, ids});
      for (const id of ids) db.links.delete(`${id}|${tagId}`);
    },
    async deleteTag(id) {
      maybeFail("deleteTag", {id});
      db.tags = db.tags.filter((t) => t.id !== id);
    },
  };
  return db;
}

const managed = {Sports: "#ea580c", Histoire: "#a16207", Doublon: "#dc2626"};
const plan = (over = {}) => ({
  managed,
  toInsert: [
    {name: "Sports", userCardId: "u1"},
    {name: "Histoire", userCardId: "u2"},
    {name: "Doublon", userCardId: "u1"},
  ],
  toDelete: [{name: "Sports", tagId: "t-sport", ids: ["u9"]}],
  extraTagIds: [],
  upserts: {existing: {Sports: {id: "t-sport", name: "Sports", color: "#000000"}}, create: [{name: "Histoire", color: "#a16207"}, {name: "Doublon", color: "#dc2626"}], recolor: [{id: "t-sport", color: "#ea580c"}]},
  ...over,
});

test("applyPlan : étiquettes créées, associations ajoutées puis retirées", async () => {
  const db = fakeDb({tags: [{id: "t-sport", name: "Sports", color: "#000000"}], links: [["u9", "t-sport"]]});
  const r = await core.applyPlan(db.client, plan());
  assert.deepEqual(r, {inserted: 3, failed: 0, deleted: 1});
  assert.deepEqual(db.tags.map((t) => t.name).sort(), ["Doublon", "Histoire", "Sports"]);
  assert.equal(db.tags.find((t) => t.id === "t-sport").color, "#ea580c");
  assert.ok(!db.links.has("u9|t-sport"));
  assert.equal(db.links.size, 3);
});

test("applyPlan relancé après une interruption : rien n'est créé en double", async () => {
  const db = fakeDb({tags: [{id: "t-sport", name: "Sports", color: "#000000"}]});
  db.failures.push({op: "insertLinks", error: httpError(0)});
  await assert.rejects(core.applyPlan(db.client, plan()), (e) => e.status === 0 && e.partial.inserted === 0);
  // Les étiquettes ont été créées avant la panne ; le même plan est rejoué tel quel
  const r = await core.applyPlan(db.client, plan());
  assert.equal(r.inserted, 3);
  assert.equal(db.tags.filter((t) => t.name === "Histoire").length, 1, "Histoire n'est pas recréée");
  assert.equal(db.tags.filter((t) => t.name === "Doublon").length, 1);
});

test("insertLinks : une ligne refusée ne bloque que cette ligne", async () => {
  const db = fakeDb();
  const rows = [{user_card_id: "u1", tag_id: "t"}, {user_card_id: "bad", tag_id: "t"}, {user_card_id: "u3", tag_id: "t"}];
  assert.deepEqual(await core.insertLinks(db.client, rows), {inserted: 2, failed: 1});
});

test("insertLinks : une panne (réseau, session, serveur) arrête tout, sans rejouer ligne par ligne", async () => {
  for (const error of [httpError(0), httpError(401), httpError(503), httpError(429)]) {
    const db = fakeDb();
    db.failures.push({op: "insertLinks", error});
    const rows = Array.from({length: 250}, (_, i) => ({user_card_id: `u${i}`, tag_id: "t"}));
    await assert.rejects(core.insertLinks(db.client, rows), (e) => e === error);
    assert.equal(db.calls.length, 1, `HTTP ${error.status} : une seule requête`);
  }
});

test("insertLinks : lots de 100", async () => {
  const db = fakeDb();
  const rows = Array.from({length: 250}, (_, i) => ({user_card_id: `u${i}`, tag_id: "t"}));
  const progress = [];
  await core.insertLinks(db.client, rows, {onProgress: (done, total) => progress.push(`${done}/${total}`)});
  assert.equal(db.calls.length, 3);
  assert.deepEqual(progress, ["0/250", "100/250", "200/250", "250/250"]);
});

test("ensureTags : réutilise une étiquette créée entre-temps (autre onglet), sans relire si rien ne manque", async () => {
  const db = fakeDb({tags: [{id: "t-h", name: "Histoire", color: "#a16207"}]});
  const ids = await core.ensureTags(db.client, {Histoire: "#a16207", Sports: "#ea580c"}, {known: []});
  assert.equal(ids.get("Histoire"), "t-h");
  assert.ok(ids.get("Sports").startsWith("new-"));
  assert.deepEqual(db.calls, ["listTags", "createTag"]);
  db.calls.length = 0;
  await core.ensureTags(db.client, {Histoire: "#a16207"}, {known: db.tags});
  assert.deepEqual(db.calls, [], "tout est connu : aucune requête");
});

test("ensureTags : réponse de création inattendue → erreur claire", async () => {
  const db = fakeDb();
  db.client.createTag = async () => undefined;
  await assert.rejects(core.ensureTags(db.client, {Sports: "#000"}), /réponse inattendue/);
});
