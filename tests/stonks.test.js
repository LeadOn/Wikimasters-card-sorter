// Page « Stonks » : opérations du joueur, appariement achat → revente, plus-value, périodes.
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../core");

const ME = "me";
// Date locale (les périodes sont en heure locale) : jour J d'octobre 2026, à l'heure h
const oct = (day, h = 12, min = 0) => new Date(2026, 9, day, h, min).toISOString();
const sale = (id, card, price, at, extra = {}) => ({id, card_id: card, snapshot_rarity: "C", final_price: price, settled_at: at, is_shiny: false, seller_id: ME, winner_id: "other", ...extra});
const buy = (id, card, price, at, extra = {}) => sale(id, card, price, at, {seller_id: "other", winner_id: ME, ...extra});

test("ledger : achats et ventes du joueur, dans l'ordre, sans doublon ni ligne invalide", () => {
  const ops = core.ledger(
    [
      sale("s1", "a", 150, oct(3)),
      buy("b1", "a", 100, oct(1)),
      buy("b1", "a", 100, oct(1)),
      sale("x", "a", 10, oct(2), {seller_id: "other"}),
      sale("y", "a", null, oct(2)),
      sale("z", "a", 10, "pas une date"),
    ],
    ME,
  );
  assert.deepEqual(
    ops.map((o) => [o.id, o.side, o.price]),
    [
      ["b1", "buy", 100],
      ["s1", "sell", 150],
    ],
  );
});

test("appariement premier entré, premier sorti, par carte, rareté et version shiny", () => {
  const ops = core.ledger(
    [
      buy("b1", "a", 100, oct(1)),
      buy("b2", "a", 300, oct(2)),
      sale("s1", "a", 250, oct(3)),
      sale("s2", "a", 200, oct(4)),
      sale("s3", "a", 90, oct(5)), // plus rien en stock : carte tirée d'un paquet
      buy("b3", "b", 50, oct(1), {snapshot_rarity: "R"}),
      sale("s4", "b", 70, oct(2), {snapshot_rarity: "SR"}), // autre rareté : pas le même exemplaire
      buy("b4", "c", 500, oct(1), {is_shiny: true}),
      sale("s5", "c", 80, oct(2)), // exemplaire normal : pas l'achat shiny
      sale("s6", "d", 40, oct(1)),
      buy("b5", "d", 30, oct(2)), // achetée après la vente : ne la finance pas
    ],
    ME,
  );
  const {ops: matched, open} = core.matchTrades(ops);
  const byId = Object.fromEntries(matched.map((o) => [o.id, o]));
  assert.equal(byId.s1.buyId, "b1", "la vente part du plus ancien achat");
  assert.equal(byId.s1.profit, 150);
  assert.equal(byId.s1.heldMs, Date.parse(oct(3)) - Date.parse(oct(1)));
  assert.equal(byId.s1.boughtAt, Date.parse(oct(1)));
  assert.equal(byId.s2.buyId, "b2");
  assert.equal(byId.s2.profit, -100, "revente à perte");
  for (const id of ["s3", "s4", "s5", "s6"]) assert.equal(byId[id].cost, null, `${id} sans prix de revient`);
  assert.equal(byId.b1.soldId, "s1");
  assert.deepEqual(open.map((o) => o.id).sort(), ["b3", "b4", "b5"]);
});

