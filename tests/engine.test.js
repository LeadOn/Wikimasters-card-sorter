// Moteur de classement : jeu de cartes étiquetées et profils d'intérêts.
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../core");
const cards = require("../scripts/fixtures/labeled_cards.json");

const categorize = (c) => core.categorize({wikipedia_title: c.title, category: c.category, summary: c.summary, image_url: c.image_url}, {profiles: core.BUILTIN_PROFILES});

test("le thème générique reste au moins à 99 % sur le jeu étiqueté", () => {
  const labeled = cards.filter((c) => c.expected);
  const ok = labeled.filter((c) => [].concat(c.expected).includes(categorize(c)[0])).length;
  assert.ok(ok / labeled.length >= 0.99, `${ok}/${labeled.length}`);
});

test("les tags par ami du jeu étiqueté sont respectés", () => {
  const failures = [];
  for (const c of cards.filter((x) => x.friends)) {
    const tags = categorize(c);
    for (const t of c.friends.include || []) if (!tags.includes(t)) failures.push(`${c.title} : ${t} attendu`);
    for (const t of c.friends.exclude || []) if (tags.includes(t)) failures.push(`${c.title} : ${t} non attendu`);
  }
  assert.deepEqual(failures, []);
});

test("sans profil, seul le thème générique est renvoyé", () => {
  const tags = core.categorize({wikipedia_title: "Requin blanc", category: "espèce de poissons"});
  assert.deepEqual(tags, ["Faune & Flore"]);
});

test("les corrections manuelles ne s'appliquent que sans thème fiable", () => {
  const card = {wikipedia_title: "Zzqx", category: "", summary: ""};
  const mapping = {Sports: ["uc-1"]};
  assert.equal(core.categorize(card, {manualMapping: mapping, userCardId: "uc-1"})[0], "Sports");
  const known = {wikipedia_title: "Lyon", category: "commune française du département du Rhône"};
  assert.equal(core.categorize(known, {manualMapping: {Sports: ["uc-2"]}, userCardId: "uc-2"})[0], "Géographie & Territoires");
});
