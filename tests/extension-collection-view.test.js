// Ma collection filtrée (onglet Prix, page Collection) : critères cumulables et prix de vente ;
// mise en vente et défausse d'un exemplaire par carte, une à une ou par lot. Jamais un favori, une
// requête par carte, arrêt à la première erreur, jamais d'écriture rejouée ; l'exemplaire traité
// quitte la liste.
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
  const view = loadExtensionModule("extension/src/content/features/collection-view.js");
  view.cardsState.set({copies, loading: false});
  // Groupes à jour, comme la liste affichée
  const group = (cardId) => core.groupCopies(view.cardsState.get().copies).find((g) => g.card_id === cardId);
  const ids = () => view.cardsState.get().copies.map((c) => `${c.id}×${c.count}`);
  return {view, group, ids};
}

test("collection filtrée : défausse d'un exemplaire, jamais un favori, une shiny en dernier", async () => {
  const {view, group, ids} = setup();
  const calls = scriptedFetch(response(200, {success: true}));
  await view.discardGroup(group("c1"));
  assert.deepEqual(calls, [{url: "/api/user-cards/uc-1/discard", method: "POST", body: undefined}]);
  assert.deepEqual(ids(), ["uc-fav×1", "uc-shiny×1", "uc-1×1", "uc-2×1", "uc-3×1", "uc-locked×1"], "un exemplaire de moins, la collection en cache n'est pas modifiée");
  await view.discardGroup(group("c1"));
  await view.discardGroup(group("c1"));
  assert.equal(calls[2].url, "/api/user-cards/uc-shiny/discard");
  // Il ne reste que le favori : plus aucune requête
  await assert.rejects(view.discardGroup(group("c1")), /favori/);
  await assert.rejects(view.discardGroup(group("c4")), /favori/);
  assert.equal(calls.length, 3);
});

test("collection filtrée : défausse des cartes cochées, une requête par carte, arrêt à la première erreur", async () => {
  const {view, group, ids} = setup();
  const calls = scriptedFetch((url) => (url.includes("uc-2") ? response(400, {error: "Carte engagée dans un échange"}) : response(200, {success: true})));
  const progress = [];
  await assert.rejects(
    view.discardGroups([group("c3"), group("c2"), group("c1")], {onProgress: (n) => progress.push(n)}),
    (e) => e.done === 1 && /échange/.test(e.message),
  );
  assert.deepEqual(calls.map((c) => c.url), ["/api/user-cards/uc-3/discard", "/api/user-cards/uc-2/discard"], "rien après l'échec");
  assert.deepEqual(progress, [1]);
  assert.ok(!ids().includes("uc-3×1") && ids().includes("uc-2×1"), "seule la carte défaussée quitte la liste");
  // Annulation : rien n'est envoyé après l'arrêt demandé
  const abort = new AbortController();
  abort.abort();
  assert.equal(await view.discardGroups([group("c1")], {signal: abort.signal}), 0);
  assert.equal(calls.length, 2);
});

test("collection filtrée : défausse sans réponse → jamais rejouée, collection relue", async () => {
  const {view, group} = setup();
  const calls = scriptedFetch(new TypeError("fetch failed"));
  await assert.rejects(view.discardGroups([group("c2"), group("c3")]), (e) => e.uncertain && e.done === 0);
  assert.equal(calls.filter((c) => c.url.includes("/discard")).length, 1);
  assert.equal(view.cardsState.get().loading, true, "la collection est relue avant toute nouvelle action");
});

test("collection filtrée : mise aux enchères des cartes cochées, id de l'exemplaire, même mise pour toutes", async () => {
  const {view, group, ids} = setup();
  const calls = scriptedFetch((url) => (url === "/api/marketplace" ? response(200, {auction_id: "a1"}) : response(200, {sellingCount: 1, maxConcurrentAuctions: 5})));
  assert.equal(await view.sellGroups([group("c1"), group("c2")], {baseAmount: 25, durationMinutes: 180}), 2);
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
  view.afterSell("uc-3", null);
  assert.ok(ids().includes("uc-3×1"));
  view.afterSell("uc-3", {baseAmount: 10, durationMinutes: 60});
  assert.ok(!ids().includes("uc-3×1"));
});

test("collection filtrée : mise aux enchères refusée → arrêt, rien n'est retiré de la liste", async () => {
  const {view, group, ids} = setup();
  const calls = scriptedFetch(response(400, {error: "Nombre maximum d'enchères simultanées atteint"}));
  await assert.rejects(view.sellGroups([group("c2"), group("c3")], {baseAmount: 10, durationMinutes: 60}), (e) => e.done === 0 && /maximum/.test(e.message));
  assert.equal(calls.filter((c) => c.method === "POST").length, 1);
  assert.ok(ids().includes("uc-2×1"));
});

