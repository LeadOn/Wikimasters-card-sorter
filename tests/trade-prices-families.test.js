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

test("prix : médiane des dernières ventes, ventes minimum, premières ventes ignorées, shiny à part", () => {
  // recent : du plus récent au plus ancien ; une vente aberrante ne déplace pas la médiane
  const summary = {
    UR: {average: 3100, count: 6, latest: 300, recent: [300, 320, 15000, 310, 290, 305]},
    SR: {average: 216, count: 2, latest: 200, recent: [200, 232]},
    R: {average: 15150, count: 1, latest: 15150, recent: [15150]},
    L: {average: 500, count: 4, latest: 450, recent: [450, 520, 480, 510], shiny: {count: 1, latest: 4000, recent: [4000]}},
  };
  assert.deepEqual(core.priceInfo(summary, "UR"), {price: 310, sales: 5, total: 6, reliable: true, average: 3100, latest: 300}, "la 1re vente (305) est ignorée");
  assert.equal(core.marketPrice(summary, "UR", {skipFirst: 0}), 308, "médiane paire : moyenne des deux du milieu, arrondie");
  // Trop peu de ventes : prix indicatif seulement
  assert.deepEqual(core.priceInfo(summary, "SR"), {price: 200, sales: 1, total: 2, reliable: false, average: 216, latest: 200});
  assert.equal(core.marketPrice(summary, "SR"), null);
  assert.equal(core.marketPrice(summary, "SR", {minSales: 1}), 200);
  assert.equal(core.marketPrice(summary, "SR", {minSales: 2, skipFirst: 0}), 216);
  // Une seule vente, ignorée : vendue, mais sans prix
  assert.deepEqual(core.priceInfo(summary, "R"), {price: null, sales: 0, total: 1, reliable: false, average: 15150, latest: 15150});
  assert.equal(core.marketPrice(summary, "R", {minSales: 1, skipFirst: 0}), 15150);
  assert.equal(core.priceInfo(summary, "C"), null, "jamais vendue");
  // Shiny : ses propres ventes seulement
  assert.equal(core.marketPrice(summary, "L"), 480, "la plus ancienne (510) est ignorée");
  assert.equal(core.marketPrice(summary, "L", {shiny: true}), null, "une vente shiny, ignorée");
  assert.equal(core.marketPrice(summary, "L", {shiny: true, minSales: 1, skipFirst: 0}), 4000);
  assert.equal(core.priceInfo(summary, "UR", {shiny: true}), null);
  // Résumé du site (moyenne seule) : pas de premières ventes à écarter
  const site = {UR: {average: 319.4, count: 10, latest: 300}, SR: {average: 216, count: 1}};
  assert.deepEqual(core.priceInfo(site, "UR"), {price: 319, sales: 10, total: 10, reliable: true, average: 319, latest: 300});
  assert.equal(core.marketPrice(site, "SR"), null);
  assert.equal(core.marketPrice({UR: {average: null, count: 3}}, "UR"), null, "moyenne absente : pas de prix à 0");

  // Valeur : seuls les prix fiables comptent ; une shiny au prix shiny
  const prices = new Map([["a", summary]]);
  const copies = [{card_id: "a", rarity: "UR", count: 2}, {card_id: "a", rarity: "SR"}, {card_id: "a", rarity: "L", is_shiny: true}, {card_id: "b", rarity: "C"}];
  assert.deepEqual(core.collectionValue(copies, prices), {value: 620, priced: 2, total: 5});
  assert.deepEqual(core.collectionValue(copies, prices, {minSales: 1, skipFirst: 0}), {value: 616 + 216 + 4000, priced: 4, total: 5});
  // Jamais vendues : dans la rareté de l'exemplaire, ou dans aucune ; une carte non lue reste à part.
  // Une vente compte, même ignorée pour le prix, et même shiny.
  const sold = new Map([["a", {UR: {average: 1, count: 1}, SR: {average: 1, count: 1}}], ["z", {}], ["s", {L: {average: null, count: 0, recent: [], shiny: {count: 1, latest: 9, recent: [9]}}}]]);
  const owned = [{card_id: "a", rarity: "UR"}, {card_id: "a", rarity: "L"}, {card_id: "z", rarity: "C"}, {card_id: "b", rarity: "C"}, {card_id: "s", rarity: "L"}];
  const inRarity = core.unsoldCopies(owned, sold);
  assert.deepEqual(inRarity.unsold.map((c) => `${c.card_id}|${c.rarity}`), ["a|L", "z|C"]);
  assert.deepEqual(inRarity.unknown.map((c) => c.card_id), ["b"]);
  assert.deepEqual(core.unsoldCopies(owned, sold, {anyRarity: true}).unsold.map((c) => c.card_id), ["z"], "a s'est vendue en UR et SR");
  // Regroupement par carte et rareté ; exemplaire à vendre ou défausser : jamais un favori, shiny en dernier
  const groups = core.groupCopies([{id: "u1", card_id: "a", rarity: "C", count: 2}, {id: "u2", card_id: "a", rarity: "R"}, {id: "u3", card_id: "a", rarity: "C"}]);
  assert.deepEqual(groups.map((g) => [g.card_id, g.rarity, g.count, g.rows.map((r) => r.id)]), [["a", "C", 3, ["u1", "u3"]], ["a", "R", 1, ["u2"]]]);
  assert.equal(core.freeCopy([{id: "u1", starred: true}, {id: "u2", is_shiny: true}, {id: "u3"}]).id, "u3");
  assert.equal(core.freeCopy([{id: "u1", starred: true}]), null);
  const spares = core.spareCards([{id: "u1", card_id: "a", rarity: "SR"}, {id: "u2", card_id: "a", rarity: "UR", starred: true}, {id: "u3", card_id: "b"}]);
  assert.equal(spares.length, 1);
  assert.equal(spares[0].spare, 1);
  assert.equal(spares[0].rarity, "SR", "on vend d'abord l'exemplaire le moins rare");
  assert.equal(spares[0].sellCopyId, "u1", "le site attend l'id de l'exemplaire");
  // Jamais un favori, même moins rare ; une shiny en dernier ; plusieurs exemplaires sur une ligne (count)
  const [a] = core.spareCards([{id: "u1", card_id: "a", rarity: "C", starred: true}, {id: "u2", card_id: "a", rarity: "R", is_shiny: true}, {id: "u3", card_id: "a", rarity: "R"}]);
  assert.deepEqual([a.sellCopyId, a.rarity], ["u3", "R"]);
  const [b] = core.spareCards([{id: "u1", card_id: "a", rarity: "C", count: 3}]);
  assert.deepEqual([b.sellCopyId, b.spare], ["u1", 2]);
  // Tous en favori : rien à mettre en vente
  const [c] = core.spareCards([{id: "u1", card_id: "a", rarity: "C", starred: true}, {id: "u2", card_id: "a", rarity: "R", starred: true}]);
  assert.deepEqual([c.sellCopyId, c.rarity], [null, "C"]);
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

test("résumé des ventes : moyenne du site (200 dernières, hors shiny), 30 derniers prix, shiny à part", () => {
  const at = (i) => new Date(Date.UTC(2026, 9, 12, 0, 0, 0) - i * 1000).toISOString(); // i : ancienneté
  const rows = [];
  for (let i = 0; i < 260; i++) rows.push({id: `n${i}`, card_id: "a", snapshot_rarity: "L", final_price: i < 200 ? 100 + (i % 3) : 900, settled_at: at(i), is_shiny: false});
  for (let i = 0; i < 3; i++) rows.push({id: `s${i}`, card_id: "a", snapshot_rarity: "L", final_price: 4000 + i, settled_at: at(i + 0.5), is_shiny: true});
  rows.push({card_id: "a", snapshot_rarity: "SR", final_price: 51, settled_at: "2026-10-01T00:00:00Z"});
  rows.push({card_id: "b", snapshot_rarity: "C", final_price: null, settled_at: "2026-10-01T00:00:00Z"});
  rows.push({card_id: "c", snapshot_rarity: "UR", final_price: 7000, settled_at: "2026-10-01T00:00:00Z", is_shiny: true});
  const s = core.summarizeSales(rows.reverse());
  const L = s.get("a").L;
  assert.equal(L.average, 101, "les ventes shiny ne comptent pas dans la moyenne, comme sur le site");
  assert.equal(L.count, 200);
  assert.equal(L.latest, 100);
  assert.equal(L.recent.length, 30);
  assert.deepEqual(L.recent.slice(0, 4), [100, 101, 102, 100], "du plus récent au plus ancien");
  assert.deepEqual(L.shiny, {count: 3, latest: 4000, recent: [4000, 4001, 4002]});
  assert.deepEqual(s.get("a").SR, {average: 51, count: 1, latest: 51, recent: [51]});
  assert.equal(s.has("b"), false);
  assert.deepEqual(s.get("c").UR, {average: null, count: 0, latest: null, recent: [], shiny: {count: 1, latest: 7000, recent: [7000]}}, "vendue seulement en shiny");
  assert.equal(core.priceInfo(s.get("c"), "UR"), null);
  assert.equal(core.soldIn(s.get("c"), "UR"), true);
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
    cards: [
      ["1", "Yoda", "UR", "personnage", "javascript:alert(1)", 1],
      "pas une carte",
      [null, "sans id"],
      ["1", "Yoda bis"],
      ["2", "Vador", "XX", 5, "https://x/y.png"],
      ["3", "Leia", "R", "", "", 0],
      ["4", "Han", "R", "", "", "oui"],
    ],
    cover: "inconnue",
  });
  assert.equal(back.name, "Mix");
  assert.deepEqual(back.rule, {query: "", keywords: "a", exclude: "", themes: ["Sports"], rarities: ["UR"]});
  // 6e valeur : image masquée (1) ou visible (0) ; absente (ancien code) ou invalide → inconnue
  assert.deepEqual(back.cards, [
    {id: "1", title: "Yoda", rarity: "UR", category: "personnage", image_url: null, hide_image: true},
    {id: "2", title: "Vador", rarity: null, category: "", image_url: "https://x/y.png", hide_image: null},
    {id: "3", title: "Leia", rarity: "R", category: "", image_url: null, hide_image: false},
    {id: "4", title: "Han", rarity: "R", category: "", image_url: null, hide_image: null},
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
