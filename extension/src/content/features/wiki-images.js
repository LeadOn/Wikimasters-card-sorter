// Images de remplacement pour les cartes sans image : miniature de l'article sur Wikipédia
// (requête anonyme, sans cookie ni référent). Résultats mis en cache.
import {load, save} from "../lib/storage";
import {createLimiter} from "../lib/http";

const KEY = "wikiThumbs";
const memory = new Map();
const limit = createLimiter(2);
let loaded = load(KEY, {}).then((saved) => {
  for (const [k, v] of Object.entries(saved)) memory.set(k, v);
});
let saveTimer = null;

export async function wikiThumbnail(title) {
  await loaded;
  if (memory.has(title)) return memory.get(title);
  const promise = limit(async () => {
    try {
      const url = `https://fr.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=pageimages&piprop=thumbnail&pithumbsize=400&titles=${encodeURIComponent(title)}`;
      const res = await fetch(url, {credentials: "omit", referrerPolicy: "no-referrer"});
      const data = await res.json();
      const page = Object.values(data?.query?.pages || {})[0];
      return page?.thumbnail?.source || null;
    } catch {
      return null;
    }
  });
  memory.set(title, promise);
  const src = await promise;
  memory.set(title, src);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const plain = Object.fromEntries([...memory].filter(([, v]) => typeof v === "string" || v === null));
    save(KEY, plain).catch(() => {});
  }, 3000);
  return src;
}
