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

// copies : [{id, card_id, count, starred, rarity, card: {…}}] ; withSummary : résumé Wikipédia inclus
export async function loadMyCollection({withSummary = false, force = false, onProgress} = {}) {
  if (!force && cache && Date.now() - cache.at < MAX_AGE && (cache.withSummary || !withSummary)) return cache.copies;
  if (inflight && (!withSummary || inflight.withSummary)) return inflight.promise;
  const fields = withSummary ? `${CARD_FIELDS},summary` : CARD_FIELDS;
  const promise = fetchAll(`user_cards?select=${SELECT},cards(${fields})&order=obtained_at.desc`, {onPage: onProgress}).then((rows) => {
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
    cache = {at: Date.now(), withSummary, copies};
    const ids = new Set(copies.map((c) => c.card_id));
    owned.set({ids, loadedAt: Date.now()});
    save("ownedCardIds", {ids: [...ids], at: Date.now()}).catch(() => {});
    return copies;
  });
  inflight = {withSummary, promise};
  try {
    return await promise;
  } finally {
    inflight = null;
  }
}

export const invalidateCollection = () => (cache = null);

// Lignes Supabase au format attendu par le moteur (core/tag-sync.js) : {id, card_id, count, cards}
export const toEngineRows = (copies) => copies.map((c) => ({id: c.id, card_id: c.card_id, count: c.count, cards: c.card}));

// Nouvelles cartes vues dans un paquet : la collection en mémoire n'est plus à jour
// (les ids possédés sont complétés par features/packs.js, qui a besoin de l'état d'avant).
on("pack-opened", () => (cache = null));

export function addOwned(cardIds) {
  const ids = owned.get().ids;
  for (const id of cardIds) ids.add(id);
  owned.set({ids});
}
