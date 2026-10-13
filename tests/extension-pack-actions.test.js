// Actions sur un exemplaire (écritures sur le compte du joueur) : défausse depuis le récapitulatif de
// paquet (une carte ou les cartes cochées) ou les doublons du Marché, mise aux enchères, « Tout ouvrir ».
// Une seule requête par clic, jamais rejouée ; une défausse sans réponse du site reste « à vérifier ».
// Seul un refus « trop rapide » (429, rien n'a été fait) est suivi d'un nouvel essai.
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

test("défausse : exemplaire inconnu → aucune requête ; récapitulatif remplacé → rien n'est défaussé ni modifié", async () => {
  const {m, card} = setup(pulled);
  const calls = scriptedFetch(response(200, {}));
  await assert.rejects(m.packs.discardPulled(42, 2), /introuvable/);
  assert.equal(calls.length, 0);
  // Un autre paquet a été ouvert avant le clic : l'index désignerait une carte de ce paquet-là
  m.packs.recapState.set({at: 43});
  await assert.rejects(m.packs.discardPulled(42, 0), /autre paquet/);
  assert.equal(calls.length, 0);
  // … ou entre le clic et la réponse : la carte du nouveau paquet n'est pas marquée
  m.packs.recapState.set({at: 42});
  globalThis.fetch = async () => {
    m.packs.recapState.set({at: 44});
    return response(200, {success: true});
  };
  await m.packs.discardPulled(42, 0);
  assert.equal(card(0).action, undefined);
});

test("défausse des cartes cochées : une requête par carte, dans l'ordre, arrêt à la première erreur", async () => {
  const cards = [...pulled.slice(0, 2), {id: "c4", wikipedia_title: "Odense", rarity: "C", user_card_id: "uc-4", isNew: false}];
  const {m, events, card} = setup(cards);
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    return url.includes("uc-2") ? response(400, {error: "Carte engagée dans un échange"}) : response(200, {success: true});
  };
  const progress = [];
  await assert.rejects(m.packs.discardPulledMany(42, [0, 1, 2], (n) => progress.push(n)), (e) => e.discarded === 1 && /échange/.test(e.message));
  assert.deepEqual(calls, ["/api/user-cards/uc-1/discard", "/api/user-cards/uc-2/discard"], "aucune défausse après l'échec");
  assert.deepEqual(progress, [1]);
  assert.deepEqual([card(0).action, card(1).action, card(2).action], [{kind: "discarded"}, undefined, undefined]);
  assert.equal(events.length, 1);
  // Les autres sont acceptées
  assert.equal(await m.packs.discardPulledMany(42, [2]), 1);
  assert.deepEqual(card(2).action, {kind: "discarded"});
  assert.equal(m.collection.owned.get().ids.has("c4"), true, "doublon : la carte reste possédée");
});

test("défausse des cartes cochées sans réponse du site : arrêt, carte « à vérifier », jamais rejouée", async () => {
  const {m, card} = setup(pulled.slice(0, 2));
  const calls = scriptedFetch(new TypeError("fetch failed"));
  await assert.rejects(m.packs.discardPulledMany(42, [0, 1]), (e) => e.uncertain && e.discarded === 0);
  assert.equal(calls.length, 1);
  assert.deepEqual(card(0).action, {kind: "uncertain", what: "discard"});
  assert.equal(card(1).action, undefined);
});

// « Tout ouvrir » : le site refuse deux ouvertures trop rapprochées (429, paquet non consommé)
const tooFast = (retryAfter, daily = false) =>
  response(429, {error: "Ouverture trop rapide. Attends un instant avant d'ouvrir un autre paquet.", rate_limited: true, rate_limit_daily: daily, retry_after: retryAfter, packs_remaining: 3}, {"retry-after": "1"});

test("tout ouvrir : délai d'attente lu dans le refus « trop rapide » du site", () => {
  const {m} = setup([]);
  const now = Date.parse("2026-10-13T21:14:00.578Z");
  const err = (status, data) => Object.assign(new Error("x"), {status, data});
  assert.equal(m.packs.rateLimitWait(err(429, {rate_limited: true, retry_after: "2026-10-13T21:14:01.192Z"}), now), 1000, "au moins 1 s");
  assert.equal(m.packs.rateLimitWait(err(429, {rate_limited: true, retry_after: "2026-10-13T21:14:05.000Z"}), now), 4722);
  assert.equal(m.packs.rateLimitWait(err(429, {retry_after: "2027-01-01T00:00:00Z"}), now), 60000, "jamais plus d'une minute");
  assert.equal(m.packs.rateLimitWait(err(429, null), now), 2200, "sans date : l'intervalle habituel");
  assert.equal(m.packs.rateLimitWait(err(429, {rate_limited: true, rate_limit_daily: true}), now), null, "limite quotidienne : arrêt");
  assert.equal(m.packs.rateLimitWait(err(500, {}), now), null);
});

test("tout ouvrir : après un refus « trop rapide », le même paquet est redemandé ; limite quotidienne → arrêt avec le message du site", async () => {
  const {m} = setup([]);
  const pack = (title, remaining) => response(200, {cards: [{id: title, wikipedia_title: title, rarity: "C", user_card_id: `uc-${title}`}], packs_remaining: remaining});
  let replies = [tooFast(new Date(Date.now() + 200).toISOString()), pack("A", 0)];
  let calls = 0;
  globalThis.fetch = async (url) => (url === "/api/packs/open" ? (calls++, replies.shift()) : response(500, {}));
  assert.deepEqual(await m.packs.openAllPacks(), {packs: 1, cards: 1});
  assert.equal(calls, 2);
  assert.equal(m.packs.openAllState.get().error, null);
  assert.deepEqual(m.packs.recapState.get().cards.map((c) => c.wikipedia_title), ["A"]);

  replies = [tooFast(null, true)];
  calls = 0;
  assert.deepEqual(await m.packs.openAllPacks(), {packs: 0, cards: 0});
  assert.equal(calls, 1, "pas de nouvel essai");
  assert.match(m.packs.openAllState.get().error, /Ouverture trop rapide/);
});

