// Titre de l'onglet sur la page d'une enchère : temps restant, en tête / surenchéri, alerte de
// nouvelle mise, et joueurs ayant misé relevés dans la fiche de l'enchère.
const test = require("node:test");
const assert = require("node:assert/strict");
const {loadExtensionModule} = require("./helpers/extension");

function fakeBrowser() {
  const target = new EventTarget();
  globalThis.window = globalThis;
  globalThis.addEventListener = target.addEventListener.bind(target);
  globalThis.removeEventListener = target.removeEventListener.bind(target);
  globalThis.document = {addEventListener() {}, visibilityState: "visible", cookie: ""};
  globalThis.chrome = {
    runtime: {id: "test"},
    storage: {local: {get: async () => ({}), set: async () => {}, remove: async () => {}}, onChanged: {addListener() {}, removeListener() {}}},
  };
}
fakeBrowser();
const {tab, bus, market} = loadExtensionModule({tab: "extension/src/content/features/auction-tab.js", bus: "extension/src/content/lib/bus.js", market: "extension/src/content/features/market.js"});

const now = Date.parse("2026-10-30T12:00:00Z");
const auction = (extra = {}) => ({
  id: "a1",
  seller_id: "seller",
  base_amount: 300,
  current_bid: 1250,
  current_bidder_id: "other",
  end_at: new Date(now + 4 * 60000 + 7000).toISOString(),
  status: "active",
  card: {wikipedia_title: "Hande Erçel"},
  ...extra,
});
const nb = (s) => s.replace(/ | /g, " ");

test("temps restant compact", () => {
  assert.equal(tab.clock(4 * 60000 + 7000), "4:07");
  assert.equal(tab.clock(42000), "0:42");
  assert.equal(tab.clock(500), "0:01");
  assert.equal(tab.clock(65 * 60000), "1 h 05");
  assert.equal(tab.clock(-1000), "0:00");
});

test("titre : en tête, surenchéri, simple spectateur, vendeur", () => {
  assert.equal(nb(tab.tabTitle(auction({current_bidder_id: "me"}), {me: "me", now})), "✓ 4:07 · En tête · 1 250 ₩ — Hande Erçel");
  assert.equal(nb(tab.tabTitle(auction(), {me: "me", participated: true, now})), "✗ 4:07 · Surenchéri · 1 250 ₩ — Hande Erçel");
  assert.equal(nb(tab.tabTitle(auction(), {me: "me", now})), "4:07 · 1 250 ₩ — Hande Erçel");
  assert.equal(nb(tab.tabTitle(auction({current_bid: null, current_bidder_id: null}), {me: "me", now})), "4:07 · 300 ₩ — Hande Erçel");
  assert.equal(nb(tab.tabTitle(auction({seller_id: "me"}), {me: "me", alert: "bid", now})), "↑ 4:07 · 1 250 ₩ (votre vente) — Hande Erçel");
});

test("titre : alerte affichée une seconde sur deux", () => {
  assert.equal(tab.tabTitle(auction(), {me: "me", participated: true, alert: "outbid", flash: true, now}), "✗ SURENCHÉRI ! — Hande Erçel");
  assert.match(tab.tabTitle(auction(), {me: "me", participated: true, alert: "outbid", flash: false, now}), /^✗ 4:07 · Surenchéri/);
  assert.equal(tab.tabTitle(auction(), {me: "me", alert: "bid", flash: true, now}), "↑ NOUVELLE MISE — Hande Erçel");
  assert.match(tab.tabTitle(auction(), {me: "me", alert: "bid", flash: false, now}), /^↑ 4:07/);
});

test("titre : fin de l'enchère", () => {
  assert.equal(tab.tabTitle(auction({current_bidder_id: "me", end_at: new Date(now - 1000).toISOString()}), {me: "me", now}), "✓ Fin… — Hande Erçel");
  assert.equal(nb(tab.tabTitle(auction({status: "settled_sold", winner_id: "me", final_price: 1250}), {me: "me", now})), "✓ Gagnée · 1 250 ₩ — Hande Erçel");
  assert.equal(tab.tabTitle(auction({status: "settled_sold", winner_id: "other"}), {me: "me", participated: true, now}), "✗ Perdue — Hande Erçel");
  assert.equal(tab.tabTitle(auction({status: "settled_unsold"}), {me: "me", now}), "Terminée — Hande Erçel");
});

test("alerte : nouvelle mise d'un autre joueur, jamais la mienne", () => {
  const opts = {me: "me", participated: true};
  assert.equal(tab.newAlert(null, auction(), opts), null);
  assert.equal(tab.newAlert({bid: 1250}, auction(), opts), null);
  assert.equal(tab.newAlert({bid: 1000}, auction(), opts), "outbid");
  assert.equal(tab.newAlert({bid: 1000}, auction(), {me: "me", participated: false}), "bid");
  assert.equal(tab.newAlert({bid: 1000}, auction({current_bidder_id: "me"}), opts), null);
});

test("fiche d'une enchère : joueurs ayant misé gardés avec l'enchère", () => {
  bus.emit("auction", {data: {auction: auction(), bids: [{bidder_id: "other", amount: 1250}, {bidder_id: "me", amount: 1000}]}});
  assert.deepEqual(market.auctionById("a1").bidder_ids, ["other", "me"]);
  assert.equal(tab.standing(market.auctionById("a1"), {me: "me", participated: market.auctionById("a1").bidder_ids.includes("me")}), "outbid");
});
