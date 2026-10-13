// Images de remplacement pour les cartes sans image, cherchées sur Wikimedia (requêtes anonymes,
// sans cookie ni référent), de la source la plus fiable à la plus approximative :
//   1. image principale de l'article sur Wikipédia en français ;
//   2. image de l'élément Wikidata (P18) ;
//   3. image principale de l'article en anglais (affiches, pochettes, logos qu'il est seul à avoir) ;
//   4. photo d'un de ses membres (duo, groupe : « composé de », P527) ;
//   5. affiche, logo, blason ou drapeau de l'élément Wikidata ;
//   6. image principale de l'article dans une autre langue, trouvé par les liens de l'élément
//      Wikidata (quelques Wikipédias au plus, des plus suivies aux plus petites) ;
//   7. carte de localisation (lieux).
// (Les photos d'une catégorie Commons, trop souvent sans rapport avec le sujet, ne sont pas utilisées.)
// Une page d'homonymie n'a pas d'image.
// Prudence : seules les images principales des articles de Wikipédia (1, 3 et 6) sont choisies et
// filtrées par ses éditeurs. Pour un sujet sensible (sexualité, chirurgie, maladie, violence, mort…),
// on s'en tient à celles du français et de l'anglais ; pour les autres, chaque fichier de Wikidata
// ou d'une autre Wikipédia est vérifié contre la liste des images à ne pas afficher de Wikipédia en
// anglais (MediaWiki:Bad image list). Une autre Wikipédia illustre souvent un lieu par la carte
// vierge de son pays, un article sans photo par une image « manquante » : elles sont écartées.
// Résultats mis en cache ; une recherche sans résultat est refaite au bout d'une semaine, ou dès
// qu'une source a été ajoutée (SOURCES), une recherche interrompue par le réseau à la prochaine demande.
// Les requêtes s'identifient (Api-User-Agent, comme le demande Wikimedia) et s'arrêtent une minute
// quand Wikimedia signale trop de requêtes.
import {load, update, remove} from "../lib/storage";
import {createLimiter} from "../lib/http";

const KEY = "wikiImages";
const WIDTH = 640;
const MISS_TTL = 7 * 24 * 3600 * 1000;
// Version des sources : à augmenter quand une source est ajoutée, pour refaire les recherches vaines
const SOURCES = 2;
// Propriétés Wikidata essayées après l'article anglais, dans cet ordre
const FALLBACK_PROPS = ["P3383", "P154", "P94", "P41"]; // affiche, logo, blason, drapeau
const MAP_PROP = "P242"; // carte de localisation
const MAX_MEMBERS = 4;
// Autres Wikipédias, par ordre de préférence : les éditions les plus suivies (pas celles qu'un robot
// remplit d'articles de lieux illustrés par une carte vierge). Avec l'anglais, 50 au plus (sitefilter).
const OTHER_WIKIS = ["de", "es", "it", "nl", "pt", "ru", "pl", "sv", "ja", "zh", "uk", "cs", "ca", "fi", "no", "da", "hu", "ro", "ar", "fa", "he", "tr", "ko", "vi", "id", "el", "sr", "bg", "ka", "hy", "eu", "gl", "et", "lt", "lv", "sk", "sl", "hr", "be", "kk", "th", "hi", "bn"];
const MAX_WIKIS = 5;
// Fichier sans rapport avec le sujet : carte, image « manquante », fichier qui n'est pas une image
const GENERIC = /(^|[^a-z])(maps?|locator)([^a-z]|$)|missing|falta[\W_]imag|ne[\W_]havas|no[\W_]?image|sin[\W_]imagen|kein[\W_]bild|replace[\W_]this|image[\W_]manquante|placeholder|silhouette|silueta|\.(pdf|djvu|ogv|webm|ogg|oga|mp3|wav|flac|midi?|opus)$/i;
// Sujet sensible, d'après le titre et la description courte de la carte
const SENSITIVE = /\bsex|porno|érot|nudit|\bnue?s?\b|génit|pénis|vagin|vulv|clitor|\banus\b|\banal\b|mammaire|prostitu|fétich|bdsm|masturb|orgasm|chirurg|opératoire|amputa|plastie\b|ectomie\b|maladie|syndrome|infection|tumeur|cancer|lésion|blessure|cadavre|autopsie|décapit|exécution|torture|massacre|génocide|suicide|meurtre|assassinat|tuerie|mutila|accouchement|fœtus|foetus|avortement|nécro|charnier/iu;
const AGENT = `WikiMastersToolbox/${__VERSION__} (https://github.com/LeadOn/Wikimasters-card-sorter)`;
const PAUSE = 60 * 1000;
let pausedUntil = 0;

const memory = new Map(); // titre → url, null (aucune image) ou promesse en cours
const fresh = new Map(); // résultats à enregistrer : titre → {u, t, v}
const limit = createLimiter(2);
const loaded = load(KEY, {}).then((saved) => {
  const now = Date.now();
  for (const [title, e] of Object.entries(saved || {})) {
    if (memory.has(title) || !e) continue;
    if (e.u || (e.v === SOURCES && now - e.t < MISS_TTL)) memory.set(title, e.u || null);
  }
});
// Cache de l'ancienne version (Wikipédia en français seulement) : ses « aucune image » sont à revoir
remove("wikiThumbs").catch(() => {});

let saveTimer = null;
function persist() {
  saveTimer ||= setTimeout(() => {
    saveTimer = null;
    const entries = [...fresh];
    fresh.clear();
    update(KEY, {}, (stored) => ({...stored, ...Object.fromEntries(entries)})).catch(() => {});
  }, 3000);
}

class NetworkError extends Error {}

