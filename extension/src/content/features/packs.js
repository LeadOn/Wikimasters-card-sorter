// Paquets : récapitulatif, statistiques de tirage et « Tout ouvrir » (sur clic, après confirmation).
import {site} from "../api/site";
import {restIn} from "../api/supabase";
import {withLock} from "../lib/locks";
import {createStore} from "../lib/store";
import {persistentStore} from "../lib/storage";
import {on, emit} from "../lib/bus";
import {sleep, HumanCheckError} from "../lib/http";
import {isOn} from "../state/settings";
import {owned, addOwned, removeOwned, invalidateCollection} from "../state/collection";
import {loadPrices} from "../state/prices";
import {packNovelty} from "../../../../core/prices";
import {sortPulledCards} from "./autosort";

export const packsStatus = createStore({remaining: null, at: 0});
// Récapitulatif du dernier paquet, affiché dans la page (pas de fenêtre) :
// phase "revealing" : le site révèle les cartes une à une, le récapitulatif attend la dernière ;
// phase "ready"     : toutes les cartes ont été vues (ou paquets ouverts sans animation).
// source "reveal" : paquet ouvert sur le site (le récapitulatif disparaît au retour sur l'accueil) ;
// source "openAll" : « Tout ouvrir », sans révélation (il reste sur l'accueil jusqu'au paquet suivant).
// sort : tri automatique des cartes tirées (option) — {status: "running"|"done"|"error", byIndex, error}
// cards[i].action : ce que le joueur en a fait depuis le récapitulatif — {kind: "discarded"},
// {kind: "listed", baseAmount, durationMinutes}, ou {kind: "uncertain", what: "discard"|"sell"} (sans réponse du site)
export const recapState = createStore({cards: [], packs: 0, at: 0, phase: null, source: null, pricesLoading: false, dismissed: false, sort: null});

// Répartition des raretés de toute ma collection (/api/my-collection/stats), pour le graphique des taux
export const collectionRarity = persistentStore("collectionRarity", {counts: {}, total: 0, at: 0});
const setCollectionRarity = (data) =>
  data?.rarityCounts && Object.keys(data.rarityCounts).length && collectionRarity.set({counts: data.rarityCounts, total: Number(data.total) || 0, at: Date.now()});
on("my-collection-stats", ({data}) => setCollectionRarity(data));
// Relue au plus toutes les 30 min ; en cas d'échec (route souvent lente ou en erreur), nouvel essai après 2 min
let lastRarityAttempt = 0;
export async function refreshCollectionRarity() {
  if (Date.now() - collectionRarity.get().at < 30 * 60 * 1000 || Date.now() - lastRarityAttempt < 2 * 60 * 1000) return;
  lastRarityAttempt = Date.now();
  try {
    setCollectionRarity(await site.myCollectionStats());
  } catch {}
}
export const openAllState = createStore({running: false, opened: 0, error: null});
export const pullStats = persistentStore("pullStats", {since: Date.now(), packs: 0, cards: 0, byRarity: {}});

on("packs-status", ({data}) => typeof data?.packs_remaining === "number" && packsStatus.set({remaining: data.packs_remaining, at: Date.now()}));

// Cartes d'un paquet → statistiques, récapitulatif, proposition de tri
function handleOpened(cards, {packs = 1, wasOwned, revealing = false}) {
  if (isOn("pullStats")) {
    pullStats.set((s) => {
      const byRarity = {...s.byRarity};
      for (const c of cards) byRarity[c.rarity] = (byRarity[c.rarity] || 0) + 1;
      return {...s, packs: s.packs + packs, cards: s.cards + cards.length, byRarity};
    });
  }
  // Sans collection connue (jamais chargée), on ne sait pas quelles cartes sont nouvelles
  const known = owned.get().loadedAt > 0;
  const enriched = cards.map((c) => ({...c, isNew: known ? !wasOwned.has(c.id) : null}));
  const at = Date.now();
  const autoSort = isOn("autoSortPulls");
  recapState.set({cards: enriched, packs, at, phase: revealing ? "revealing" : "ready", source: revealing ? "reveal" : "openAll", pricesLoading: true, dismissed: false, sort: autoSort ? {status: "running"} : null});
  // Tri automatique pendant la révélation : seuls les exemplaires tirés sont classés
  if (autoSort)
    sortPulledCards(cards)
      .then((res) => recapState.get().at === at && recapState.set({sort: {status: "done", byIndex: res.byIndex}}))
      .catch((e) => recapState.get().at === at && recapState.set({sort: {status: "error", error: e.message || String(e)}}));
  markNovelty(at, cards);
  // Prix chargés tout de suite, pendant que le joueur découvre ses cartes
  loadPrices(cards.map((c) => ({id: c.id, rarity: c.rarity}))).finally(() => {
    if (recapState.get().at === at) recapState.set({pricesLoading: false});
  });
  emit("cards-added", {count: cards.length, recap: isOn("packRecap"), sorted: autoSort});
}

