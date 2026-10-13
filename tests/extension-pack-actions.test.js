// Actions sur un exemplaire (écritures sur le compte du joueur) : défausse depuis le récapitulatif de
// paquet, mise aux enchères.
// Une seule requête par clic, jamais rejouée ; une défausse sans réponse du site reste « à vérifier ».
const test = require("node:test");
const assert = require("node:assert/strict");
const {loadExtensionModule, response} = require("./helpers/extension");

// Environnement de page minimal : événements de window, stockage d'extension en mémoire
function fakeBrowser() {
  const target = new EventTarget();
  globalThis.window = globalThis;
  globalThis.addEventListener = target.addEventListener.bind(target);
  globalThis.removeEventListener = target.removeEventListener.bind(target);
  globalThis.dispatchEvent = target.dispatchEvent.bind(target);
  globalThis.document = {addEventListener() {}, visibilityState: "visible", cookie: ""};
  globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
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
  const events = [];
  target.addEventListener("wikimasters:wikibidous-balance-refresh", (e) => events.push(e.type));
  return events;
}

function scriptedFetch(reply) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({url, method: init.method, body: init.body});
    if (reply instanceof Error) throw reply;
    return reply;
  };
  return calls;
}

function setup(cards) {
  const events = fakeBrowser();
  const m = loadExtensionModule({packs: "extension/src/content/features/packs.js", collection: "extension/src/content/state/collection.js"});
  m.collection.addOwned(cards.map((c) => c.id));
  m.packs.recapState.set({cards, packs: 1, at: 42, phase: "ready"});
  return {m, events, card: (i) => m.packs.recapState.get().cards[i]};
}

const pulled = [
  {id: "c1", wikipedia_title: "Gears", rarity: "C", user_card_id: "uc-1", isNew: true},
  {id: "c2", wikipedia_title: "Macka B", rarity: "PC", user_card_id: "uc-2", isNew: false},
  {id: "c3", wikipedia_title: "Sans exemplaire", rarity: "C", isNew: true},
];

test("défausse : une requête, carte marquée, solde du site rafraîchi, carte plus possédée", async () => {
  const {m, events, card} = setup(pulled);
  const calls = scriptedFetch(response(200, {success: true}));
  await m.packs.discardPulled(42, 0);
  assert.deepEqual(calls, [{url: "/api/user-cards/uc-1/discard", method: "POST", body: undefined}]);
  assert.deepEqual(card(0).action, {kind: "discarded"});
  assert.deepEqual(events, ["wikimasters:wikibidous-balance-refresh"]);
  assert.equal(m.collection.owned.get().ids.has("c1"), false, "seul exemplaire défaussé");
  // Doublon : il reste un exemplaire, la carte est toujours possédée
  await m.packs.discardPulled(42, 1);
  assert.deepEqual(card(1).action, {kind: "discarded"});
  assert.equal(m.collection.owned.get().ids.has("c2"), true);
  // Le reste du récapitulatif est intact
  assert.equal(m.packs.recapState.get().at, 42);
  assert.equal(m.packs.recapState.get().phase, "ready");
  assert.equal(card(2).action, undefined);
});

test("défausse refusée par le site : rien n'est marqué, le message du site est repris", async () => {
  const {m, events, card} = setup(pulled);
  const calls = scriptedFetch(response(400, {error: "Carte verrouillée (favori)"}));
  await assert.rejects(m.packs.discardPulled(42, 0), /verrouillée/);
  assert.equal(calls.length, 1);
  assert.equal(card(0).action, undefined);
  assert.equal(events.length, 0);
  assert.equal(m.collection.owned.get().ids.has("c1"), true);
});

test("défausse sans réponse : jamais rejouée, carte « à vérifier »", async () => {
  const {m, card} = setup(pulled);
  const calls = scriptedFetch(new TypeError("fetch failed"));
  await assert.rejects(m.packs.discardPulled(42, 0), (e) => e.uncertain);
  assert.equal(calls.length, 1);
  assert.deepEqual(card(0).action, {kind: "uncertain", what: "discard"});
});

test("défausse : exemplaire inconnu → aucune requête ; récapitulatif remplacé → rien n'est modifié", async () => {
  const {m, card} = setup(pulled);
  const calls = scriptedFetch(response(200, {}));
  await assert.rejects(m.packs.discardPulled(42, 2), /introuvable/);
  assert.equal(calls.length, 0);
  // Un autre paquet a été ouvert entre le clic et la réponse
  m.packs.recapState.set({at: 43});
  await m.packs.discardPulled(42, 0);
  assert.equal(card(0).action, undefined);
});

test("mise aux enchères : résultat de la fenêtre reporté sur la carte", () => {
  const {m, card} = setup(pulled);
  m.packs.markListed(42, 0, null);
  assert.equal(card(0).action, undefined, "fenêtre annulée");
  m.packs.markListed(42, 0, {baseAmount: 50, durationMinutes: 60});
  assert.deepEqual(card(0).action, {kind: "listed", baseAmount: 50, durationMinutes: 60});
  m.packs.markListed(42, 1, {uncertain: true});
  assert.deepEqual(card(1).action, {kind: "uncertain", what: "sell"});
});

test("mise aux enchères : le site attend l'id de l'exemplaire dans card_id, pas celui de la carte", async () => {
  fakeBrowser();
  const market = loadExtensionModule("extension/src/content/features/market.js");
  const calls = scriptedFetch(response(200, {auction_id: "a1", sellingCount: 1, maxConcurrentAuctions: 5}));
  await market.sellCard({userCardId: "uc-9", cardId: "c9", baseAmount: 50, durationMinutes: 60});
  assert.equal(calls[0].url, "/api/marketplace");
  assert.equal(calls[0].method, "POST");
  assert.deepEqual(JSON.parse(calls[0].body), {card_id: "uc-9", base_amount: 50, duration_minutes: 60});
  // Sans exemplaire connu : aucune requête
  const before = calls.length;
  await assert.rejects(market.sellCard({cardId: "c9", baseAmount: 50, durationMinutes: 60}), /introuvable/);
  assert.equal(calls.length, before);
});
