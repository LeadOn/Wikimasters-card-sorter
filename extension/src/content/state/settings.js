// Réglages de la Toolbox : un interrupteur par fonctionnalité, thèmes de tri, couleur de Doublon.
import {persistentStore} from "../lib/storage";
import {PRICE_DEFAULTS} from "../../../../core/prices";
import {DOUBLON} from "../../../../core/themes";
import {resolveThemes, storeThemes, applyTagColors} from "../../../../core/theme-set";
import {L} from "../../shared/i18n";

export const FEATURES = [
  {key: "cardStyle", group: L("Cartes", "Cards"), label: L("Nouvel affichage des cartes", "New card display"), help: L("Image sur toute la carte, cadre aux couleurs de la rareté, titre et statistiques en surimpression. Désactivez pour retrouver l'affichage du site.", "Full-card image, rarity-colored frame, title and stats overlaid. Turn off to get the site's display back.")},
  {key: "themeBadges", group: L("Cartes", "Cards"), label: L("Pastille du thème", "Theme badge"), help: L("Affiche le thème calculé par le moteur sur les cartes du marché, des amis et du catalogue.", "Shows the theme computed by the engine on market, friend and catalog cards.")},
  {key: "priceBadges", group: L("Cartes", "Cards"), label: L("Prix du marché", "Market price"), help: L("Affiche le prix du marché (pour la rareté de la carte) quand il est connu ; « ≈ » : trop peu de ventes pour qu'il soit fiable.", "Shows the market price (for the card's rarity) when known; \"≈\": too few sales for it to be reliable.")},
  {key: "wikiLink", group: L("Cartes", "Cards"), label: L("Lien Wikipédia", "Wikipedia link"), help: L("Ajoute un bouton « W » qui ouvre l'article.", "Adds a \"W\" button that opens the article.")},
  {key: "ownedBadges", group: L("Cartes", "Cards"), label: L("Possédée / manquante", "Owned / missing"), help: L("Signale, hors de votre collection, les cartes que vous avez déjà.", "Outside your collection, flags the cards you already have.")},
  {key: "missingImages", group: L("Cartes", "Cards"), label: L("Images manquantes", "Missing images"), help: L("Cherche une image sur Wikimedia (Wikipédia, Wikidata, Commons) pour les cartes qui n'en ont pas. Requêtes anonymes, sans cookie ; jamais pour une image masquée par le site.", "Looks for an image on Wikimedia (Wikipedia, Wikidata, Commons) for cards that have none. Anonymous requests, no cookies; never for an image hidden by the site.")},
  {key: "collectionBar", group: L("Pages du site", "Site pages"), label: L("Barre Toolbox sur la collection", "Toolbox bar on the collection"), help: L("Sous les filtres de la page Collection : trier les nouvelles cartes sur place, n'afficher que les cartes sans image ou en GIF, accès aux doublons et aux prix.", "Below the Collection page filters: sort new cards in place, show only cards without an image or with a GIF, quick access to duplicates and prices.")},
  {key: "cardInsight", group: L("Pages du site", "Site pages"), label: L("Infos dans la fiche d'une carte", "Info in a card's details"), help: L("Dans la fenêtre d'une carte : prix du marché, thème, amis intéressés, ajout à une famille.", "In a card's window: market price, theme, interested friends, add to a family.")},
  {key: "auctionInsight", group: L("Pages du site", "Site pages"), label: L("Analyse des enchères", "Auction analysis"), help: L("Sur la page d'une enchère : prix du marché, écart avec la mise, carte déjà possédée ou non, amis intéressés.", "On an auction page: market price, gap with the bid, whether you already own the card, interested friends.")},
  {key: "auctionTab", group: L("Pages du site", "Site pages"), label: L("Enchère dans le titre de l'onglet", "Auction in the tab title"), help: L("Sur la page d'une enchère, le titre de l'onglet indique le temps restant, si vous êtes en tête (✓) ou surenchéri (✗) et la mise actuelle ; il clignote quand quelqu'un surenchérit pendant que vous êtes sur un autre onglet.", "On an auction page, the tab title shows the time left, whether you are winning (✓) or outbid (✗) and the current bid; it blinks when someone outbids you while you are on another tab.")},
  {key: "dealBadges", group: L("Pages du site", "Site pages"), label: L("Bonnes affaires du marché", "Market deals"), help: L("Signale sur le marché les enchères nettement sous le prix du marché (ou très au-dessus).", "Flags auctions on the market well below the market price (or far above).")},
  {key: "friendTrades", group: L("Pages du site", "Site pages"), label: L("Échanges sur le profil d'un ami", "Trades on a friend's profile"), help: L("Sur le profil d'un joueur : cherche ses cartes qui vous intéressent et les vôtres qui l'intéressent.", "On a player's profile: finds their cards you want and your cards they want.")},
  {key: "packRecap", group: L("Paquets", "Packs"), label: L("Récapitulatif après un paquet", "Recap after a pack"), help: L("Bloc dans la page Paquets, affiché après la dernière carte révélée : nouveautés, doublons, prix du marché et valeur totale.", "Block on the Packs page, shown after the last card is revealed: new cards, duplicates, market prices and total value.")},
  {key: "pullStats", group: L("Paquets", "Packs"), label: L("Statistiques de tirage", "Pull stats"), help: L("Compte les raretés obtenues et affiche les taux de drop sur la page Paquets.", "Counts the rarities pulled and shows drop rates on the Packs page.")},
  {key: "openAll", group: L("Paquets", "Packs"), label: L("Bouton « Tout ouvrir »", "\"Open all\" button"), help: L("Sur la page Paquets : ouvre tous les paquets disponibles sans animation, après confirmation.", "On the Packs page: opens all available packs without animation, after confirmation.")},
  {key: "autoSortPulls", group: L("Paquets", "Packs"), label: L("Trier automatiquement les cartes tirées", "Auto-sort pulled cards"), help: L("Dès l'ouverture d'un paquet, ajoute aux cartes tirées leur thème, les étiquettes « Pour : … » et Doublon. Seuls les nouveaux exemplaires sont touchés, rien n'est supprimé.", "As soon as a pack is opened, adds their theme, the \"Pour : …\" tags and Doublon to the pulled cards. Only the new copies are touched; nothing is removed.")},
  {key: "sortAfterPack", group: L("Paquets", "Packs"), label: L("Proposer de trier après un paquet", "Offer to sort after a pack"), help: L("Sans tri automatique : bouton pour classer les nouvelles cartes depuis le récapitulatif.", "Without auto-sort: a button to sort the new cards from the recap.")},
  {key: "tradeRecap", group: L("Échanges", "Trades"), label: L("Bilan dans la fenêtre d'échange", "Summary in the trade window"), help: L("Dans la fenêtre « Échanger avec … » du site : valeur au prix du marché de ce que vous donnez et de ce que vous recevez (WikiBidous compris), et la différence.", "In the site's \"Échanger avec …\" window: market value of what you give and what you get (WikiBidous included), and the difference.")},
  {key: "tradeValues", group: L("Échanges", "Trades"), label: L("Valeur des échanges", "Trade values"), help: L("Prix du marché de chaque carte et total de chaque côté des échanges en cours.", "Market price of each card and total for each side of ongoing trades.")},
  {key: "bidAlerts", group: L("Marché", "Market"), label: L("Alerte de fin d'enchère", "Auction ending alert"), help: L("Prévient quand une enchère où vous êtes dépassé se termine bientôt.", "Warns you when an auction where you have been outbid is ending soon.")},
  {key: "stonks", group: L("Marché", "Market"), label: L("Page Stonks", "Stonks page"), help: L("Entrée « Stonks » dans le menu du site : vos achats et ventes au marché par jour, semaine ou mois, et la plus-value de l'achat-revente. Historique seulement.", "\"Stonks\" entry in the site menu: your market purchases and sales by day, week or month, and the profit from flipping. History only.")},
  {key: "autoClaimAchievements", group: L("Succès", "Achievements"), label: L("Réclamer les succès automatiquement", "Claim achievements automatically"), help: L("Réclame d'elle-même la récompense de chaque succès débloqué : au chargement d'une page WikiMasters, toutes les 15 minutes et après un paquet ou un échange. Sans cette option, le bouton « Tout réclamer » de l'onglet Succès le fait en un clic.", "Claims the reward of each unlocked achievement on its own: when a WikiMasters page loads, every 15 minutes and after a pack or a trade. Without this option, the \"Claim all\" button in the Achievements tab does it in one click.")},
  {key: "notificationSound", group: L("Confort", "Comfort"), label: L("Son de notification", "Notification sound"), help: L("Joue un son discret quand une nouvelle notification arrive.", "Plays a subtle sound when a new notification arrives.")},
];

const OFF_BY_DEFAULT = new Set(["missingImages", "notificationSound", "autoSortPulls", "autoClaimAchievements"]);

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