async function api(host, params) {
  if (Date.now() < pausedUntil) throw new NetworkError();
  const url = `https://${host}/w/api.php?${new URLSearchParams({format: "json", formatversion: "2", origin: "*", ...params})}`;
  let res;
  try {
    res = await fetch(url, {credentials: "omit", referrerPolicy: "no-referrer", headers: {"Api-User-Agent": AGENT}});
  } catch {
    throw new NetworkError();
  }
  if (res.status === 429) pausedUntil = Date.now() + PAUSE;
  if (!res.ok) throw new NetworkError();
  return res.json();
}

// Seules les images servies par Wikimedia sont acceptées (les miniatures viennent de thumb.wikimedia.org,
// une image plus petite que la taille demandée d'upload.wikimedia.org)
const safe = (src) => (typeof src === "string" && /^https:\/\/(upload|thumb|commons)\.wikimedia\.org\//.test(src) ? src : null);
const fileUrl = (name) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=${WIDTH}`;

async function pageImage(host, title) {
  const data = await api(host, {action: "query", redirects: "1", prop: "pageimages|pageprops", piprop: "thumbnail|name", pithumbsize: String(WIDTH), pilicense: "any", ppprop: "wikibase_item|disambiguation", titles: title});
  const page = data?.query?.pages?.[0];
  if (!page || page.missing) return {};
  return {src: safe(page.thumbnail?.source), name: page.pageimage || null, qid: page.pageprops?.wikibase_item || null, disambiguation: page.pageprops?.disambiguation !== undefined};
}

// Valeur retenue d'une propriété Wikidata : rang « préféré » d'abord, jamais « obsolète »
function claimValue(entity, prop) {
  const claims = (entity?.claims?.[prop] || []).filter((c) => c.rank !== "deprecated" && c.mainsnak?.datavalue);
  const best = claims.find((c) => c.rank === "preferred") || claims[0];
  const value = best?.mainsnak.datavalue.value;
  return typeof value === "string" ? value : null;
}

const entities = (ids, props, sites = []) => api("www.wikidata.org", {action: "wbgetentities", ids: ids.join("|"), props, ...(sites.length && {sitefilter: sites.join("|")})});

// Fichier autorisé : absent de la liste des images à ne pas afficher de Wikipédia en anglais
async function allowed(name) {
  const data = await api("en.wikipedia.org", {action: "query", prop: "imageinfo", iiprop: "badfile", titles: `File:${name}`});
  return data?.query?.pages?.[0]?.badfile !== true;
}

const fileImage = async (name) => (name && (await allowed(name)) ? fileUrl(name) : null);

// Photos des membres d'un duo ou d'un groupe (« composé de », P527)
async function memberImages(entity) {
  const ids = (entity?.claims?.P527 || []).map((c) => c.mainsnak?.datavalue?.value?.id).filter(Boolean).slice(0, MAX_MEMBERS);
  if (!ids.length) return [];
  const data = await entities(ids, "claims");
  return ids.map((id) => claimValue(data?.entities?.[id], "P18")).filter(Boolean);
}

// Image principale de l'article dans d'autres langues (liens de l'élément Wikidata)
async function otherWikiImage(entity) {
  const links = OTHER_WIKIS.map((lang) => [lang, entity?.sitelinks?.[`${lang}wiki`]?.title]).filter(([, title]) => title);
  for (const [lang, title] of links.slice(0, MAX_WIKIS)) {
    const page = await pageImage(`${lang}.wikipedia.org`, title);
    if (page.src && page.name && !GENERIC.test(page.name) && (await allowed(page.name))) return page.src;
  }
  return null;
}


// context : description courte de la carte, pour reconnaître un sujet sensible
// Renvoie une url, null (aucune image), ou undefined (réseau indisponible : rien n'est mémorisé)
export async function findWikiImage(title, context = "") {
  try {
    const fr = await pageImage("fr.wikipedia.org", title);
    if (fr.src) return fr.src;
    if (fr.disambiguation || !fr.qid) return null;
    const cautious = SENSITIVE.test(`${title} ${context}`);

    const data = await entities([fr.qid], "claims|sitelinks", ["en", ...OTHER_WIKIS].map((lang) => `${lang}wiki`));
    const entity = data?.entities?.[fr.qid];
    if (!cautious) {
      const image = await fileImage(claimValue(entity, "P18"));
      if (image) return image;
    }
    const enTitle = entity?.sitelinks?.enwiki?.title;
    if (enTitle) {
      const en = await pageImage("en.wikipedia.org", enTitle);
      if (en.src) return en.src;
    }
    if (cautious) return null;
    for (const name of await memberImages(entity)) {
      const image = await fileImage(name);
      if (image) return image;
    }
    for (const prop of FALLBACK_PROPS) {
      const image = await fileImage(claimValue(entity, prop));
      if (image) return image;
    }
    return (await otherWikiImage(entity)) || (await fileImage(claimValue(entity, MAP_PROP)));
  } catch (e) {
    if (e instanceof NetworkError) return undefined;
    return null;
  }
}

// Image déjà connue (synchrone) : url, null, ou undefined si elle n'a pas encore été cherchée
export function knownWikiImage(title) {
  const v = memory.get(title);
  return v instanceof Promise ? undefined : v;
}

export async function wikiImage(title, context = "") {
  await loaded;
  if (memory.has(title)) return memory.get(title);
  const promise = limit(() => findWikiImage(title, context));
  memory.set(title, promise);
  const src = await promise;
  if (src === undefined) {
    memory.delete(title);
    return null;
  }
  memory.set(title, src);
  fresh.set(title, {u: src, t: Date.now(), v: SOURCES});
  persist();
  return src;
}
