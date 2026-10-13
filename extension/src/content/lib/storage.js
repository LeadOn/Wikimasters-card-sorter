// Stockage de l'extension (chrome.storage.local, illimité) : jamais le localStorage du site.
import {ext, extensionAlive} from "./ext";
import {createStore} from "./store";
import {emit} from "./bus";

// Après une mise à jour de l'extension, l'ancien script de la page n'a plus accès au stockage :
// le joueur est prévenu une fois qu'il doit recharger la page.
let staleNotified = false;
function stale() {
  if (!staleNotified) emit("extension-stale", {});
  staleNotified = true;
  return new Error("La Toolbox a été mise à jour : rechargez la page WikiMasters.");
}

// Ne lève jamais d'erreur : sans stockage lisible, la valeur par défaut est utilisée.
export async function load(key, fallback) {
  if (!extensionAlive()) return fallback;
  try {
    const result = await ext.storage.local.get(key);
    return result?.[key] ?? fallback;
  } catch (e) {
    if (!extensionAlive()) stale();
    else console.warn("[WikiMasters Toolbox] lecture impossible", key, e);
    return fallback;
  }
}

export async function save(key, value) {
  if (!extensionAlive()) throw stale();
  try {
    await ext.storage.local.set({[key]: value});
  } catch (e) {
    throw extensionAlive() ? e : stale();
  }
}

// Lecture-modification-écriture d'une valeur partagée entre onglets (cache de prix, images…) :
// fn reçoit la valeur enregistrée, ce qu'un autre onglet y a ajouté est conservé.
export async function update(key, fallback, fn) {
  await save(key, fn(await load(key, fallback)));
}

export async function remove(key) {
  if (!extensionAlive()) return;
  try {
    await ext.storage.local.remove(key);
  } catch {}
}

// Clés commençant par `prefix` (ex. caches de collections d'amis)
export async function keysWithPrefix(prefix) {
  if (!extensionAlive()) return [];
  try {
    const all = await ext.storage.local.get(null);
    return Object.keys(all || {}).filter((k) => k.startsWith(prefix));
  } catch {
    return [];
  }
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
// - `ready` ne rejette jamais ;
// - une modification faite avant la fin de la lecture est rejouée sur la valeur enregistrée
//   (au lieu d'écraser celle-ci avec les valeurs par défaut) ;
// - une modification venue d'un autre onglet est ignorée tant qu'une écriture locale est en attente :
//   l'écriture locale l'emporte et se propage ensuite aux autres onglets.
export function persistentStore(key, defaults, {delay = 400, merge = (saved) => ({...defaults, ...saved})} = {}) {
  const store = createStore(defaults);
  const set = store.set;
  let loaded = false;
  let applying = false;
  let timer = null;
  const early = [];

  const flush = () => {
    timer = null;
    save(key, store.get()).catch(() => {});
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(flush, delay);
  };
  const apply = (state) => {
    applying = true;
    try {
      set(() => state);
    } finally {
      applying = false;
    }
  };

  store.set = (patch) => {
    if (!loaded) early.push(patch);
    set(patch);
  };
  store.subscribe(() => {
    if (!applying && loaded) schedule();
  });
  store.ready = load(key, null).then((saved) => {
    let state = saved && typeof saved === "object" ? merge(saved) : store.get();
    for (const patch of early) state = typeof patch === "function" ? patch(state) : {...state, ...patch};
    apply(state);
    loaded = true;
    if (early.length) schedule();
    early.length = 0;
  });
  onChange(key, (value) => {
    if (!loaded || timer || !value || typeof value !== "object") return;
    if (JSON.stringify(value) === JSON.stringify(store.get())) return;
    apply(merge(value));
  });
  return store;
}
