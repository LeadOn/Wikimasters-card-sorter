// Ma collection (exemplaires), lue dans Supabase. Gardée en mémoire quelques minutes ; les ids des
// cartes possédées sont aussi enregistrés pour les badges « possédée ».
import {fetchAll} from "../api/supabase";
import {createStore} from "../lib/store";
import {load, save} from "../lib/storage";
import {on} from "../lib/bus";

const MAX_AGE = 10 * 60 * 1000;
const SELECT = "id,card_id,count,starred,is_shiny,snapshot_rarity,obtained_at";
const CARD_FIELDS = "id,wikipedia_title,category,rarity,image_url,wikipedia_url,pageviews,hide_image";

export const owned = createStore({ids: new Set(), loadedAt: 0});
load("ownedCardIds", null).then((saved) => {
  if (saved && !owned.get().loadedAt) owned.set({ids: new Set(saved.ids), loadedAt: saved.at});
});

let cache = null;
let inflight = null;
// Incrémentée à chaque invalidation : une lecture commencée avant (paquet ouvert, tri appliqué…)
// ne remplace pas le cache par des données périmées.
let generation = 0;

// copies : [{id, card_id, count, starred, rarity, card: {…}}] ; withSummary : résumé Wikipédia inclus
export async function loadMyCollection({withSummary = false, force = false, onProgress} = {}) {
  if (!force && cache && Date.now() - cache.at < MAX_AGE && (cache.withSummary || !withSummary)) return cache.copies;
  if (!force && inflight && inflight.gen === generation && (!withSummary || inflight.withSummary)) return inflight.promise;
  const gen = generation;
  const fields = withSummary ? `${CARD_FIELDS},summary` : CARD_FIELDS;
  // Les cartes d'un même paquet partagent la même date : `id` départage pour une pagination stable
  const promise = fetchAll(`user_cards?select=${SELECT},cards(${fields})&order=obtained_at.desc,id.asc`, {onPage: onProgress, key: "id"}).then((rows) => {
    const copies = rows
      .filter((r) => r.cards)
      .map((r) => ({
        id: r.id,
        card_id: r.card_id,
        count: Math.max(1, Number(r.count) || 1),
        starred: Boolean(r.starred),
        is_shiny: Boolean(r.is_shiny),
        obtained_at: r.obtained_at,
        rarity: r.snapshot_rarity || r.cards.rarity,
        card: {...r.cards, image_url: r.cards.hide_image ? null : r.cards.image_url},
      }));
    if (gen === generation) {
      // Une lecture sans résumé ne remplace pas une lecture plus complète
      if (!(cache?.withSummary && !withSummary)) cache = {at: Date.now(), withSummary, copies};
      const ids = new Set(copies.map((c) => c.card_id));
      owned.set({ids, loadedAt: Date.now()});
      save("ownedCardIds", {ids: [...ids], at: Date.now()}).catch(() => {});
    }
    return copies;
  });
  const entry = {withSummary, promise, gen};
  inflight = entry;
  try {
    return await promise;
  } finally {
    if (inflight === entry) inflight = null;
  }
}

export function invalidateCollection() {
  generation++;
  cache = null;
}

// Lignes Supabase au format attendu par le moteur (core/tag-sync.js) : {id, card_id, count, cards}
export const toEngineRows = (copies) => copies.map((c) => ({id: c.id, card_id: c.card_id, count: c.count, cards: c.card}));

// Nouvelles cartes vues dans un paquet : la collection en mémoire n'est plus à jour
// (les ids possédés sont complétés par features/packs.js, qui a besoin de l'état d'avant).
on("pack-opened", ({method}) => method === "POST" && invalidateCollection());

export function addOwned(cardIds) {
  const ids = owned.get().ids;
  for (const id of cardIds) ids.add(id);
  owned.set({ids});
}