test("tout ouvrir : une de ses réponses vue après coup par le hook ne remplace pas son récapitulatif", async () => {
  fakeBrowser();
  const m = loadExtensionModule({packs: "extension/src/content/features/packs.js", bus: "extension/src/content/lib/bus.js"});
  const cards = [{id: "A", wikipedia_title: "A", rarity: "C", user_card_id: "uc-A"}];
  globalThis.fetch = async (url) => (url === "/api/packs/open" ? response(200, {cards, packs_remaining: 0}) : response(500, {}));
  await m.packs.openAllPacks();
  const stats = m.packs.pullStats.get().packs;
  m.bus.emit("pack-opened", {data: {cards, packs_remaining: 0}, method: "POST"});
  assert.equal(m.packs.recapState.get().source, "openAll");
  assert.equal(m.packs.pullStats.get().packs, stats, "pas compté deux fois");
  // Un paquet ouvert ensuite sur la page, lui, a son propre récapitulatif
  m.bus.emit("pack-opened", {data: {cards: [{id: "B", wikipedia_title: "B", rarity: "C", user_card_id: "uc-B"}], packs_remaining: 0}, method: "POST"});
  assert.equal(m.packs.recapState.get().source, "reveal");
  assert.deepEqual(m.packs.recapState.get().cards.map((c) => c.wikipedia_title), ["B"]);
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

// Doublons du Marché : l'exemplaire visé (le moins rare, jamais un favori) est défaussé, puis la
// carte est recalculée sans lui pour que l'action suivante vise un autre exemplaire.
function setupSpares(rows) {
  const events = fakeBrowser();
  const market = loadExtensionModule("extension/src/content/features/market.js");
  const core = require("../core");
  market.sellState.set({spares: core.spareCards(rows).map((s) => ({...s, card: {wikipedia_title: s.card_id}})), loading: false, error: null});
  return {market, events, spare: (cardId) => market.sellState.get().spares.find((s) => s.card_id === cardId)};
}

const copies = [
  {id: "uc-r", card_id: "c1", rarity: "R"},
  {id: "uc-c", card_id: "c1", rarity: "C"},
  {id: "uc-fav", card_id: "c1", rarity: "C", starred: true},
  {id: "uc-x", card_id: "c2", rarity: "C"},
  {id: "uc-y", card_id: "c2", rarity: "C"},
];

test("doublons : défausse de l'exemplaire visé, puis du suivant, jamais du dernier", async () => {
  const {market, events, spare} = setupSpares(copies);
  const calls = scriptedFetch(response(200, {success: true}));
  assert.equal(spare("c1").sellCopyId, "uc-c");
  await market.discardSpare({userCardId: "uc-c", cardId: "c1"});
  assert.deepEqual(calls, [{url: "/api/user-cards/uc-c/discard", method: "POST", body: undefined}]);
  assert.deepEqual(events, ["wikimasters:wikibidous-balance-refresh"]);
  assert.deepEqual([spare("c1").copies, spare("c1").spare, spare("c1").sellCopyId, spare("c1").rarity], [2, 1, "uc-r", "R"]);
  assert.equal(spare("c1").card.wikipedia_title, "c1", "la carte affichée est conservée");
  // Il ne reste que le favori et un exemplaire : la carte quitte la liste après la défausse suivante
  await market.discardSpare({userCardId: "uc-r", cardId: "c1"});
  assert.equal(spare("c1"), undefined);
  assert.equal(spare("c2").spare, 1, "les autres cartes ne bougent pas");
});

test("doublons : défausse refusée → liste intacte ; sans réponse → jamais rejouée, liste relue", async () => {
  const {market, events, spare} = setupSpares(copies);
  let calls = scriptedFetch(response(400, {error: "Carte engagée dans un échange"}));
  await assert.rejects(market.discardSpare({userCardId: "uc-x", cardId: "c2"}), /échange/);
  assert.equal(calls.length, 1);
  assert.deepEqual([spare("c2").spare, spare("c2").sellCopyId], [1, "uc-x"]);
  assert.equal(events.length, 0);
  calls = scriptedFetch(new TypeError("fetch failed"));
  await assert.rejects(market.discardSpare({userCardId: "uc-x", cardId: "c2"}), (e) => e.uncertain);
  assert.equal(calls.filter((c) => c.url.includes("/discard")).length, 1);
  assert.equal(market.sellState.get().loading, true, "la liste est relue avant toute nouvelle tentative");
  // Sans exemplaire vendable (tous en favori) : aucune requête
  await assert.rejects(market.discardSpare({userCardId: null, cardId: "c1"}), /introuvable/);
});

test("doublons : après une mise en vente, l'action suivante vise un autre exemplaire", async () => {
  const {market, spare} = setupSpares(copies);
  scriptedFetch(response(200, {auction_id: "a1", sellingCount: 1, maxConcurrentAuctions: 5}));
  await market.sellCard({userCardId: "uc-c", cardId: "c1", baseAmount: 20, durationMinutes: 60});
  assert.deepEqual([spare("c1").spare, spare("c1").sellCopyId], [1, "uc-r"]);
  assert.deepEqual(market.sellState.get().quota, {auction_id: "a1", sellingCount: 1, maxConcurrentAuctions: 5});
});
