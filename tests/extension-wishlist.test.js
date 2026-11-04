// Familles → liste de souhaits du site : seules les cartes manquantes et pas encore souhaitées sont
// ajoutées, en lots de 100, avec ignore-duplicates (rejouable), arrêt à la première erreur.
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

// Collection : a possédée ; liste de souhaits : b. post(n) : réponse au n-ième envoi.
function fakeSite({wished = ["b"], post = () => response(201, "")} = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    const call = {url, method: init.method || "GET", body: init.body && JSON.parse(init.body), prefer: init.headers?.prefer};
    calls.push(call);
    if (call.method === "POST") return post(calls.filter((c) => c.method === "POST").length);
    if (url.includes("/user_cards?")) return response(200, url.includes("offset=0") ? [{id: "u1", card_id: "a", count: 1, cards: {id: "a", wikipedia_title: "A"}}] : []);
    if (url.includes("/wishlist_items?")) return response(200, url.includes("offset=0") ? wished.map((card_id) => ({card_id})) : []);
    return response(404, {});
  };
  return calls;
}

const family = (n) => ({id: "f", name: "Test", cards: Array.from({length: n}, (_, i) => ({id: i === 0 ? "a" : i === 1 ? "b" : `c${i}`, title: `Carte ${i}`}))});

test("liste de souhaits : seules les manquantes pas encore souhaitées", async () => {
  fakeBrowser();
  const fam = loadExtensionModule("extension/src/content/features/families.js");
  const calls = fakeSite();
  const plan = await fam.planWishlist(family(4));
  assert.deepEqual(plan.toAdd.map((c) => c.id), ["c2", "c3"]);
  assert.equal(plan.wished, 1);
  assert.equal(plan.owned, 1);
  assert.ok(calls.some((c) => /wishlist_items\?select=card_id&user_id=eq\.me&order=card_id\.asc/.test(c.url)), "ma liste, triée pour une pagination stable");
  assert.ok(!calls.some((c) => c.method !== "GET"), "rien n'est écrit pour préparer l'ajout");
});

test("liste de souhaits : ajout par lots de 100, doublons ignorés côté serveur", async () => {
  fakeBrowser();
  const fam = loadExtensionModule("extension/src/content/features/families.js");
  const calls = fakeSite();
  const ids = Array.from({length: 150}, (_, i) => `k${i}`);
  const progress = [];
  assert.equal(await fam.addToWishlist([...ids, "k0"], {onProgress: (d, t) => progress.push(`${d}/${t}`)}), 150);
  const posts = calls.filter((c) => c.method === "POST");
  assert.equal(posts.length, 2);
  assert.match(posts[0].url, /wishlist_items\?on_conflict=user_id,card_id$/);
  assert.match(posts[0].prefer, /resolution=ignore-duplicates/);
  assert.equal(posts[0].body.length, 100);
  assert.deepEqual(posts[0].body[0], {user_id: "me", card_id: "k0"});
  assert.deepEqual(progress, ["100/150", "150/150"]);
  assert.equal(fam.wishlist.get().ids.size, 150, "pastilles « souhaitée » à jour sans relire la liste");
});

test("liste de souhaits : erreur au 2e lot → arrêt, nombre déjà ajouté signalé, liste relue", async () => {
  fakeBrowser();
  const fam = loadExtensionModule("extension/src/content/features/families.js");
  const calls = fakeSite({post: (n) => (n === 1 ? response(201, "") : response(400, {message: "refusé"}))});
  const ids = Array.from({length: 250}, (_, i) => `k${i}`);
  await assert.rejects(fam.addToWishlist(ids), (e) => e.added === 100);
  assert.equal(calls.filter((c) => c.method === "POST").length, 2, "le 3e lot n'est pas envoyé");
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(calls.some((c) => c.method === "GET" && c.url.includes("/wishlist_items?")), "liste relue après l'erreur");
});
