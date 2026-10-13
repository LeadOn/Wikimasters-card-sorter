// Images de remplacement pour les cartes sans image : miniature de l'article sur Wikipédia
// (requête anonyme, sans cookie ni référent). Résultats mis en cache.
import {load, update} from "../lib/storage";
import {createLimiter} from "../lib/http";

const KEY = "wikiThumbs";
const memory = new Map(); // titre → url, null (aucune image), ou promesse en cours
const fresh = new Map(); // résultats à enregistrer
const limit = createLimiter(2);
const loaded = load(KEY, {}).then((saved) => {
  for (const [k, v] of Object.entries(saved || {})) if (!memory.has(k)) memory.set(k, v);
});
let saveTimer = null;

function persist() {
  saveTimer ||= setTimeout(() => {
    saveTimer = null;
    const entries = [...fresh];
    fresh.clear();
    update(KEY, {}, (stored) => ({...stored, ...Object.fromEntries(entries)})).catch(() => {});
  }, 3000);
}

// undefined : Wikipédia n'a pas répondu (réseau) → rien n'est mémorisé, nouvel essai plus tard
async function lookup(title) {
  try {
    const url = `https://fr.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=pageimages&piprop=thumbnail&pithumbsize=400&titles=${encodeURIComponent(title)}`;
    const res = await fetch(url, {credentials: "omit", referrerPolicy: "no-referrer"});
    if (!res.ok) return undefined;
    const data = await res.json();
    const page = Object.values(data?.query?.pages || {})[0];
    const src = page?.thumbnail?.source;
    return typeof src === "string" && src.startsWith("https://") ? src : null;
  } catch {
    return undefined;
  }
}

export async function wikiThumbnail(title) {
  await loaded;
  if (memory.has(title)) return memory.get(title);
  const promise = limit(() => lookup(title));
  memory.set(title, promise);
  const src = await promise;
  if (src === undefined) {
    memory.delete(title);
    return null;
  }
  memory.set(title, src);
  fresh.set(title, src);
  persist();
  return src;
}
