// Marché : mes enchères (suivi, surenchère, alerte de fin) et vente de mes doublons.
import {site} from "../api/site";
import {createStore} from "../lib/store";
import {readSession} from "../lib/session";
import {on, emit} from "../lib/bus";
import {settings, isOn} from "../state/settings";
import {loadMyCollection, invalidateCollection} from "../state/collection";
import {priceOf, loadPrices} from "../state/prices";
import {spareCards} from "../../../../core";

export const bidsState = createStore({selling: [], bidding: [], won: [], loading: false, error: null, at: 0, balance: null});

const mine = (a) => a.current_bidder_id && a.current_bidder_id === readSession()?.userId;
export const isLeading = mine;
export const msLeft = (a) => new Date(a.end_at).getTime() - Date.now();

function setFromResponse(data) {
  if (!data || !("bidding" in data || "selling" in data)) return;
  bidsState.set({
    selling: data.selling ?? bidsState.get().selling,
    bidding: (data.bidding ?? bidsState.get().bidding).filter((a) => !a.status || a.status === "active"),
    won: data.won ?? bidsState.get().won,
    at: Date.now(),
  });
}
on("marketplace", ({data, path}) => path.includes("mine=1") && setFromResponse(data));
on("wikibidous", ({data}) => typeof data?.balance === "number" && bidsState.set({balance: data.balance}));

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
    if (e.code === "bid_too_low" && e.data?.min) return {ok: false, min: e.data.min, error: `Mise trop basse : minimum ${e.data.min}.`};
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
  const tick = async () => {
    if (isOn("bidAlerts") && document.visibilityState === "visible" && bidsState.get().bidding.length) await refreshBids({withBalance: false});
    checkAlerts();
    pollTimer = setTimeout(tick, bidsState.get().bidding.some((a) => msLeft(a) < 5 * 60000) ? 20000 : 60000);
  };
  // Première lecture : savoir si j'ai des enchères en cours
  setTimeout(async () => {
    if (isOn("bidAlerts")) await refreshBids({withBalance: false});
    tick();
  }, 4000);
  return () => clearTimeout(pollTimer);
}

// --- Vendre mes doublons
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

export const spareValue = (s) => priceOf(s.card_id, s.rarity);

// Mise en vente d'un exemplaire (le site choisit l'exemplaire). Après confirmation du joueur.
export async function sellCard({cardId, baseAmount, durationMinutes}) {
  const res = await site.createAuction({cardId, baseAmount, durationMinutes});
  invalidateCollection();
  const quota = await site.marketplaceQuota().catch(() => null);
  sellState.set((s) => ({
    ...s,
    quota,
    spares: (s.spares || []).map((x) => (x.card_id === cardId ? {...x, spare: x.spare - 1, listed: (x.listed || 0) + 1} : x)).filter((x) => x.spare > 0),
  }));
  return res;
}
