// Titre de l'onglet sur la page d'une enchère : temps restant, position du joueur (en tête,
// surenchéri) et mise actuelle. Le site ne relit pas l'enchère de lui-même : elle est relue ici,
// plus souvent à l'approche de la fin. Lecture seule.
import {readSession} from "../lib/session";
import {isOn} from "../state/settings";
import {auctionById, refreshAuction, msLeft, bidsState} from "./market";

const AUCTION_PATH = /^\/marketplace\/([0-9a-f-]{36})\/?$/;
const fmt = (n) => n.toLocaleString("fr-FR");

// Temps restant compact : 4:07, 1 h 05
export function clock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s >= 3600) return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Position du joueur : seller (sa propre vente), leading, outbid (a misé, un autre est en tête), null
export function standing(a, {me, participated}) {
  if (!me) return null;
  if (a.seller_id === me) return "seller";
  if (a.current_bidder_id === me) return "leading";
  return participated ? "outbid" : null;
}

// Titre de l'onglet. alert : surenchère pas encore vue ("outbid" ou "bid"), affichée une seconde
// sur deux (flash) ; le symbole en tête reste visible même dans un onglet étroit.
export function tabTitle(a, {me, participated = false, alert = null, flash = false, now = Date.now()}) {
  const name = a.card?.wikipedia_title || "Enchère";
  const pos = standing(a, {me, participated});
  const left = new Date(a.end_at).getTime() - now;
  if (a.status && a.status !== "active") {
    if (a.winner_id && a.winner_id === me) return `✓ Gagnée · ${fmt(a.final_price ?? a.current_bid)} ₩ — ${name}`;
    if (pos === "outbid") return `✗ Perdue — ${name}`;
    return `Terminée — ${name}`;
  }
  if (left <= 0) return `${pos === "leading" ? "✓ " : pos === "outbid" ? "✗ " : ""}Fin… — ${name}`;
  if (flash && alert === "outbid") return `✗ SURENCHÉRI ! — ${name}`;
  if (flash && alert === "bid") return `↑ NOUVELLE MISE — ${name}`;
  const amount = `${fmt(a.current_bid ?? a.base_amount)} ₩`;
  if (pos === "leading") return `✓ ${clock(left)} · En tête · ${amount} — ${name}`;
  if (pos === "outbid") return `✗ ${clock(left)} · Surenchéri · ${amount} — ${name}`;
  const mark = alert ? "↑ " : "";
  if (pos === "seller") return `${mark}${clock(left)} · ${a.current_bid != null ? amount : "aucune mise"} (votre vente) — ${name}`;
  return `${mark}${clock(left)} · ${amount} — ${name}`;
}

// Surenchère survenue entre deux lectures : "outbid" si le joueur a perdu la tête (ou reste
// dépassé par une nouvelle mise), "bid" pour une nouvelle mise d'un autre joueur, sinon null
export function newAlert(prev, a, {me, participated}) {
  if (!prev || a.current_bid == null || a.current_bid === prev.bid) return null;
  if (a.current_bidder_id === me) return null;
  return standing(a, {me, participated}) === "outbid" ? "outbid" : "bid";
}

// Délai avant la prochaine lecture : plus court à l'approche de la fin
const pollDelay = (left) => (left > 10 * 60000 ? 30000 : left > 2 * 60000 ? 15000 : 5000);

let current = null; // {id, prev: {bid}, wasLeading, alert, seenAt, nextPoll, polling}
let baseTitle = null; // titre du site, rendu en quittant la page
let lastSet = null;

function setTitle(title) {
  // Le site a changé le titre entre-temps : c'est le nouveau titre à rendre en partant
  if (document.title !== lastSet) baseTitle = document.title;
  if (document.title !== title) document.title = title;
  lastSet = title;
}

function restoreTitle() {
  if (lastSet != null && document.title === lastSet && baseTitle != null) document.title = baseTitle;
  lastSet = null;
  current = null;
}

function poll(state) {
  state.polling = true;
  refreshAuction(state.id)
    .catch(() => null)
    .finally(() => {
      state.polling = false;
      const a = auctionById(state.id);
      state.nextPoll = Date.now() + (a?.end_at ? pollDelay(msLeft(a)) : 15000);
    });
}

function tick() {
  const id = isOn("auctionTab") ? AUCTION_PATH.exec(location.pathname)?.[1] : null;
  if (!id) return current && restoreTitle();
  if (current?.id !== id) current = {id, prev: null, wasLeading: false, alert: null, seenAt: null, nextPoll: 0, polling: false};
  const state = current;
  const now = Date.now();
  const a = auctionById(id);
  // Relecture : tant que l'enchère n'est pas réglée (une fois la fin passée, pour connaître le gagnant)
  if (!state.polling && now >= state.nextPoll && (!a || !a.status || a.status === "active")) poll(state);
  if (!a?.end_at) return;

  const me = readSession()?.userId || null;
  if (a.current_bidder_id && a.current_bidder_id === me) state.wasLeading = true;
  const participated = state.wasLeading || Boolean(me && a.bidder_ids?.includes(me)) || bidsState.get().bidding.some((b) => b.id === id);
  const alert = newAlert(state.prev, a, {me, participated});
  if (alert) {
    state.alert = alert;
    state.seenAt = null;
  }
  state.prev = {bid: a.current_bid};
  if (a.current_bidder_id === me) state.alert = null;
  // Alerte vue : page visible et active depuis 3 s
  if (state.alert && document.visibilityState === "visible" && document.hasFocus()) {
    state.seenAt ??= now;
    if (now - state.seenAt > 3000) state.alert = null;
  } else state.seenAt = null;

  setTitle(tabTitle(a, {me, participated, alert: state.alert, flash: Math.floor(now / 1000) % 2 === 0, now}));
}

export function startAuctionTab() {
  setInterval(tick, 1000);
  // De retour sur l'onglet : relecture immédiate
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && current) current.nextPoll = 0;
  });
  tick();
}
