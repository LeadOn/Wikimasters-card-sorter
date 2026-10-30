// Cartes de ma collection selon leur image : sans image (absente, ou masquée par le site) ou au
// format GIF (souvent animée). Lu sur toute la collection, pas seulement sur la page affichée par le
// site (50 cartes). Onglet « Images », et vues « Sans image » et « GIF » de la page Collection
// (features/collection-view.js).
import {createStore} from "../lib/store";
import {loadMyCollection} from "../state/collection";
import {rarityRank} from "../../../../core";
import {L} from "../../shared/i18n";

export const IMAGE_FILTERS = [
  {id: "none", label: L("Sans image", "No image")},
  {id: "gif", label: "GIF"},
];

// Fichier GIF : l'original ou sa vignette sur Wikimedia (…/330px-Nom.gif?utm_source=…)
const GIF = /\.gif$/i;

// "none" | "gif" | "image"
export function imageKind(card) {
  if (!card?.image_url || card.hide_image) return "none";
  let path = card.image_url;
  try {
    path = new URL(card.image_url).pathname;
  } catch {
    path = path.split(/[?#]/)[0];
  }
  return GIF.test(path) ? "gif" : "image";
}

// {none: [...], gif: [...]} : une entrée par carte et par rareté (exemplaires cumulés),
// raretés les plus hautes d'abord, puis par titre
export function groupByImage(copies) {
  const groups = {none: new Map(), gif: new Map()};
  for (const c of copies) {
    const group = groups[imageKind(c.card)];
    if (!group) continue;
    const key = `${c.card_id}|${c.rarity}`;
    const prev = group.get(key);
    group.set(key, prev ? {...prev, count: prev.count + c.count} : {...c});
  }
  const order = (a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || (a.card.wikipedia_title || "").localeCompare(b.card.wikipedia_title || "", "fr");
  return {none: [...groups.none.values()].sort(order), gif: [...groups.gif.values()].sort(order)};
}

export const imageState = createStore({groups: null, loading: false, progress: 0, error: null});

// Relit la collection (en cache quelques minutes) et recalcule les groupes
export async function loadImageGroups() {
  if (imageState.get().loading) return;
  imageState.set({loading: true, progress: 0, error: null});
  try {
    const copies = await loadMyCollection({onProgress: (progress) => imageState.set({progress})});
    imageState.set({groups: groupByImage(copies), loading: false});
  } catch (e) {
    imageState.set({loading: false, error: e?.message || String(e)});
  }
}