test("filtre : critères cumulés, jamais vendues dans aucune rareté ou dans la sienne, intervalle de prix", () => {
  fakeBrowser();
  const m = loadExtensionModule({view: "extension/src/content/features/collection-view.js", bus: "extension/src/content/lib/bus.js", prices: "extension/src/content/state/prices.js"});
  const copy = (id, card_id, rarity, title, image_url, count = 1) => ({id, card_id, rarity, count, card: {id: card_id, wikipedia_title: title, image_url, hide_image: false}});
  const owned = [
    copy("u1", "a", "C", "Abeille", null),
    copy("u2", "a", "R", "Abeille", null),
    copy("u3", "b", "C", "Basion", "https://upload.wikimedia.org/b.gif"),
    copy("u4", "c", "PC", "Castor", "https://upload.wikimedia.org/c.jpg", 2),
    copy("u5", "d", "C", "Dune", "https://upload.wikimedia.org/d.jpg"),
  ];
  // Ventes lues : a vendue en C seulement, b jamais, c en PC ; d pas encore lue
  const sales = (id, summary) => m.bus.emit("sales-summary", {data: {summary}, match: [null, id]});
  sales("a", {C: {average: 3, count: 4}});
  sales("b", {});
  sales("c", {PC: {average: 40, count: 1}});
  const views = m.view.viewGroups(owned, m.prices.priceVersion.get().v);
  const list = (filter) => m.view.filterGroups(views, filter).map((g) => `${g.card.wikipedia_title} ${g.rarity}`);

  assert.deepEqual(list({}), ["Abeille R", "Castor PC", "Abeille C", "Basion C", "Dune C"], "toutes, les plus rares d'abord");
  assert.deepEqual(list({kinds: ["doubles"]}), ["Abeille R", "Castor PC", "Abeille C"]);
  assert.deepEqual(list({kinds: ["doubles", "none"]}), ["Abeille R", "Abeille C"], "critères cumulés");
  assert.deepEqual(list({kinds: ["none", "gif"]}), []);
  assert.deepEqual(list({sale: "never"}), ["Basion C"], "aucune vente, dans aucune rareté ; prix non lu : écartée");
  assert.deepEqual(list({sale: "never", anyRarity: false}), ["Abeille R", "Basion C"], "jamais vendue dans la rareté de l'exemplaire");
  assert.deepEqual(list({kinds: ["none"], sale: "never", anyRarity: false}), ["Abeille R"]);
  assert.deepEqual(list({sale: "range", max: 50}), ["Castor PC", "Abeille C"], "prix moyen dans la rareté de l'exemplaire, sans minimum");
  assert.deepEqual(list({sale: "range", min: 5, max: 50}), ["Castor PC"]);
  assert.deepEqual(list({sale: "range", min: 3, max: 3}), ["Abeille C"], "bornes incluses");
  assert.deepEqual(list({sale: "range", min: 50, max: 5}), ["Castor PC"], "bornes saisies à l'envers : échangées");
  assert.deepEqual(list({sale: "range", min: 41}), [], "sans maximum");
  assert.deepEqual(list({sale: "range"}), ["Castor PC", "Abeille C"], "sans borne : toutes les cartes vendues dans leur rareté");
  assert.deepEqual(list({kinds: ["gif"], sale: "range", max: 50}), []);
  assert.deepEqual(views.unknown.map((g) => g.card.wikipedia_title), ["Dune"]);
});

test("liste de la page Collection : un filtre l'ouvre depuis la grille du site, à partir du filtre par défaut", () => {
  fakeBrowser();
  const {collectionView, setCollectionView} = loadExtensionModule("extension/src/content/features/collection-view.js");
  setCollectionView({kinds: ["gif"], sale: "range", min: 5, max: 25});
  assert.deepEqual(collectionView.get(), {open: true, kinds: ["gif"], sale: "range", min: 5, max: 25, anyRarity: true});
  setCollectionView({kinds: []});
  assert.deepEqual(collectionView.get().kinds, []);
  assert.equal(collectionView.get().sale, "range", "liste ouverte : seul le critère changé");
  setCollectionView(null);
  assert.equal(collectionView.get().open, false);
  setCollectionView({sale: "never"});
  assert.deepEqual(collectionView.get(), {open: true, kinds: [], sale: "never", min: 5, max: 25, anyRarity: true}, "rouverte : filtre par défaut, dernier intervalle gardé");
});

test("mots-clés : au moins un mot inclus (ou tous), aucun mot exclu, sans casse ni accents, « -mot » exclu", () => {
  fakeBrowser();
  const {matchKeywords, parseKeyword} = loadExtensionModule("extension/src/content/features/collection-view.js");
  const cards = [
    {card: {id: "1", wikipedia_title: "Neymar", category: "footballeur brésilien"}},
    {card: {id: "2", wikipedia_title: "Kylian Mbappé", category: "footballeur français"}},
    {card: {id: "3", wikipedia_title: "Tony Parker", category: "joueur de basket-ball français"}},
    {card: {id: "4", wikipedia_title: "Odense", category: null}},
  ];
  const titles = (words, options) => cards.filter(matchKeywords(words, options)).map((g) => g.card.wikipedia_title);
  const inc = (text) => ({text, out: false});
  const exc = (text) => ({text, out: true});

  assert.deepEqual(titles([]), ["Neymar", "Kylian Mbappé", "Tony Parker", "Odense"]);
  assert.deepEqual(titles([inc("FOOT")]), ["Neymar", "Kylian Mbappé"], "partie de mot, sans casse");
  assert.deepEqual(titles([inc("bresilien")]), ["Neymar"], "sans accents");
  assert.deepEqual(titles([inc("mbappe")]), ["Kylian Mbappé"], "dans le titre");
  assert.deepEqual(titles([inc("footballeur"), inc("basket")]), ["Neymar", "Kylian Mbappé", "Tony Parker"], "au moins un mot inclus");
  assert.deepEqual(titles([inc("footballeur"), inc("français")], {all: true}), ["Kylian Mbappé"], "tous les mots inclus");
  assert.deepEqual(titles([exc("français")]), ["Neymar", "Odense"], "mot exclu seul");
  assert.deepEqual(titles([inc("footballeur"), exc("francais")]), ["Neymar"]);

  assert.deepEqual(parseKeyword("  foot "), {text: "foot", out: false});
  assert.deepEqual(parseKeyword("-français"), {text: "français", out: true});
  assert.deepEqual(parseKeyword("− basket"), {text: "basket", out: true}, "signe moins typographique, espace");
  assert.equal(parseKeyword(" - "), null);
  assert.equal(parseKeyword(""), null);
});
