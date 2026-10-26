// Thèmes de tri du joueur : la liste de core/themes.js, modifiée dans l'onglet Réglages.
// Tout classement de l'extension passe par ici, pour utiliser la liste du joueur.
import {settings} from "./settings";
import {categorize, isThemeTag, themeAliases, resolveThemes, compileThemes, storeThemes, settleThemes, DOUBLON, DOUBLON_COLOR} from "../../../../core";

let memo = {stored: undefined, set: null};

// Liste compilée (core/theme-set.js), recalculée seulement quand le réglage change
export function themeSet() {
  const stored = settings.get().themes;
  if (!memo.set || memo.stored !== stored) memo = {stored, set: compileThemes(resolveThemes(stored))};
  return memo.set;
}

// Étiquettes de thème, dans l'ordre d'affichage (« Autre » compris)
export const themeNames = () => Object.keys(themeSet().tags);
export const isTheme = (name) => isThemeTag(name, themeSet());
export const otherTheme = () => themeSet().other;
// Noms d'un thème pour les règles des profils (nom actuel, et nom d'origine s'il a été renommé)
export const aliasesOf = (name) => themeAliases(themeSet(), name);

export function tagColor(name) {
  if (name === DOUBLON) return settings.get().themeColors[DOUBLON] || DOUBLON_COLOR;
  return themeSet().tags[name] || "#64748b";
}

// categorize() avec les thèmes du joueur
export const classify = (card, options = {}) => categorize(card, {...options, themes: themeSet()});

// Thème d'une carte gardé en mémoire (par clé : id, titre…), oublié quand la liste change
export function themeMemo() {
  const cache = new Map();
  let set = null;
  return (key, card) => {
    if (set !== themeSet()) {
      set = themeSet();
      cache.clear();
    }
    if (!cache.has(key)) cache.set(key, classify(card)[0]);
    return cache.get(key);
  };
}

// Enregistre une liste modifiée ; les étiquettes renommées ou supprimées sont notées pour le prochain tri
export const saveThemes = (list) => settings.set((st) => ({...st, themes: storeThemes(list, st.themes)}));

// Après un tri : oublie les étiquettes renommées ou retirées qu'il a traitées
export const settleThemeTags = (names) => names.length && settings.set((st) => ({...st, themes: settleThemes(st.themes, names)}));

// Étiquettes en attente d'un tri : {renames: {ancien: nouveau}, removed: [nom]}
export function pendingThemeTags() {
  const stored = settings.get().themes;
  return {renames: stored?.renames || {}, removed: stored?.removed || []};
}