test("résumé : plus-value réalisée, ventes de cartes tirées à part, rendement, réussite", () => {
  const {ops} = core.matchTrades(
    core.ledger([buy("b1", "a", 100, oct(1)), buy("b2", "a", 300, oct(2)), buy("b3", "b", 20, oct(2)), sale("s1", "a", 250, oct(3)), sale("s2", "a", 200, oct(4)), sale("s3", "c", 90, oct(4))], ME),
  );
  const s = core.tradeStats(ops);
  assert.equal(s.buys, 3);
  assert.equal(s.spent, 420);
  assert.equal(s.sells, 3);
  assert.equal(s.revenue, 540);
  assert.equal(s.resold, 2);
  assert.equal(s.cost, 400);
  assert.equal(s.profit, 50, "+150 puis −100");
  assert.equal(s.pulled, 1);
  assert.equal(s.pulledRevenue, 90);
  assert.equal(s.net, 120, "ventes − achats");
  assert.equal(s.roi, 50 / 400);
  assert.equal(s.winRate, 0.5);
  assert.equal(s.wins, 1);
  assert.equal(s.losses, 1);
  const empty = core.tradeStats([]);
  assert.equal(empty.roi, null);
  assert.equal(empty.winRate, null);
  assert.equal(empty.avgHeldMs, null);
});

test("périodes : jour, semaine (du lundi) et mois en heure locale, sans trou", () => {
  // 12/10/2026 est un lundi
  assert.equal(core.periodKey(Date.parse(oct(15, 23, 59)), "day"), "2026-10-15");
  assert.equal(core.periodKey(Date.parse(oct(18, 23)), "week"), "2026-10-12", "le dimanche appartient à la semaine du lundi précédent");
  assert.equal(core.periodKey(Date.parse(oct(19, 0, 30)), "week"), "2026-10-19");
  assert.equal(core.periodKey(Date.parse(oct(31)), "month"), "2026-10");
  // Passage à l'heure d'hiver (25/10/2026) : le jour suivant commence bien à minuit
  const next = core.nextPeriod(core.periodStart(Date.parse(oct(25)), "day"), "day");
  assert.equal(new Date(next).getDate(), 26);
  assert.equal(new Date(next).getHours(), 0);

  const {ops} = core.matchTrades(core.ledger([buy("b1", "a", 100, oct(1)), sale("s1", "a", 160, oct(3, 9)), sale("s2", "z", 40, oct(3, 18))], ME));
  const days = core.byPeriod(ops, "day", {until: Date.parse(oct(5))});
  assert.deepEqual(
    days.map((p) => [p.key, p.ops.length]),
    [
      ["2026-10-01", 1],
      ["2026-10-02", 0],
      ["2026-10-03", 2],
      ["2026-10-04", 0],
      ["2026-10-05", 0],
    ],
  );
  assert.equal(days[2].stats.profit, 60);
  assert.equal(days[2].stats.revenue, 200);
  const months = core.byPeriod(ops, "month", {until: Date.parse(new Date(2026, 11, 2).toISOString())});
  assert.deepEqual(
    months.map((p) => p.key),
    ["2026-10", "2026-11", "2026-12"],
  );
  assert.deepEqual(core.byPeriod([], "week"), []);
  assert.throws(() => core.byPeriod(ops, "year"));
});

test("achat-revente seulement : les reventes, sans les cartes tirées ni les achats en stock", () => {
  const {ops} = core.matchTrades(
    core.ledger([buy("b1", "a", 100, oct(1)), buy("b2", "b", 50, oct(2)), sale("s1", "a", 160, oct(3)), sale("s2", "z", 40, oct(3)), buy("b3", "c", 20, oct(4)), sale("s3", "c", 15, oct(6))], ME),
  );
  const resales = core.resalesOnly(ops);
  assert.deepEqual(
    resales.map((op) => op.id),
    ["s1", "s3"],
  );
  const s = core.tradeStats(resales);
  assert.deepEqual([s.buys, s.spent, s.pulled], [0, 0, 0], "ni achats seuls ni cartes tirées");
  assert.equal(s.resold, 2);
  assert.equal(s.revenue, 175);
  assert.equal(s.cost, 120);
  assert.equal(s.profit, 55);
  assert.equal(s.winRate, 0.5);
  // Une revente compte à la date de la vente, pas à celle de l'achat
  const days = core.byPeriod(resales, "day", {until: Date.parse(oct(6))});
  assert.equal(days[0].key, "2026-10-03", "première période : la première revente");
  assert.equal(days.find((p) => p.key === "2026-10-06").stats.profit, -5);
});
