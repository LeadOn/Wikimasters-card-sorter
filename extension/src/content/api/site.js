// Routes /api du site WikiMasters (authentifiées par les cookies de session, même origine).
// Voir docs/site-api.md. Les lectures sont réessayées ; les écritures jamais automatiquement.
import {request, createLimiter} from "../lib/http";

const limit = createLimiter(6);

export const siteGet = (path, opts = {}) => limit(() => request(path, {...opts, credentials: "include"}));

const sitePost = (path, body, opts = {}) =>
  request(path, {
    method: "POST",
    credentials: "include",
    ...(body !== undefined && {body, headers: {"content-type": "application/json"}}),
    ...opts,
  });

const qs = (params) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue;
    for (const item of [].concat(v)) q.append(k, String(item));
  }
  return q.toString();
};

export const site = {
  friends: () => siteGet("/api/friends"),
  profile: (username) => siteGet(`/api/profile/${encodeURIComponent(username)}`),
  // 50 cartes par page ; souvent lente (jusqu'à 30 s)
  profileCollection: (username, page, {rarities = [], stats = false, signal} = {}) =>
    siteGet(
      `/api/profile/${encodeURIComponent(username)}/collection?${qs({page, sort: "rarity", stats: stats ? 1 : 0, pending: 1, rarity: rarities})}`,
      {timeout: 90000, retries: 8, signal},
    ),
  myCollectionStats: () => siteGet("/api/my-collection/stats?sort=rarity"),
  searchCards: ({q, page = 0, rarities = [], sort = "rarity", signal} = {}) =>
    siteGet(`/api/cards?${qs({page, q, sort, rarity: rarities})}`, {signal}),
  salesSummary: (cardId, {signal} = {}) => siteGet(`/api/marketplace/cards/${cardId}/sales?scope=summary`, {retries: 3, signal}),
  marketplaceSearch: ({q, page = 1, rarities = [], sort} = {}) => siteGet(`/api/marketplace?${qs({page, limit: 50, q, sort, rarity: rarities})}`),
  marketplaceMine: () => siteGet("/api/marketplace?page=1&limit=50&mine=1"),
  marketplaceQuota: () => siteGet("/api/marketplace/mine"),
  auction: (id) => siteGet(`/api/marketplace/${id}`),
  wikibidous: () => siteGet("/api/wikibidous"),
  trades: () => siteGet("/api/trades"),
  // Écritures : chacune est déclenchée par un clic du joueur
  // Malgré son nom, card_id attend l'id de l'EXEMPLAIRE (user_cards.id), comme le formulaire du site
  createAuction: ({userCardId, baseAmount, durationMinutes}) =>
    sitePost("/api/marketplace", {card_id: userCardId, base_amount: baseAmount, duration_minutes: durationMinutes}),
  bid: (auctionId, amount) => sitePost(`/api/marketplace/${auctionId}/bid`, {amount}),
  // Défausse d'un exemplaire (id de user_cards) contre 1 WikiBidou ; refusée pour un favori ou une carte en échange
  discard: (userCardId) => sitePost(`/api/user-cards/${encodeURIComponent(userCardId)}/discard`),
  openPack: () => sitePost("/api/packs/open", undefined, {timeout: 60000}),
};

export const AUCTION_DURATIONS = [
  {minutes: 10, label: "10 min"},
  {minutes: 30, label: "30 min"},
  {minutes: 60, label: "1 h"},
  {minutes: 180, label: "3 h"},
  {minutes: 360, label: "6 h"},
  {minutes: 720, label: "12 h"},
];
