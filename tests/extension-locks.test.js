// Verrou entre onglets (navigator.locks) : résultat et erreur de l'opération transmis, opération
// refusée quand le verrou est pris, et cas de Firefox, où le navigator.locks d'un script de contenu
// est celui de la page et refuse une promesse du script (« Permission denied to access property "then" »).
const test = require("node:test");
const assert = require("node:assert/strict");
const {loadExtensionModule} = require("./helpers/extension");

// Promesses « de la page » (Firefox) : seules acceptées par le faux navigator.locks en mode Firefox
class PagePromise extends Promise {}

function fakeLocks({firefox = false} = {}) {
  const held = new Map(); // nom → file des rappels en attente
  async function run(name, cb) {
    try {
      const value = cb({name});
      if (firefox && value && typeof value.then === "function" && !(value instanceof PagePromise)) {
        throw new Error('Permission denied to access property "then"');
      }
      return await value;
    } finally {
      const queue = held.get(name);
      const next = queue.shift();
      if (next) next();
      else held.delete(name);
    }
  }
  return {
    request(name, opts, cb) {
      if (typeof opts === "function") [opts, cb] = [{}, opts];
      if (held.has(name)) {
        if (opts.ifAvailable) return Promise.resolve().then(() => cb(null));
        return new Promise((resolve) => held.get(name).push(resolve)).then(() => run(name, cb));
      }
      held.set(name, []);
      return run(name, cb);
    },
  };
}

function setup({firefox = false} = {}) {
  globalThis.window = globalThis;
  Object.defineProperty(globalThis, "navigator", {value: {languages: ["fr-FR"], locks: fakeLocks({firefox})}, configurable: true, writable: true});
  if (firefox) {
    globalThis.wrappedJSObject = {Promise: PagePromise};
    globalThis.exportFunction = (fn) => fn;
  } else {
    delete globalThis.wrappedJSObject;
    delete globalThis.exportFunction;
  }
  return loadExtensionModule("extension/src/content/lib/locks.js");
}

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return {promise, resolve};
};

for (const firefox of [false, true]) {
  const browser = firefox ? "Firefox" : "Chrome";

  test(`${browser} : le résultat et l'erreur de l'opération sont transmis`, async () => {
    const {withLock} = setup({firefox});
    assert.equal(await withLock("sort", async () => 42), 42);
    assert.equal(await withLock("sort", async () => "attendu", {wait: true}), "attendu");
    await assert.rejects(withLock("sort", async () => Promise.reject(new Error("panne"))), /panne/);
    await assert.rejects(withLock("sort", () => {
      throw new Error("synchrone");
    }), /synchrone/);
  });

  test(`${browser} : une opération du même type est refusée, ou attend avec wait`, async () => {
    const {withLock} = setup({firefox});
    const gate = deferred();
    const order = [];
    const first = withLock("packs", async () => {
      await gate.promise;
      order.push("premier");
    });
    await new Promise((r) => setTimeout(r, 0));
    await assert.rejects(withLock("packs", async () => order.push("refusé")), /déjà en cours/);
    const waiting = withLock("packs", async () => order.push("après"), {wait: true});
    assert.equal(await withLock("sort", async () => "autre verrou"), "autre verrou");
    gate.resolve();
    await Promise.all([first, waiting]);
    assert.deepEqual(order, ["premier", "après"]);
  });
}

test("sans navigator.locks, l'opération est lancée directement", async () => {
  const {withLock} = setup();
  globalThis.navigator.locks = undefined;
  assert.equal(await withLock("sort", async () => "direct"), "direct");
});
