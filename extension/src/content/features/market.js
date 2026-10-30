// Marché : mes enchères (suivi, surenchère, alerte de fin) et vente ou défausse de mes doublons.
import {site} from "../api/site";
import {createStore} from "../lib/store";
import {readSession} from "../lib/session";
import {on, emit} from "../lib/bus";
import {settings, isOn} from "../state/settings";
import {loadMyCollection, invalidateCollection, discardCopy} from "../state/collection";
import {priceOf, loadPrices} from "../state/prices";
import {spareCards} from "../../../../core";
import {L} from "../../shared/i18n";

export const bidsState = createStore({selling: [], bidding: [], won: [], loading: false, error: null, at: 0, balance: null});

const mine = (a) => a.current_bidder_id && a.current_bidder_id === readSession()?.userId;
export const isLeading = mine;
export const msLeft = (a) => new Date(a.end_at).getTime() - Date.now();

function setFromResponse(data) {
  if (!data || typeof data !== "object" || !("bidding" in data || "selling" in data)) return;
  const prev = bidsState.get();
  const list = (value, fallback) => (Array.isArray(value) ? value : fallback);
  bidsState.set({
    selling: list(data.selling, prev.selling),
    bidding: list(data.bidding, prev.bidding).filter((a) => !a.status || a.status === "active"),
    won: list(data.won, prev.won),
    at: Date.now(),
  });
}
on("marketplace", ({data, path}) => path.includes("mine=1") && setFromResponse(data));
on("wikibidous", ({data}) => typeof data?.balance === "number" && bidsState.set({balance: data.balance}));

// --- Enchères vues dans les réponses du site (liste du marché, fiche d'une enchère, mes enchères),
// pour les blocs intégrés aux pages : analyse d'une enchère, pastilles « bonne affaire ».
const auctions = new Map(); // id → enchère
export const auctionVersion = createStore({v: 0});
function rememberAuctions(list) {
  let changed = false;
  for (const a of Array.isArray(list) ? list : []) {
    if (!a?.id) continue;
    auctions.set(a.id, {...auctions.get(a.id), ...a});
    changed = true;
  }
  if (changed) auctionVersion.set((s) => ({v: s.v + 1}));
}
on("marketplace", ({data}) => {
  for (const key of ["auctions", "selling", "bidding", "won"]) rememberAuctions(data?.[key]);
});
// Fiche d'une enchère ({auction, bids}) : bidder_ids, les joueurs qui ont misé (titre de l'onglet)
function rememberAuctionPage(res) {
  if (!res?.auction) return null;
  rememberAuctions([Array.isArray(res.bids) ? {...res.auction, bidder_ids: res.bids.map((b) => b.bidder_id)} : res.auction]);
  return res.auction;
}
on("auction", ({data}) => rememberAuctionPage(data));
export const auctionById = (id) => auctions.get(id) || null;

// Fiche d'une enchère que le site n'a pas (encore) chargée devant nous : lue une fois
const loading = new Map();
export function loadAuction(id) {
  if (!loading.has(id)) loading.set(id, refreshAuction(id).finally(() => setTimeout(() => loading.delete(id), 30000)));
  return loading.get(id);
}

// Relecture d'une enchère, sans cache (titre de l'onglet sur sa page)
export const refreshAuction = (id) => site.auction(id).then(rememberAuctionPage);

export async function refreshBids({withBalance = true} = {}) {
  bidsState.set({loading: true, error: null});
  try {
    const [data, wallet] = await Promise.all([site.marketplaceMine(), withBalance ? site.wikibidous().catch(() => null) : null]);
    setFromResponse(data);
    if (typeof wallet?.balance === "number") bidsState.set({balance: wallet.balance});
  } catch (e) {
    bidsState.set({error: e.message});
  } finally {
    bidsState.set({loading: false});
  }
}

// Mise minimale proposée : un de plus que l'enchère actuelle (le site corrige si besoin avec `min`)
export const nextBid = (a) => (a.current_bid != null ? a.current_bid + 1 : a.base_amount);

// Surenchère : appelée seulement après confirmation du joueur. En cas de mise trop basse,
// renvoie le minimum demandé par le site sans réessayer.
export async function placeBid(auction, amount) {
  try {
    const res = await site.bid(auction.id, amount);
    if (typeof res?.bidder_balance === "number") bidsState.set({balance: res.bidder_balance});
    await refreshBids();
    return {ok: true};
  } catch (e) {
    if (e.code === "bid_too_low" && e.data?.min) return {ok: false, min: e.data.min, error: L(`Mise trop basse : minimum ${e.data.min}.`, `Bid too low: minimum ${e.data.min}.`)};
    // Sans réponse, l'enchère a peut-être été placée : l'état affiché est relu
    if (e.uncertain) refreshBids();
    return {ok: false, error: e.message};
  }
}