// Nouveautés exactes : une carte est un doublon si je possède plus d'exemplaires que le paquet
// n'en apporte (une requête pour tout le paquet, la collection en mémoire peut être absente ou ancienne).
async function markNovelty(at, cards) {
  try {
    const rows = await restIn("user_cards?select=card_id,count", "card_id", cards.map((c) => c.id), {retries: 3});
    const copies = new Map();
    for (const r of rows) copies.set(r.card_id, (copies.get(r.card_id) || 0) + Math.max(1, Number(r.count) || 1));
    const novelty = packNovelty(cards, copies);
    const updated = cards.map((c, i) => ({...c, isNew: novelty[i]}));
    if (recapState.get().at === at) recapState.set({cards: updated});
  } catch {
    // Sans réponse, on garde l'estimation faite avec la collection en mémoire
  }
}

// --- Actions sur une carte du récapitulatif, déclenchées par un clic du joueur après confirmation.
// at : identifiant du récapitulatif, pour ne pas modifier celui d'un paquet ouvert entre-temps.
function setCardAction(at, index, action) {
  if (recapState.get().at !== at) return;
  recapState.set((s) => ({...s, cards: s.cards.map((c, i) => (i === index ? {...c, action} : c))}));
}

// Défausse l'exemplaire tiré contre 1 WikiBidou. Sous le verrou du tri : si le tri automatique des
// cartes tirées est en cours, la défausse attend qu'il ait fini d'étiqueter cet exemplaire.
export async function discardPulled(at, index) {
  const card = recapState.get().cards[index];
  if (!card?.user_card_id) throw new Error("Exemplaire introuvable : défaussez cette carte depuis votre collection.");
  await withLock(
    "sort",
    async () => {
      try {
        await site.discard(card.user_card_id);
      } catch (e) {
        if (e.uncertain) {
          invalidateCollection();
          setCardAction(at, index, {kind: "uncertain", what: "discard"});
        }
        throw e;
      }
    },
    {wait: true},
  );
  invalidateCollection();
  setCardAction(at, index, {kind: "discarded"});
  // Le site met à jour le solde de WikiBidous affiché quand il reçoit cet événement
  window.dispatchEvent(new CustomEvent("wikimasters:wikibidous-balance-refresh"));
  const otherCopy = recapState.get().cards.some((c, i) => i !== index && c.id === card.id && c.action?.kind !== "discarded");
  if (card.isNew === true && !otherCopy) removeOwned([card.id]);
}

// Résultat de la fenêtre de mise aux enchères (ui/SellDialog.jsx)
export const markListed = (at, index, sale) => sale && setCardAction(at, index, sale.uncertain ? {kind: "uncertain", what: "sell"} : {kind: "listed", ...sale});

// Le site a fini de révéler les cartes (bouton « Continuer ») : le récapitulatif peut s'afficher
export const markRevealed = () => recapState.get().phase === "revealing" && recapState.set({phase: "ready"});
export const dismissRecap = () => recapState.set({dismissed: true});

// Paquet ouvert par le joueur sur le site (réponse observée)
on("pack-opened", ({data, method}) => {
  if (method !== "POST" || !Array.isArray(data?.cards) || !data.cards.length) return;
  if (typeof data.packs_remaining === "number") packsStatus.set({remaining: data.packs_remaining, at: Date.now()});
  if (openAllState.get().running) return;
  const wasOwned = new Set(owned.get().ids);
  addOwned(data.cards.map((c) => c.id));
  // Le site anime l'ouverture : le récapitulatif attend la dernière carte
  handleOpened(data.cards, {wasOwned, revealing: true});
});

// Ouvre tous les paquets disponibles, un par un, et s'arrête à la première erreur
// (dont une vérification anti-robot demandée par le site, à faire par le joueur).
export async function openAllPacks() {
  return withLock("packs", async () => {
    openAllState.set({running: true, opened: 0, error: null});
    const wasOwned = new Set(owned.get().ids);
    const all = [];
    let packs = 0;
    try {
      for (let guard = 0; guard < 100; guard++) {
        const res = await site.openPack();
        // Réponse sans cartes (erreur rendue en 200, format changé) : on s'arrête sans rien supposer
        if (!Array.isArray(res?.cards) || !res.cards.length) throw new Error(res?.error ? String(res.error) : "réponse du site sans cartes");
        packs++;
        all.push(...res.cards);
        openAllState.set({opened: packs});
        if (typeof res.packs_remaining === "number") packsStatus.set({remaining: res.packs_remaining, at: Date.now()});
        if (!res.packs_remaining) break;
        await sleep(1200);
      }
    } catch (e) {
      openAllState.set({error: e instanceof HumanCheckError ? e.message : `Arrêt après ${packs} paquet(s) : ${e.message}`});
    } finally {
      openAllState.set({running: false});
      if (all.length) {
        // Ces ouvertures ne passent pas par la page : la collection en mémoire n'est plus à jour
        invalidateCollection();
        addOwned(all.map((c) => c.id));
        handleOpened(all, {packs, wasOwned});
      }
    }
    return {packs, cards: all.length};
  });
}

export const resetPullStats = () => pullStats.set({since: Date.now(), packs: 0, cards: 0, byRarity: {}});
