// Cartes jamais vendues (onglet Prix, page Collection) : mise en vente et défausse d'un exemplaire
// par carte, une à une ou par lot. Jamais un favori, une requête par carte, arrêt à la première
// erreur, jamais d'écriture rejouée ; l'exemplaire traité quitte la liste.
const test = require("node:test");
const assert = require("node:assert/strict");
const {loadExtensionModule, response} = require("./helpers/extension");
const core = require("../core");

function fakeBrowser() {
  const target = new EventTarget();
  globalThis.window = globalThis;
  globalThis.addEventListener = target.addEventListener.bind(target);
  globalThis.removeEventListener = target.removeEventListener.bind(target);
  globalThis.dispatchEvent = target.dispatchEvent.bind(target);
  globalThis.document = {addEventListener() {}, visibilityState: "visible", cookie: ""};
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

// reply(url) → réponse, ou erreur levée par fetch
function scriptedFetch(reply) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({url, method: init.method, body: init.body});
    const r = typeof reply === "function" ? reply(url) : reply;
    if (r instanceof Error) throw r;
    return r;
  };
  return calls;
}

const copies = [
  {id: "uc-fav", card_id: "c1", rarity: "C", count: 1, starred: true, card: {id: "c1", wikipedia_title: "Gears"}},
  {id: "uc-shiny", card_id: "c1", rarity: "C", count: 1, is_shiny: true, card: {id: "c1", wikipedia_title: "Gears"}},
  {id: "uc-1", card_id: "c1", rarity: "C", count: 2, card: {id: "c1", wikipedia_title: "Gears"}},
  {id: "uc-2", card_id: "c2", rarity: "R", count: 1, card: {id: "c2", wikipedia_title: "Odense"}},
  {id: "uc-3", card_id: "c3", rarity: "PC", count: 1, card: {id: "c3", wikipedia_title: "Macka B"}},
  {id: "uc-locked", card_id: "c4", rarity: "C", count: 1, starred: true, card: {id: "c4", wikipedia_title: "Favori"}},
];

function setup() {
  fakeBrowser();
  const unsold = loadExtensionModule("extension/src/content/features/unsold.js");
  unsold.unsoldState.set({copies, loading: false});
  // Groupes à jour, comme la liste affichée
  const group = (cardId) => core.groupCopies(unsold.unsoldState.get().copies).find((g) => g.card_id === cardId);
  const ids = () => unsold.unsoldState.get().copies.map((c) => `${c.id}×${c.count}`);
  return {unsold, group, ids};
}

test("jamais vendues : défausse d'un exemplaire, jamais un favori, une shiny en dernier", async () => {
  const {unsold, group, ids} = setup();
  const calls = scriptedFetch(response(200, {success: true}));
  await unsold.discardUnsold(group("c1"));
  assert.deepEqual(calls, [{url: "/api/user-cards/uc-1/discard", method: "POST", body: undefined}]);
  assert.deepEqual(ids(), ["uc-fav×1", "uc-shiny×1", "uc-1×1", "uc-2×1", "uc-3×1", "uc-locked×1"], "un exemplaire de moins, la collection en cache n'est pas modifiée");
  await unsold.discardUnsold(group("c1"));
  await unsold.discardUnsold(group("c1"));
  assert.equal(calls[2].url, "/api/user-cards/uc-shiny/discard");
  // Il ne reste que le favori : plus aucune requête
  await assert.rejects(unsold.discardUnsold(group("c1")), /favori/);
  await assert.rejects(unsold.discardUnsold(group("c4")), /favori/);
  assert.equal(calls.length, 3);
});

test("jamais vendues : défausse des cartes cochées, une requête par carte, arrêt à la première erreur", async () => {
  const {unsold, group, ids} = setup();
  const calls = scriptedFetch((url) => (url.includes("uc-2") ? response(400, {error: "Carte engagée dans un échange"}) : response(200, {success: true})));
  const progress = [];
  await assert.rejects(
    unsold.discardUnsoldMany([group("c3"), group("c2"), group("c1")], {onProgress: (n) => progress.push(n)}),
    (e) => e.done === 1 && /échange/.test(e.message),
  );
  assert.deepEqual(calls.map((c) => c.url), ["/api/user-cards/uc-3/discard", "/api/user-cards/uc-2/discard"], "rien après l'échec");
  assert.deepEqual(progress, [1]);
  assert.ok(!ids().includes("uc-3×1") && ids().includes("uc-2×1"), "seule la carte défaussée quitte la liste");
  // Annulation : rien n'est envoyé après l'arrêt demandé
  const abort = new AbortController();
  abort.abort();
  assert.equal(await unsold.discardUnsoldMany([group("c1")], {signal: abort.signal}), 0);
  assert.equal(calls.length, 2);
});

test("jamais vendues : défausse sans réponse → jamais rejouée, collection relue", async () => {
  const {unsold, group} = setup();
  const calls = scriptedFetch(new TypeError("fetch failed"));
  await assert.rejects(unsold.discardUnsoldMany([group("c2"), group("c3")]), (e) => e.uncertain && e.done === 0);
  assert.equal(calls.filter((c) => c.url.includes("/discard")).length, 1);
  assert.equal(unsold.unsoldState.get().loading, true, "la collection est relue avant toute nouvelle action");
});

test("jamais vendues : mise aux enchères des cartes cochées, id de l'exemplaire, même mise pour toutes", async () => {
  const {unsold, group, ids} = setup();
  const calls = scriptedFetch((url) => (url === "/api/marketplace" ? response(200, {auction_id: "a1"}) : response(200, {sellingCount: 1, maxConcurrentAuctions: 5})));
  assert.equal(await unsold.sellUnsoldMany([group("c1"), group("c2")], {baseAmount: 25, durationMinutes: 180}), 2);
  const posts = calls.filter((c) => c.method === "POST");
  assert.deepEqual(
    posts.map((c) => JSON.parse(c.body)),
    [
      {card_id: "uc-1", base_amount: 25, duration_minutes: 180},
      {card_id: "uc-2", base_amount: 25, duration_minutes: 180},
    ],
  );
  assert.deepEqual(ids(), ["uc-fav×1", "uc-shiny×1", "uc-1×1", "uc-3×1", "uc-locked×1"], "l'exemplaire en vente quitte la liste");
  // Fenêtre de mise en vente d'une seule carte : vente faite → retirée ; annulée → rien ne change
  unsold.afterSell("uc-3", null);
  assert.ok(ids().includes("uc-3×1"));
  unsold.afterSell("uc-3", {baseAmount: 10, durationMinutes: 60});
  assert.ok(!ids().includes("uc-3×1"));
});

test("jamais vendues : mise aux enchères refusée → arrêt, rien n'est retiré de la liste", async () => {
  const {unsold, group, ids} = setup();
  const calls = scriptedFetch(response(400, {error: "Nombre maximum d'enchères simultanées atteint"}));
  await assert.rejects(unsold.sellUnsoldMany([group("c2"), group("c3")], {baseAmount: 10, durationMinutes: 60}), (e) => e.done === 0 && /maximum/.test(e.message));
  assert.equal(calls.filter((c) => c.method === "POST").length, 1);
  assert.ok(ids().includes("uc-2×1"));
});
