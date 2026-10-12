// Réglages de la Toolbox : un interrupteur par fonctionnalité, couleurs des tags.
import {persistentStore} from "../lib/storage";

export const FEATURES = [
  {key: "themeBadges", group: "Cartes", label: "Pastille du thème", help: "Affiche le thème calculé par le moteur sur les cartes du marché, des amis et du catalogue."},
  {key: "priceBadges", group: "Cartes", label: "Prix moyen", help: "Affiche le prix moyen de vente (pour la rareté de la carte) quand il est connu."},
  {key: "wikiLink", group: "Cartes", label: "Lien Wikipédia", help: "Ajoute un bouton « W » qui ouvre l'article."},
  {key: "ownedBadges", group: "Cartes", label: "Possédée / manquante", help: "Signale, hors de votre collection, les cartes que vous avez déjà."},
  {key: "missingImages", group: "Cartes", label: "Images manquantes", help: "Cherche une illustration sur Wikipédia pour les cartes sans image (requête à fr.wikipedia.org, sans cookie)."},
  {key: "packRecap", group: "Paquets", label: "Récapitulatif après un paquet", help: "Bloc dans la page Paquets, affiché après la dernière carte révélée : nouveautés, doublons, prix moyens et valeur totale."},
  {key: "pullStats", group: "Paquets", label: "Statistiques de tirage", help: "Compte les raretés obtenues et affiche les taux de drop sur la page Paquets."},
  {key: "openAll", group: "Paquets", label: "Bouton « Tout ouvrir »", help: "Sur la page Paquets : ouvre tous les paquets disponibles sans animation, après confirmation."},
  {key: "autoSortPulls", group: "Paquets", label: "Trier automatiquement les cartes tirées", help: "Dès l'ouverture d'un paquet, ajoute aux cartes tirées leur thème, les étiquettes « Pour : … » et Doublon. Seuls les nouveaux exemplaires sont touchés, rien n'est supprimé."},
  {key: "sortAfterPack", group: "Paquets", label: "Proposer de trier après un paquet", help: "Sans tri automatique : bouton pour classer les nouvelles cartes depuis le récapitulatif."},
  {key: "tradeValues", group: "Échanges", label: "Valeur des échanges", help: "Prix moyen de chaque carte et total de chaque côté des échanges en cours."},
  {key: "bidAlerts", group: "Marché", label: "Alerte de fin d'enchère", help: "Prévient quand une enchère où vous êtes dépassé se termine bientôt."},
  {key: "notificationSound", group: "Confort", label: "Son de notification", help: "Joue un son discret quand une nouvelle notification arrive."},
];

const OFF_BY_DEFAULT = new Set(["missingImages", "notificationSound", "autoSortPulls"]);

export const DEFAULT_SETTINGS = {
  features: Object.fromEntries(FEATURES.map((f) => [f.key, !OFF_BY_DEFAULT.has(f.key)])),
  themeColors: {},
  priceMaxAgeHours: 48,
  bidAlertMinutes: 2,
};

export const settings = persistentStore("settings", DEFAULT_SETTINGS, {
  merge: (saved) => ({
    ...DEFAULT_SETTINGS,
    ...saved,
    features: {...DEFAULT_SETTINGS.features, ...(saved.features || {})},
    themeColors: {...(saved.themeColors || {})},
  }),
});

export const isOn = (key) => settings.get().features[key] !== false;
