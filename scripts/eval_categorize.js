// Évalue categorize() sur un jeu de cartes étiquetées à la main (scripts/fixtures/labeled_cards.json).
// Aucun accès réseau : à lancer après chaque modification des règles.
//   node scripts/eval_categorize.js            → score + erreurs
//   node scripts/eval_categorize.js --verbose  → + scores détaillés des erreurs
const core = require("../core");
const {explain} = core;
const categorize = (card) => core.categorize(card, {profiles: core.BUILTIN_PROFILES});
const cards = require("./fixtures/labeled_cards.json");

const verbose = process.argv.includes("--verbose");
let ok = 0;
let total = 0;
const errors = [];
const perTheme = {};
const stat = (theme) => (perTheme[theme] ||= {tp: 0, fp: 0, fn: 0});

for (const c of cards) {
  if (!c.expected) continue;
  const card = {wikipedia_title: c.title, category: c.category, summary: c.summary};
  const got = categorize(card)[0];
  const expected = [].concat(c.expected);
  total++;
  if (expected.includes(got)) {
    ok++;
    stat(got).tp++;
  } else {
    stat(got).fp++;
    stat(expected[0]).fn++;
    errors.push({c, card, got, expected});
  }
}

const friendFailures = [];
for (const c of cards) {
  if (!c.friends) continue;
  const tags = categorize({wikipedia_title: c.title, category: c.category, summary: c.summary});
  for (const t of c.friends.include || [])
    if (!tags.includes(t)) friendFailures.push(`${c.title} : "${t}" attendu`);
  for (const t of c.friends.exclude || [])
    if (tags.includes(t)) friendFailures.push(`${c.title} : "${t}" non attendu`);
}

console.log(`Thème générique : ${ok}/${total} (${((100 * ok) / total).toFixed(1)} %)\n`);
console.log("Thème                           préc.   rappel");
for (const [theme, s] of Object.entries(perTheme).sort()) {
  const p = s.tp + s.fp ? `${Math.round((100 * s.tp) / (s.tp + s.fp))} %` : "-";
  const r = s.tp + s.fn ? `${Math.round((100 * s.tp) / (s.tp + s.fn))} %` : "-";
  console.log(`  ${theme.padEnd(30)} ${p.padStart(5)}   ${r.padStart(5)}`);
}

if (errors.length) {
  console.log(`\nErreurs (${errors.length}) :`);
  for (const {c, card, got, expected} of errors) {
    console.log(`  - ${c.title} [${c.category || ""}] → ${got} (attendu : ${expected.join(" | ")})`);
    if (verbose) {
      const top = Object.entries(explain(card).scores).sort((a, b) => b[1] - a[1]).slice(0, 3);
      console.log(`      scores : ${top.map(([t, s]) => `${t} ${s}`).join(", ") || "aucun"}`);
    }
  }
}

const friendChecks = cards.filter((c) => c.friends).length;
console.log(`\nTags par ami : ${friendChecks - new Set(friendFailures.map((f) => f.split(" : ")[0])).size}/${friendChecks} cartes OK`);
for (const f of friendFailures) console.log(`  - ${f}`);
