// Réglages de la Toolbox : un interrupteur par fonctionnalité, thèmes de tri, couleur de Doublon.
import {persistentStore} from "../lib/storage";
import {PRICE_DEFAULTS} from "../../../../core/prices";
import {DOUBLON} from "../../../../core/themes";
import {resolveThemes, storeThemes, applyTagColors} from "../../../../core/theme-set";

export const FEATURES = [
  {key: "cardStyle", group: "Cartes", label: "Nouvel affichage des cartes", help: "Image sur toute la carte, cadre aux couleurs de la rareté, titre et statistiques en surimpression. Désactivez pour retrouver l'affichage du site."},
  {key: "themeBadges", group: "Cartes", label: "Pastille du thème", help: "Affiche le thème calculé par le moteur sur les cartes du marché, des amis et du catalogue."},
  {key: "priceBadges", group: "Cartes", label: "Prix du marché", help: "Affiche le prix du marché (pour la rareté de la carte) quand il est connu ; « ≈ » : trop peu de ventes pour qu'il soit fiable."},
  {key: "wikiLink", group: "Cartes", label: "Lien Wikipédia", help: "Ajoute un bouton « W » qui ouvre l'article."},
  {key: "ownedBadges", group: "Cartes", label: "Possédée / manquante", help: "Signale, hors de votre collection, les cartes que vous avez déjà."},
  {key: "missingImages", group: "Cartes", label: "Images manquantes", help: "Cherche une image sur Wikimedia (Wikipédia, Wikidata, Commons) pour les cartes qui n'en ont pas. Requêtes anonymes, sans cookie ; jamais pour une image masquée par le site."},
  {key: "collectionBar", group: "Pages du site", label: "Barre Toolbox sur la collection", help: "Sous les filtres de la page Collection : trier les nouvelles cartes sur place, n'afficher que les cartes sans image ou en GIF, accès aux doublons et aux prix."},
  {key: "cardInsight", group: "Pages du site", label: "Infos dans la fiche d'une carte", help: "Dans la fenêtre d'une carte : prix du marché, thème, amis intéressés, ajout à une famille."},
  {key: "auctionInsight", group: "Pages du site", label: "Analyse des enchères", help: "Sur la page d'une enchère : prix du marché, écart avec la mise, carte déjà possédée ou non, amis intéressés."},
  {key: "auctionTab", group: "Pages du site", label: "Enchère dans le titre de l'onglet", help: "Sur la page d'une enchère, le titre de l'onglet indique le temps restant, si vous êtes en tête (✓) ou surenchéri (✗) et la mise actuelle ; il clignote quand quelqu'un surenchérit pendant que vous êtes sur un autre onglet."},
  {key: "dealBadges", group: "Pages du site", label: "Bonnes affaires du marché", help: "Signale sur le marché les enchères nettement sous le prix du marché (ou très au-dessus)."},
  {key: "friendTrades", group: "Pages du site", label: "Échanges sur le profil d'un ami", help: "Sur le profil d'un joueur : cherche ses cartes qui vous intéressent et les vôtres qui l'intéressent."},
  {key: "packRecap", group: "Paquets", label: "Récapitulatif après un paquet", help: "Bloc dans la page Paquets, affiché après la dernière carte révélée : nouveautés, doublons, prix du marché et valeur totale."},
  {key: "pullStats", group: "Paquets", label: "Statistiques de tirage", help: "Compte les raretés obtenues et affiche les taux de drop sur la page Paquets."},
  {key: "openAll", group: "Paquets", label: "Bouton « Tout ouvrir »", help: "Sur la page Paquets : ouvre tous les paquets disponibles sans animation, après confirmation."},
  {key: "autoSortPulls", group: "Paquets", label: "Trier automatiquement les cartes tirées", help: "Dès l'ouverture d'un paquet, ajoute aux cartes tirées leur thème, les étiquettes « Pour : … » et Doublon. Seuls les nouveaux exemplaires sont touchés, rien n'est supprimé."},
  {key: "sortAfterPack", group: "Paquets", label: "Proposer de trier après un paquet", help: "Sans tri automatique : bouton pour classer les nouvelles cartes depuis le récapitulatif."},
  {key: "tradeRecap", group: "Échanges", label: "Bilan dans la fenêtre d'échange", help: "Dans la fenêtre « Échanger avec … » du site : valeur au prix du marché de ce que vous donnez et de ce que vous recevez (WikiBidous compris), et la différence."},
  {key: "tradeValues", group: "Échanges", label: "Valeur des échanges", help: "Prix du marché de chaque carte et total de chaque côté des échanges en cours."},
  {key: "bidAlerts", group: "Marché", label: "Alerte de fin d'enchère", help: "Prévient quand une enchère où vous êtes dépassé se termine bientôt."},
  {key: "stonks", group: "Marché", label: "Page Stonks", help: "Entrée « Stonks » dans le menu du site : vos achats et ventes au marché par jour, semaine ou mois, et la plus-value de l'achat-revente. Historique seulement."},
  {key: "notificationSound", group: "Confort", label: "Son de notification", help: "Joue un son discret quand une nouvelle notification arrive."},
];

const OFF_BY_DEFAULT = new Set(["missingImages", "notificationSound", "autoSortPulls"]);

export const DEFAULT_SETTINGS = {
  features: Object.fromEntries(FEATURES.map((f) => [f.key, !OFF_BY_DEFAULT.has(f.key)])),
  // Thèmes de tri modifiés par le joueur (différences avec core/themes.js, voir core/theme-set.js) ; null : par défaut
  themes: null,
  // Couleur de l'étiquette Doublon (celles des thèmes sont dans `themes`)
  themeColors: {},
  priceMaxAgeHours: 48,
  // Prix du marché : ventes nécessaires pour qu'il soit fiable, premières ventes de la carte ignorées
  minSales: PRICE_DEFAULTS.minSales,
  skipFirstSales: PRICE_DEFAULTS.skipFirst,
  bidAlertMinutes: 2,
};

// Couleurs de thèmes choisies avant l'éditeur de thèmes (v1.4) : reprises dans la liste des thèmes.
function migrateThemeColors(saved) {
  const themeColors = {...(saved.themeColors || {})};
  const legacy = Object.keys(themeColors).filter((name) => name !== DOUBLON);
  if (!legacy.length) return {themes: saved.themes || null, themeColors};
  const themes = storeThemes(applyTagColors(resolveThemes(saved.themes), themeColors), saved.themes || null);
  for (const name of legacy) delete themeColors[name];
  return {themes, themeColors};
}

export const settings = persistentStore("settings", DEFAULT_SETTINGS, {
  merge: (saved) => ({
    ...DEFAULT_SETTINGS,
    ...saved,
    features: {...DEFAULT_SETTINGS.features, ...(saved.features || {})},
    ...migrateThemeColors(saved),
  }),
});

export const isOn = (key) => settings.get().features[key] !== false;
