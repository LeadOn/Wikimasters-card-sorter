// Imitation minimale de l'API d'extension, pour tester la Toolbox en l'injectant dans une page
// (node extension/dev/make-inject.mjs, voir docs/architecture.md). Ne fait pas partie de l'extension.
(() => {
  if (globalThis.chrome?.runtime?.id) return;
  const data = {};
  const listeners = new Set();
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  globalThis.chrome = {
    runtime: {id: "wmt-dev", onMessage: {addListener() {}}, getManifest: () => ({version: "dev"})},
    storage: {
      local: {
        async get(key) {
          if (key == null) return clone(data);
          const keys = [].concat(key);
          return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, clone(data[k])]));
        },
        async set(obj) {
          const changes = {};
          for (const [k, v] of Object.entries(obj)) {
            changes[k] = {oldValue: data[k], newValue: clone(v)};
            data[k] = clone(v);
          }
          for (const fn of listeners) fn(changes, "local");
        },
        async remove(key) {
          for (const k of [].concat(key)) delete data[k];
        },
      },
      onChanged: {addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn)},
    },
  };
})();