// --- Alerte de fin d'enchère (sondage léger, seulement si j'ai des enchères en cours et l'onglet visible)
const alerted = new Set();
let pollTimer = null;
function checkAlerts() {
  const threshold = settings.get().bidAlertMinutes * 60000;
  for (const a of bidsState.get().bidding) {
    const left = msLeft(a);
    if (left > 0 && left < threshold && !mine(a) && !alerted.has(a.id)) {
      alerted.add(a.id);
      emit("bid-alert", a);
    }
  }
}
export function startBidAlerts() {
  bidsState.subscribe(checkAlerts);
  // Le prochain passage est toujours programmé, même si celui-ci échoue
  const tick = async () => {
    try {
      if (isOn("bidAlerts") && readSession() && document.visibilityState === "visible" && bidsState.get().bidding.length) await refreshBids({withBalance: false});
      checkAlerts();
    } catch (e) {
      console.warn("[WikiMasters Toolbox] alertes d'enchères", e);
    } finally {
      pollTimer = setTimeout(tick, bidsState.get().bidding.some((a) => msLeft(a) < 5 * 60000) ? 20000 : 60000);
    }
  };
  // Première lecture : savoir si j'ai des enchères en cours
  setTimeout(async () => {
    if (isOn("bidAlerts") && readSession()) await refreshBids({withBalance: false});
    tick();
  }, 4000);
  return () => clearTimeout(pollTimer);
}

// --- Vendre ou défausser mes doublons
export const sellState = createStore({spares: null, loading: false, error: null, quota: null});

export async function loadSpares() {
  sellState.set({loading: true, error: null});
  try {
    const copies = await loadMyCollection();
    const cards = new Map(copies.map((c) => [c.card_id, c.card]));
    const spares = spareCards(copies).map((s) => ({...s, card: cards.get(s.card_id)}));
    loadPrices(spares.map((s) => ({id: s.card_id, rarity: s.rarity})));
    const quota = await site.marketplaceQuota().catch(() => null);
    sellState.set({spares, quota});
  } catch (e) {
    sellState.set({error: e.message});
  } finally {
    sellState.set({loading: false});
  }
}

// Exemplaire en trop qui serait vendu ou défaussé, et son prix du marché (fiable seulement)
export const spareCopy = (s) => s.rows.find((r) => r.id === s.sellCopyId) || null;
export const spareValue = (s) => priceOf(s.card_id, s.rarity, {shiny: spareCopy(s)?.is_shiny});

// Un exemplaire a quitté la liste des doublons (mis en vente ou défaussé) : la carte est recalculée
// sans lui, pour que l'action suivante vise un autre exemplaire ; elle disparaît s'il n'en reste qu'un.
function dropSpareCopy(cardId, userCardId) {
  sellState.set((s) => ({
    ...s,
    spares: (s.spares || []).flatMap((x) => {
      if (x.card_id !== cardId) return [x];
      const rows = x.rows.flatMap((r) => (r.id !== userCardId ? [r] : r.count > 1 ? [{...r, count: r.count - 1}] : []));
      const [next] = spareCards(rows);
      return next ? [{...x, ...next}] : [];
    }),
  }));
}

// Défausse d'un exemplaire en trop contre 1 WikiBidou, après confirmation du joueur. Sans réponse
// du site, la défausse a peut-être eu lieu : la liste est relue avant toute nouvelle tentative.
export async function discardSpare({userCardId, cardId}) {
  if (!userCardId) throw new Error(L("Exemplaire introuvable : défaussez cette carte depuis votre collection.", "Copy not found: discard this card from your collection."));
  try {
    await discardCopy(userCardId);
  } catch (e) {
    if (e.uncertain) loadSpares();
    throw e;
  }
  dropSpareCopy(cardId, userCardId);
}

// Mise en vente d'un exemplaire. Après confirmation du joueur.
// Sans réponse du site, la vente a peut-être eu lieu : la liste est relue avant toute nouvelle
// tentative, pour ne pas mettre en vente un deuxième exemplaire par erreur.
// userCardId : l'exemplaire mis en vente (user_cards.id) ; cardId : la carte, pour la liste des doublons
export async function sellCard({userCardId, cardId, baseAmount, durationMinutes}) {
  if (!userCardId) throw new Error(L("Exemplaire introuvable : mettez cette carte aux enchères depuis votre collection.", "Copy not found: auction this card from your collection."));
  let res;
  try {
    res = await site.createAuction({userCardId, baseAmount, durationMinutes});
  } catch (e) {
    if (e.uncertain) {
      invalidateCollection();
      loadSpares();
      refreshBids({withBalance: false});
    }
    throw e;
  }
  invalidateCollection();
  dropSpareCopy(cardId, userCardId);
  sellState.set({quota: await site.marketplaceQuota().catch(() => null)});
  return res;
}
