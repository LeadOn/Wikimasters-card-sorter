// Verrou entre onglets (navigator.locks) : résultat et erreur de l'opération transmis, opération
// refusée quand le verrou est pris, et cas de Firefox (comportement relevé dans Firefox 159) : le
// navigator.locks d'un script de contenu est celui de la page, et sa promesse est rejetée
// (« Permission denied to access property "then" ») quel que soit le retour du rappel ; seul le
// navigator.locks de la page (wrappedJSObject) appelé avec un rappel exporté fonctionne, à
// condition que ce rappel rende une promesse de la page.
const test = require("node:test");
const assert = require("node:assert/strict");
const {loadExtensionModule} = require("./helpers/extension");

// Promesses et fonctions « de la page » (Firefox)
class PagePromise extends Promise {}
const exported = new WeakSet();
const DENIED = 'Permission denied to access property "then"';

// page : navigator.locks de la page vu par wrappedJSObject (Firefox) ; content : celui que voit le
// script de contenu sous Firefox, toujours rejeté.
function fakeLocks({firefox = false, page = false} = {}) {
  if (firefox && !page) {
    return {request: (name, opts, cb) => Promise.resolve().then(() => (typeof opts === "function" ? opts : cb)({name})).then(() => Promise.reject(new Error(DENIED)))};
  }
  const held = new Map(); // nom → file des rappels en attente
  async function run(name, cb) {
    try {
      if (page && !exported.has(cb)) throw new Error("Permission denied to access object");
      const value = cb({name});
      if (page && value && typeof value.then === "function" && !(value instanceof PagePromise)) {
        throw new Error(DENIED);
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
    globalThis.wrappedJSObject = {Promise: PagePromise, navigator: {locks: fakeLocks({firefox, page: true})}};
    globalThis.exportFunction = (fn) => (exported.add(fn), fn);
    globalThis.cloneInto = (value) => structuredClone(value);
  } else {
    delete globalThis.wrappedJSObject;
    delete globalThis.exportFunction;
    delete globalThis.cloneInto;
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
