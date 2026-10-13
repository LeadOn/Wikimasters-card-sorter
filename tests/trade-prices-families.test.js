// Échanges, prix, familles et codes de partage.
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../core");

const card = (id, title, category, rarity = "C", extra = {}) => ({id, wikipedia_title: title, category, rarity, summary: "", ...extra});

test("recherche d'échanges : à demander, à proposer, tri", () => {
  const me = {name: "Moi", rules: [{theme: "Sports"}]};
  const ami = {name: "Ami", rules: [{theme: "Astronomie & Espace"}]};
  const mine = [
    {id: "m1", card_id: "a", cards: card("a", "Saturne", "planète du Système solaire")},
    {id: "m2", card_id: "b", cards: card("b", "Lyon", "commune française")},
    {id: "m3", card_id: "b", cards: card("b", "Lyon", "commune française")},
  ];
  const friendItems = [
    {id: "f1", card_id: "z", count: 1, card: card("z", "Zinédine Zidane", "footballeur français", "SR")},
    {id: "f2", card_id: "y", count: 2, card: card("y", "Teddy Riner", "judoka français", "C")},
    {id: "f3", card_id: "x", count: 1, card: card("x", "Le Penseur", "sculpture d'Auguste Rodin", "UR")},
    {id: "f4", card_id: "a", count: 1, card: card("a", "Saturne", "planète du Système solaire")},
  ];
  const r = core.findTrades({mine, friendItems, wanted: ["Pour : Moi"], friendTag: "Pour : Ami", profiles: [me, ami], wishlist: new Set(["x"])});
  assert.deepEqual(r.toAsk.map((c) => c.card_id), ["x", "y", "z"], "souhaits, puis doublons de l'ami, puis rareté");
  assert.deepEqual(r.toOffer.map((c) => c.card_id), [], "Saturne est déjà chez l'ami");
  const r2 = core.findTrades({mine, friendItems: friendItems.slice(0, 3), wanted: ["Pour : Moi"], friendTag: null, profiles: [me]});
  assert.deepEqual(r2.toOffer.map((c) => c.card_id), ["b"], "sans profil d'ami : mes doublons qu'il n'a pas");
});

test("offre équilibrée", () => {
  const cands = [
    {card_id: "a", price: 100, spare: true},
    {card_id: "b", price: 60, spare: false},
    {card_id: "c", price: 30, spare: true},
    {card_id: "d", price: 0, spare: true},
  ];
  const {chosen, total} = core.balanceOffer(120, cands);
  assert.ok(total >= 108 && total <= 160, String(total));
  assert.ok(chosen.every((c) => c.price > 0));
  assert.equal(chosen[0].card_id, "a", "doublons d'abord");
});

test("prix : moyenne par rareté, valeur et doublons vendables", () => {
  const summary = {UR: {average: 319.4, count: 10}, SR: {average: 216}};
  assert.equal(core.averagePrice(summary, "UR"), 319);
  assert.equal(core.averagePrice(summary, "L"), null);
  const prices = new Map([["a", summary]]);
  assert.deepEqual(core.collectionValue([{card_id: "a", rarity: "UR", count: 2}, {card_id: "b", rarity: "C"}], prices), {value: 638, priced: 2, total: 3});
  const spares = core.spareCards([{card_id: "a", rarity: "SR"}, {card_id: "a", rarity: "UR", starred: true}, {card_id: "b"}]);
  assert.equal(spares.length, 1);
  assert.equal(spares[0].spare, 1);
  assert.equal(spares[0].rarity, "SR", "on vend d'abord l'exemplaire le moins rare");
});

test("familles : règle, progression, partage", async () => {
  const rule = {query: "star wars", keywords: "jedi, sith", exclude: "jeu vidéo", rarities: ["UR", "SR"]};
  assert.ok(core.matchesFamilyRule(card("1", "Yoda", "personnage jedi de Star Wars", "UR"), rule));
  assert.ok(!core.matchesFamilyRule(card("2", "Yoda", "personnage jedi de Star Wars", "C"), rule));
  assert.ok(!core.matchesFamilyRule(card("3", "Jedi Knight", "jeu vidéo jedi", "SR"), rule));
  const family = {name: "Star Wars", kind: "smart", rule, cards: [core.compactCard(card("1", "Yoda", "personnage", "UR")), core.compactCard(card("4", "Dark Vador", "sith", "SR"))], cover: "1"};
  assert.deepEqual(core.familyProgress(family, new Set(["1"])), {owned: 1, total: 2, missing: 1, percent: 50});
  const code = await core.encodeShareCode("F", core.familyToShare(family));
  assert.match(code, /^WMT-F1\./);
  const back = core.familyFromShare((await core.decodeShareCode(code, "F")).payload);
  assert.deepEqual(back.cards, family.cards);
  assert.deepEqual(back.rule, {...rule, themes: []}, "règle normalisée à l'import");
  await assert.rejects(core.decodeShareCode(code, "P"), /pas un code de profil/);
  await assert.rejects(core.decodeShareCode("WMT-P1.abc!", "P"), /Code invalide/);
  await assert.rejects(core.decodeShareCode("WMT-P1.AAAA", "P"), /incomplet/);
});

