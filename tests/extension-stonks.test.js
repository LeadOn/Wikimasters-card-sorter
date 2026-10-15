// Page « Stonks » : lecture de l'historique (enchères conclues où je suis vendeur ou acheteur),
// lecture seule, pagination stable, cartes encore en stock d'après ma collection.
const test = require("node:test");
const assert = require("node:assert/strict");
const {loadExtensionModule, response, fakeJwt, sessionCookie} = require("./helpers/extension");

function fakeBrowser() {
  const target = new EventTarget();
  globalThis.window = globalThis;
  globalThis.addEventListener = target.addEventListener.bind(target);
  globalThis.removeEventListener = target.removeEventListener.bind(target);
  globalThis.dispatchEvent = target.dispatchEvent.bind(target);
  const exp = Math.floor(Date.now() / 1000) + 3600;
  globalThis.document = {addEventListener() {}, visibilityState: "visible", cookie: sessionCookie({userId: "me", token: fakeJwt({sub: "me", exp}), expiresAt: exp})};
  const data = {};
  globalThis.chrome = {
    runtime: {id: "test"},
    storage: {
      local: {
        get: async (key) => Object.fromEntries([].concat(key).filter((k) => k in data).map((k) => [k, data[k]])),
        set: async (obj) => Object.assign(data, structuredClone(obj)),
        remove: async (key) => [].concat(key).forEach((k) => delete data[k]),
      },
      onChanged: {addListener() {}, removeListener() {}},
    },
  };
}

const at = (day) => `2026-10-${String(day).padStart(2, "0")}T12:00:00Z`;
const row = (id, card, price, day, side, extra = {}) => ({
  id,
  card_id: card,
  snapshot_rarity: "C",
  final_price: price,
  settled_at: at(day),
  is_shiny: false,
  seller_id: side === "sell" ? "me" : "other",
  winner_id: side === "buy" ? "me" : "other",
  ...extra,
});
const SOLD = [row("s1", "a", 150, 3, "sell"), row("s2", "z", 40, 4, "sell")];
const BOUGHT = [row("b1", "a", 100, 1, "buy"), row("b2", "b", 60, 2, "buy"), row("b3", "c", 30, 2, "buy")];
const CARDS = ["a", "b", "c", "z"].map((id) => ({id, wikipedia_title: `Carte ${id}`, rarity: "C", image_url: "x.jpg", hide_image: id === "b"}));
// Ma collection : la carte b est toujours là, la carte c a été défaussée
const COPIES = [{id: "u1", card_id: "b", count: 1, starred: false, is_shiny: false, snapshot_rarity: "C", obtained_at: at(2), cards: CARDS[1]}];

function scripted({fail} = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = decodeURIComponent(String(url));
    calls.push({url: u, method: init.method || "GET"});
    if (fail && u.includes("/auctions")) return response(400, {message: "requête refusée"});
    if (u.includes("/auctions") && u.includes("seller_id=eq.me")) return response(200, SOLD);
    if (u.includes("/auctions") && u.includes("winner_id=eq.me")) return response(200, BOUGHT);
    if (u.includes("/auctions")) return response(200, []); // prix du marché
    if (u.includes("/cards?")) return response(200, CARDS.filter((c) => u.includes(c.id)));
    if (u.includes("/user_cards")) return response(200, COPIES);
    return response(200, {});
  };
  return calls;
}

test("stonks : historique lu en deux requêtes triées, ventes rapprochées des achats, sans écriture", async () => {
  fakeBrowser();
  const calls = scripted();
  const {stonksState, loadStonks} = loadExtensionModule("extension/src/content/features/stonks.js");
  await loadStonks();
  const s = stonksState.get();
  assert.equal(s.error, null);
  const history = calls.filter((c) => c.url.includes("/auctions") && c.url.includes("_id=eq.me"));
  assert.equal(history.length, 2, "une lecture vendeur, une lecture acheteur");
  for (const c of history) {
    assert.match(c.url, /status=eq\.settled_sold/);
    assert.match(c.url, /order=settled_at\.desc,id\.asc/, "ordre stable pour la pagination");
  }
  assert.ok(
    calls.every((c) => c.method === "GET"),
    "lecture seule",
  );
  const byId = Object.fromEntries(s.ops.map((op) => [op.id, op]));
  assert.equal(byId.s1.profit, 50, "vendue 150, achetée 100");
  assert.equal(byId.s2.cost, null, "carte jamais achetée");
  assert.equal(s.cards.get("a").wikipedia_title, "Carte a");
  assert.equal(s.cards.get("b").image_url, null, "image masquée par le site : pas d'image");
  assert.deepEqual(
    s.open.map((op) => op.id),
    ["b2"],
    "en stock : achetée, pas revendue, toujours dans la collection (c a été défaussée)",
  );
});

test("stonks : historique gardé quelques minutes, relu sur demande ; une panne est signalée", async () => {
  fakeBrowser();
  let calls = scripted();
  const {stonksState, loadStonks} = loadExtensionModule("extension/src/content/features/stonks.js");
  await loadStonks();
  const n = calls.length;
  await loadStonks();
  assert.equal(calls.length, n, "pas de nouvelle lecture");
  calls = scripted({fail: true});
  await loadStonks({force: true});
  assert.match(stonksState.get().error, /./);
  assert.equal(stonksState.get().ops.length, 5, "l'historique déjà lu reste affiché");
  assert.equal(stonksState.get().loading, false);
});
