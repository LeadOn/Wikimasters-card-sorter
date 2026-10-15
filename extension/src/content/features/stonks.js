// Page « Stonks » : historique de mes achats et ventes au marché (enchères conclues de la table
// `auctions` où je suis vendeur ou acheteur), plus-value de l'achat-revente et cartes encore en stock.
// Lecture seule : rien n'est écrit. La page s'ouvre par l'entrée « Stonks » du menu du site et
// s'affiche à la place du contenu de la page en cours (adresse terminée par #stonks).
import {fetchAll, restIn} from "../api/supabase";
import {createStore} from "../lib/store";
import {readSession} from "../lib/session";
import {on} from "../lib/bus";
import {loadMyCollection} from "../state/collection";
import {loadPrices} from "../state/prices";
import {ledger, matchTrades} from "../../../../core";

const FIELDS = "id,card_id,snapshot_rarity,final_price,settled_at,is_shiny,seller_id,winner_id";
const CARD_FIELDS = "id,wikipedia_title,category,rarity,image_url,wikipedia_url,hide_image";
// Au-delà, l'historique est relu à l'ouverture de la page
const MAX_AGE = 5 * 60 * 1000;

// ops : opérations appariées (core/stonks.js) ; open : achats pas encore revendus et toujours dans ma
// collection (null pendant la lecture de la collection, false si elle a échoué : openError) ;
// cards : id → carte
export const stonksState = createStore({ops: null, open: null, openError: null, cards: new Map(), loading: false, error: null, at: 0, user: null});

// Achats encore en stock : un achat dont l'exemplaire a quitté la collection hors du marché
// (défausse, échange) n'est plus une position ouverte. Par carte, rareté et version, les plus
// récents sont gardés, dans la limite des exemplaires possédés.
function stillOwned(open, copies) {
  const key = (cardId, rarity, shiny) => `${cardId}|${rarity || ""}|${shiny ? 1 : 0}`;
  const left = new Map();
  for (const c of copies) left.set(key(c.card_id, c.rarity, c.is_shiny), (left.get(key(c.card_id, c.rarity, c.is_shiny)) || 0) + c.count);
  return [...open]
    .sort((a, b) => b.at - a.at)
    .filter((op) => {
      const k = key(op.cardId, op.rarity, op.shiny);
      const n = left.get(k) || 0;
      if (!n) return false;
      left.set(k, n - 1);
      return true;
    });
}

export async function loadStonks({force = false} = {}) {
  const me = readSession()?.userId;
  const s = stonksState.get();
  if (!me || s.loading) return;
  if (!force && s.ops && s.user === me && Date.now() - s.at < MAX_AGE) return;
  stonksState.set({loading: true, error: null});
  try {
    // Deux lectures (vendeur, acheteur) triées sur une clé unique : pagination stable
    const read = (column) => fetchAll(`auctions?select=${FIELDS}&status=eq.settled_sold&${column}=eq.${me}&order=settled_at.desc,id.asc`, {key: "id"});
    const [sold, bought] = await Promise.all([read("seller_id"), read("winner_id")]);
    const {ops, open} = matchTrades(ledger([...sold, ...bought], me));
    const cards = new Map(stonksState.get().cards);
    const missing = [...new Set(ops.map((op) => op.cardId))].filter((id) => !cards.has(id));
    for (const c of await restIn(`cards?select=${CARD_FIELDS}`, "id", missing, {retries: 3})) cards.set(c.id, {...c, image_url: c.hide_image ? null : c.image_url});
    stonksState.set({ops, open: null, cards, at: Date.now(), user: me});
    // Positions ouvertes : selon ma collection, puis valorisées au prix du marché
    let copies;
    try {
      copies = await loadMyCollection();
    } catch (e) {
      stonksState.set({open: false, openError: e.message});
      return;
    }
    const held = stillOwned(open, copies);
    stonksState.set({open: held, openError: null});
    loadPrices(held.map((op) => ({id: op.cardId, rarity: op.rarity})));
  } catch (e) {
    stonksState.set({error: e.message});
  } finally {
    stonksState.set({loading: false});
  }
}

// Une enchère conclue depuis (achat, vente) : l'historique est relu à la prochaine ouverture
on("marketplace", ({path}) => path.includes("mine=1") && stonksState.set({at: 0}));

// --- Ouverture de la page
// Ouverte par l'entrée du menu : #stonks est ajouté à l'adresse de la page en cours (le site n'a pas
// de route pour elle), ce qui sert au bouton Retour et au rechargement. Elle est ouverte tant que
// l'adresse se termine par #stonks : Retour, ou un lien du site (même vers la page en cours), la ferme.
const HASH = "#stonks";
export const stonksPage = createStore({open: false});
export const isStonksOpen = () => stonksPage.get().open && location.hash === HASH;

export function openStonks() {
  if (location.hash !== HASH) history.pushState(null, "", HASH);
  stonksPage.set({open: true});
}

// Fermeture par un lien du site : l'adresse perd #stonks (le site ne navigue pas vers la page
// où l'on est déjà, son lien n'aurait sinon aucun effet)
export function closeStonks() {
  if (location.hash === HASH) history.replaceState(history.state, "", location.pathname + location.search);
  stonksPage.set({open: false});
}

export function startStonksRoute() {
  const sync = () => stonksPage.get().open !== (location.hash === HASH) && stonksPage.set({open: location.hash === HASH});
  addEventListener("popstate", sync);
  addEventListener("hashchange", sync);
  // Navigation du site (pushState, sans événement) : vue au changement d'adresse
  on("route", sync);
  sync();
}
