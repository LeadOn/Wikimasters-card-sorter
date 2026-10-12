// Stockage de l'extension (chrome.storage.local, illimité) : jamais le localStorage du site.
import {ext, extensionAlive} from "./ext";
import {createStore} from "./store";

export async function load(key, fallback) {
  if (!extensionAlive()) return fallback;
  const result = await ext.storage.local.get(key);
  return result[key] ?? fallback;
}

export async function save(key, value) {
  if (!extensionAlive()) throw new Error("L'extension a été mise à jour : rechargez la page.");
  await ext.storage.local.set({[key]: value});
}

export async function remove(key) {
  if (extensionAlive()) await ext.storage.local.remove(key);
}

// Clés commençant par `prefix` (ex. caches de collections d'amis)
export async function keysWithPrefix(prefix) {
  if (!extensionAlive()) return [];
  const all = await ext.storage.local.get(null);
  return Object.keys(all).filter((k) => k.startsWith(prefix));
}

export function onChange(key, fn) {
  if (!extensionAlive()) return () => {};
  const listener = (changes, area) => {
    if (area === "local" && key in changes) fn(changes[key].newValue);
  };
  ext.storage.onChanged.addListener(listener);
  return () => ext.storage.onChanged.removeListener(listener);
}

// Store réactif enregistré automatiquement (écritures regroupées) et synchronisé entre onglets.
export function persistentStore(key, defaults, {delay = 400, merge = (saved) => ({...defaults, ...saved})} = {}) {
  const store = createStore(defaults);
  let timer = null;
  let applyingRemote = false;
  store.ready = load(key, null).then((saved) => {
    if (saved) {
      applyingRemote = true;
      store.set(merge(saved));
      applyingRemote = false;
    }
  });
  store.subscribe((state) => {
    if (applyingRemote) return;
    clearTimeout(timer);
    timer = setTimeout(() => save(key, state).catch(() => {}), delay);
  });
  onChange(key, (value) => {
    if (!value || JSON.stringify(value) === JSON.stringify(store.get())) return;
    applyingRemote = true;
    store.set(merge(value));
    applyingRemote = false;
  });
  return store;
}
