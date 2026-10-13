// Ma collection vue par la Toolbox : toutes les cartes, doublons, sans image, GIF ou jamais vendues
// (d'après les prix chargés), lues sur toute la collection et non sur la page de 50 cartes du site.
// Liste de la barre de la page Collection (qui remplace alors la grille du site) et de l'onglet
// « Prix ». Les cartes se mettent aux enchères ou se défaussent une à une ou par lot, toujours sur
// clic du joueur après confirmation ; l'exemplaire traité quitte la liste sans relire la collection.
import {createStore} from "../lib/store";
import {on} from "../lib/bus";
import {loadMyCollection, discardCopy} from "../state/collection";
import {priceMap} from "../state/prices";
import {sellCard} from "./market";
import {imageKind} from "./card-images";
import {freeCopy, groupCopies, unsoldCopies, rarityRank} from "../../../../core";

export const VIEWS = [
  {id: "all", label: "Toutes"},
  {id: "doubles", label: "Doublons"},
  {id: "none", label: "Sans image"},
  {id: "gif", label: "GIF"},
  {id: "unsold", label: "Jamais vendues"},
];

// Vue choisie sur la page Collection (la grille du site est alors masquée), null : grille du site
export const collectionView = createStore({view: null});

// copies : exemplaires de ma collection (instantané, mis à jour après chaque action) ;
// anyRarity : « jamais vendues » dans aucune rareté (sinon : dans la rareté de l'exemplaire)
export const cardsState = createStore({copies: null, loading: false, progress: 0, error: null, anyRarity: true});

export const LOCKED = "Tous vos exemplaires sont en favori : le site les verrouille.";

export async function loadCards({force = false} = {}) {
  if (cardsState.get().loading) return;
  cardsState.set({loading: true, progress: 0, error: null});
  try {
    const copies = await loadMyCollection({force, onProgress: (progress) => cardsState.set({progress})});
    cardsState.set({copies, loading: false});
  } catch (e) {
    cardsState.set({loading: false, error: e?.message || String(e)});
  }
}

export function setCollectionView(view) {
  if (collectionView.get().view !== view) collectionView.set({view});
}

// Cartes de chaque vue : {all, doubles, none, gif, never, inRarity, unknown}. Groupes carte + rareté
// (core.groupCopies), les plus rares d'abord. never / inRarity : jamais vendues dans aucune rareté /
// dans la rareté de l'exemplaire ; unknown : nombre de groupes dont les ventes n'ont pas été lues.
// Calculé une fois par instantané et par état des prix (priceVersion).
let memo = {};
export function viewGroups(copies, priceVersion) {
  if (memo.copies === copies && memo.v === priceVersion) return memo.views;
  const all = groupCopies(copies || []).sort(byRarityThenTitle);
  const owned = copiesByCard(copies || []);
  const prices = priceMap();
  const {unsold: inRarity, unknown} = unsoldCopies(all, prices);
  const views = {
    all,
    doubles: all.filter((g) => owned.get(g.card_id) > 1),
    none: all.filter((g) => imageKind(g.card) === "none"),
    gif: all.filter((g) => imageKind(g.card) === "gif"),
    never: unsoldCopies(inRarity, prices, {anyRarity: true}).unsold,
    inRarity,
    unknown: unknown.length,
  };
  memo = {copies, v: priceVersion, views};
  return views;
}

// Groupes d'une vue (« Jamais vendues » : selon la portée choisie)
export const groupsOf = (views, view, anyRarity) => (view === "unsold" ? (anyRarity ? views.never : views.inRarity) : views[view]) || [];

