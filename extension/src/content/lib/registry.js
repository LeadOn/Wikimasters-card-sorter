// Registre des cartes vues dans les réponses du site (collection, catalogue, marché, amis…),
// indexé par titre : le DOM du site n'expose pas l'id des cartes, seulement leur titre.
import {on} from "./bus";
import {createStore} from "./store";

const byTitle = new Map();
const byId = new Map();
export const registryVersion = createStore({v: 0});

let pending = false;
function bump() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    registryVersion.set((s) => ({v: s.v + 1}));
  });
}

export const normTitle = (t) => String(t || "").replace(/\s+/g, " ").trim();

export function remember(card, extra = {}) {
  const title = normTitle(card?.wikipedia_title || card?.title);
  if (!title) return;
  const prev = byTitle.get(title) || {};
  const next = {
    ...prev,
    id: card.id || card.card_id || prev.id,
    title,
    rarity: card.rarity || prev.rarity || null,
    category: card.category ?? prev.category ?? "",
    summary: card.summary ?? prev.summary,
    image_url: card.hide_image ? null : card.image_url ?? prev.image_url ?? null,
    wikipedia_url: card.wikipedia_url || prev.wikipedia_url || null,
    ...extra,
  };
  byTitle.set(title, next);
  if (next.id) byId.set(next.id, next);
  bump();
}

export const lookupTitle = (title) => byTitle.get(normTitle(title));
export const lookupId = (id) => byId.get(id);

export function startRegistry() {
  on("my-collection", ({data}) => {
    for (const e of data?.collection || []) remember(e.card, {owned: true, myTags: e.tags || []});
  });
  on("friend-collection", ({data}) => {
    for (const e of data?.collection || []) remember(e.card, e.owned_by_viewer == null ? {} : {owned: Boolean(e.owned_by_viewer)});
  });
  on("catalog", ({data}) => {
    const ownedIds = new Set(data?.ownedCardIds || []);
    for (const c of data?.cards || []) remember(c, data?.ownedCardIds ? {owned: ownedIds.has(c.id), friendOwners: data.friendOwners?.[c.id]} : {});
  });
  on("marketplace", ({data}) => {
    for (const a of data?.auctions || []) if (a.card) remember(a.card, typeof a.owned === "boolean" ? {owned: a.owned} : {});
  });
  on("auction", ({data}) => data?.auction?.card && remember(data.auction.card));
  on("trades", ({data}) => {
    for (const t of data?.trades || []) for (const it of t.items || []) if (it.card) remember(it.card);
  });
  on("pack-opened", ({data}) => {
    for (const c of data?.cards || []) remember(c, {owned: true});
  });
}
