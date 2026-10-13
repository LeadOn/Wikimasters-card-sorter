// Stockage de l'extension : les données enregistrées ne sont jamais écrasées par les valeurs par
// défaut, les modifications précoces sont rejouées, plusieurs onglets ne se marchent pas dessus.
const test = require("node:test");
const assert = require("node:assert/strict");
const {loadExtensionModule} = require("./helpers/extension");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// chrome.storage.local en mémoire ; getDelay : lecture lente ; failGet : lecture en échec
function fakeChrome(initial = {}, {getDelay = 0, failGet = false} = {}) {
  const data = structuredClone(initial);
  const listeners = new Set();
  const writes = [];
  const notify = (changes) => listeners.forEach((fn) => fn(changes, "local"));
  globalThis.chrome = {
    runtime: {id: "test"},
    storage: {
      local: {
        async get(key) {
          await wait(getDelay);
          if (failGet) throw new Error("lecture impossible");
          if (key == null) return structuredClone(data);
          return Object.fromEntries([].concat(key).filter((k) => k in data).map((k) => [k, structuredClone(data[k])]));
        },
        async set(obj) {
          writes.push(structuredClone(obj));
          const changes = {};
          for (const [k, v] of Object.entries(obj)) {
            changes[k] = {oldValue: data[k], newValue: structuredClone(v)};
            data[k] = structuredClone(v);
          }
          notify(changes);
        },
        async remove(key) {
          for (const k of [].concat(key)) delete data[k];
        },
      },
      onChanged: {addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn)},
    },
  };
  // Écriture faite par un autre onglet
  const remote = (key, value) => {
    data[key] = structuredClone(value);
    notify({[key]: {newValue: structuredClone(value)}});
  };
  return {data, writes, remote};
}

const load = () => loadExtensionModule({storage: "extension/src/content/lib/storage.js", bus: "extension/src/content/lib/bus.js"});

test("modification faite avant la fin de la lecture : rejouée sur la valeur enregistrée", async () => {
  const db = fakeChrome({stats: {packs: 10, cards: 50}}, {getDelay: 20});
  const {storage} = load();
  const stats = storage.persistentStore("stats", {packs: 0, cards: 0}, {delay: 5});
  stats.set((s) => ({...s, packs: s.packs + 1, cards: s.cards + 5}));
  await stats.ready;
  assert.deepEqual(stats.get(), {packs: 11, cards: 55});
  await wait(30);
  assert.deepEqual(db.data.stats, {packs: 11, cards: 55}, "l'historique n'est pas remplacé par les valeurs par défaut");
});

test("aucune écriture tant que rien ne change ; lecture en échec → valeurs par défaut, sans rejet", async () => {
  let db = fakeChrome({settings: {a: 5}});
  let {storage} = load();
  const settings = storage.persistentStore("settings", {a: 1, b: 2}, {delay: 5});
  await settings.ready;
  await wait(20);
  assert.deepEqual(settings.get(), {a: 5, b: 2});
  assert.equal(db.writes.length, 0);

  db = fakeChrome({}, {failGet: true});
  ({storage} = load());
  const warn = console.warn;
  console.warn = () => {};
  try {
    const other = storage.persistentStore("other", {x: 1});
    await other.ready;
    assert.deepEqual(other.get(), {x: 1});
    assert.equal(await storage.load("other", "défaut"), "défaut");
  } finally {
    console.warn = warn;
  }
});

test("plusieurs onglets : modification distante appliquée, sauf si une écriture locale est en attente", async () => {
  const db = fakeChrome({profiles: {n: 1}});
  const {storage} = load();
  const store = storage.persistentStore("profiles", {n: 0}, {delay: 30});
  await store.ready;
  db.remote("profiles", {n: 2});
  assert.equal(store.get().n, 2, "modification de l'autre onglet appliquée");
  store.set({n: 3});
  db.remote("profiles", {n: 4});
  assert.equal(store.get().n, 3, "écriture locale en attente : elle l'emporte");
  await wait(50);
  assert.equal(db.data.profiles.n, 3, "puis se propage");
});

test("update : ce qu'un autre onglet a enregistré est conservé", async () => {
  const db = fakeChrome({prices: {a: {t: 1}}});
  const {storage} = load();
  db.remote("prices", {a: {t: 1}, b: {t: 2}});
  await storage.update("prices", {}, (stored) => ({...stored, c: {t: 3}}));
  assert.deepEqual(Object.keys(db.data.prices).sort(), ["a", "b", "c"]);
});

test("extension mise à jour sous la page : écriture refusée, joueur prévenu une seule fois", async () => {
  fakeChrome();
  const {storage, bus} = load();
  let notified = 0;
  bus.on("extension-stale", () => notified++);
  globalThis.chrome.runtime.id = undefined;
  await assert.rejects(storage.save("k", 1), /rechargez la page/);
  await assert.rejects(storage.save("k", 2), /rechargez la page/);
  assert.equal(notified, 1);
  assert.equal(await storage.load("k", "défaut"), "défaut");
});