const byRarityThenTitle = (a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || (a.card?.wikipedia_title || "").localeCompare(b.card?.wikipedia_title || "", "fr");

// Exemplaires de chaque carte, toutes raretés confondues
export function copiesByCard(copies) {
  const m = new Map();
  for (const c of copies) m.set(c.card_id, (m.get(c.card_id) || 0) + Math.max(1, Number(c.count) || 1));
  return m;
}

// Vue « Doublons » : on garde toujours un exemplaire de chaque carte. Les groupes cochés au-delà
// (plusieurs raretés d'une carte en deux exemplaires) sont écartés avant toute confirmation.
// → {groups: ceux qui seront traités, skipped: nombre d'écartés}
export function keepOnePerCard(groups, copies) {
  const left = copiesByCard(copies);
  const kept = [];
  for (const g of groups) {
    if (left.get(g.card_id) > 1) {
      kept.push(g);
      left.set(g.card_id, left.get(g.card_id) - 1);
    }
  }
  return {groups: kept, skipped: groups.length - kept.length};
}

// Un exemplaire a quitté la collection, ou est en réserve pendant son enchère : retiré de la liste
// (sans modifier la collection en cache, partagée avec le reste de la Toolbox)
function dropCopy(userCardId) {
  const copies = cardsState.get().copies;
  if (!copies?.some((c) => c.id === userCardId)) return;
  cardsState.set({copies: copies.flatMap((c) => (c.id !== userCardId ? [c] : c.count > 1 ? [{...c, count: c.count - 1}] : []))});
}

// Défausses et mises en vente faites avec les boutons du site (fenêtre d'une carte)
on("copy-discarded", ({match}) => dropCopy(decodeURIComponent(match[1])));
on("marketplace", ({method, path, request}) => method === "POST" && path === "/api/marketplace" && request?.card_id && dropCopy(request.card_id));

// Après une écriture restée sans réponse, elle a peut-être eu lieu : la collection est relue avant
// toute nouvelle action, jamais l'écriture rejouée
const recheck = (e) => e.uncertain && loadCards({force: true});

// Exemplaire visé par une action sur un groupe (core.groupCopies), vérifié sur l'instantané à jour.
// keepOne : jamais le dernier exemplaire de la carte (vue « Doublons »).
function target(group, keepOne) {
  const copies = cardsState.get().copies || [];
  const copy = freeCopy(copies.filter((c) => c.card_id === group.card_id && c.rarity === group.rarity));
  if (!copy) throw new Error(LOCKED);
  if (keepOne && copiesByCard(copies).get(group.card_id) < 2) throw new Error(`Dernier exemplaire de « ${group.card?.wikipedia_title || "cette carte"} » : il est conservé.`);
  return copy;
}

// Défausse d'un exemplaire du groupe contre 1 WikiBidou
export async function discardGroup(group, {keepOne = false} = {}) {
  const copy = target(group, keepOne);
  try {
    await discardCopy(copy.id);
  } catch (e) {
    recheck(e);
    throw e;
  }
  dropCopy(copy.id);
}

// Mise aux enchères d'un exemplaire du groupe
export async function sellGroup(group, {baseAmount, durationMinutes, keepOne = false}) {
  const copy = target(group, keepOne);
  try {
    await sellCard({userCardId: copy.id, cardId: group.card_id, baseAmount, durationMinutes});
  } catch (e) {
    recheck(e);
    throw e;
  }
  dropCopy(copy.id);
}

// Exemplaire que viserait une action, pour la fenêtre de mise en vente d'une carte (null : aucun)
export function copyFor(group, {keepOne = false} = {}) {
  try {
    return target(group, keepOne);
  } catch {
    return null;
  }
}

// Résultat de la fenêtre de mise aux enchères d'une carte (ui/SellDialog.jsx)
export function afterSell(userCardId, sale) {
  if (sale?.uncertain) loadCards({force: true});
  else if (sale) dropCopy(userCardId);
}

// Actions groupées : une carte après l'autre (un exemplaire de chacune), arrêt à la première erreur
// (refus du site, vérification anti-robot, absence de réponse) ou à l'annulation (signal).
// onProgress(n) après chaque carte ; l'erreur porte le nombre de cartes déjà traitées (e.done).
async function each(groups, action, {signal, onProgress} = {}) {
  let done = 0;
  for (const group of groups) {
    if (signal?.aborted) break;
    try {
      await action(group);
    } catch (e) {
      e.done = done;
      throw e;
    }
    done++;
    onProgress?.(done);
  }
  return done;
}

export const discardGroups = (groups, {keepOne = false, ...options} = {}) => each(groups, (g) => discardGroup(g, {keepOne}), options);

// Mise aux enchères des cartes cochées, avec la même mise de départ et la même durée
export const sellGroups = (groups, {baseAmount, durationMinutes, keepOne = false}, options) =>
  each(groups, (g) => sellGroup(g, {baseAmount, durationMinutes, keepOne}), options);