test("codes de profil : aller-retour sans perte", async () => {
  for (const p of core.BUILTIN_PROFILES) {
    const {payload} = await core.decodeShareCode(await core.encodeShareCode("P", p), "P");
    assert.deepEqual(payload, p);
  }
});

test("résumé des ventes identique au site : 200 dernières ventes par rareté", () => {
  const rows = [];
  for (let i = 0; i < 260; i++) rows.push({card_id: "a", snapshot_rarity: "L", final_price: i < 200 ? 100 : 900, settled_at: new Date(Date.UTC(2026, 9, 12, 0, 0, 260 - i)).toISOString()});
  rows.push({card_id: "a", snapshot_rarity: "SR", final_price: 51, settled_at: "2026-10-01T00:00:00Z"});
  rows.push({card_id: "b", snapshot_rarity: "C", final_price: null, settled_at: "2026-10-01T00:00:00Z"});
  const s = core.summarizeSales(rows.reverse());
  assert.deepEqual(s.get("a"), {L: {average: 100, count: 200, latest: 100}, SR: {average: 51, count: 1, latest: 51}});
  assert.equal(s.has("b"), false);
});

test("lots de prix pondérés par rareté", () => {
  const items = [{id: "l1", rarity: "L"}, {id: "l2", rarity: "L"}, {id: "u", rarity: "UR"}, ...Array.from({length: 300}, (_, i) => ({id: `c${i}`, rarity: "C"}))];
  const batches = core.priceBatches(items);
  assert.equal(batches.flat().length, items.length);
  assert.deepEqual(batches[0].slice(0, 3), ["l1", "l2", "u"], "les cartes lourdes d'abord");
  assert.ok(batches.every((b) => b.length <= 150));
  assert.deepEqual(core.priceBatches([{id: "x"}]), [["x"]]);
});

test("nouveautés d'un paquet", () => {
  const cards = [{id: "a"}, {id: "b"}, {id: "a"}, {id: "c"}];
  // a : 2 exemplaires après le tirage (tous deux tirés) ; b : 3 (2 d'avant) ; c : inconnu (pas encore lu)
  const copies = new Map([["a", 2], ["b", 3]]);
  assert.deepEqual(core.packNovelty(cards, copies), [true, false, false, true]);
});

test("import d'une famille : champs vérifiés un à un", () => {
  const back = core.familyFromShare({
    name: "  Mix  ",
    kind: "smart",
    rule: {query: 42, keywords: "a", themes: ["Sports", 3], rarities: ["UR", "ZZ"]},
    cards: [["1", "Yoda", "UR", "personnage", "javascript:alert(1)"], "pas une carte", [null, "sans id"], ["1", "Yoda bis"], ["2", "Vador", "XX", 5, "https://x/y.png"]],
    cover: "inconnue",
  });
  assert.equal(back.name, "Mix");
  assert.deepEqual(back.rule, {query: "", keywords: "a", exclude: "", themes: ["Sports"], rarities: ["UR"]});
  assert.deepEqual(back.cards, [
    {id: "1", title: "Yoda", rarity: "UR", category: "personnage", image_url: null},
    {id: "2", title: "Vador", rarity: null, category: "", image_url: "https://x/y.png"},
  ]);
  assert.equal(back.cover, null);
  assert.throws(() => core.familyFromShare({name: "", cards: []}), /illisible/);
  assert.throws(() => core.familyFromShare(null), /illisible/);
});

test("codes de partage : contenu illisible ou anormalement volumineux refusé", async () => {
  // JSON invalide une fois décompressé
  const notJson = `WMT-P1.${core.bytesToBase64Url(new Uint8Array(await new Response(new Blob([new TextEncoder().encode("{pas du json")]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer()))}`;
  await assert.rejects(core.decodeShareCode(notJson, "P"), /incomplet ou abîmé/);
  // Quelques Ko qui se décompressent en plusieurs Mo
  const huge = await core.encodeShareCode("P", {name: "x", pad: "a".repeat(3 * 1024 * 1024)});
  assert.ok(huge.length < 20000);
  await assert.rejects(core.decodeShareCode(huge, "P"), /volumineux/);
});

test("recherche d'échanges : un exemplaire avec count > 1 compte comme doublon", () => {
  const mine = [{id: "m1", card_id: "b", count: 3, cards: card("b", "Lyon", "commune française")}];
  const r = core.findTrades({mine, friendItems: [], wanted: ["Sports"], friendTag: null});
  assert.deepEqual(r.toOffer.map((c) => [c.card_id, c.copies]), [["b", 3]]);
});

test("couleurs des raretés : celles du site, identiques dans l'extension", () => {
  assert.deepEqual(Object.keys(core.RARITY_COLORS), core.RARITIES);
  const css = require("node:fs").readFileSync(require("node:path").join(__dirname, "../extension/src/content/ui/panel.css"), "utf8");
  for (const [r, color] of Object.entries(core.RARITY_COLORS)) assert.match(css, new RegExp(`--r-${r}: ${color};`), `--r-${r} dans panel.css`);
});
