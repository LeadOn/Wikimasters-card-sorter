// Liste de thèmes personnalisée : chaque joueur peut renommer, recolorer, modifier les mots-clés,
// ajouter ou supprimer des thèmes (réglages de l'extension). Sans liste, le moteur utilise celle de
// core/themes.js, comme les scripts Node.
//
// Liste résolue (ce que manipulent l'éditeur et le moteur) :
//   {themes: [{id, name, color, kw, head?, weight?, role?, split?}], other: {name, color}}
//   id    : nom du thème dans core/themes.js, ou "t-…" pour un thème ajouté par le joueur
//   split : {fr: {name, color}, intl: {name, color}} : thème scindé France / international
//   other : étiquette des cartes sans thème reconnu (« Autre »)
//
// Réglage enregistré (`stored`) : seulement les différences avec la liste par défaut, pour qu'un
// thème non modifié profite des améliorations des mots-clés à chaque mise à jour :
//   {edits: {id: {champ modifié…}}, added: [thème…], deleted: [id…], other: {name?, color?},
//    renames: {ancien nom: nouveau nom}, removed: [nom…]}
//   renames / removed : étiquettes de thèmes renommés / supprimés, pas encore traitées par un tri
//   (voir planThemeTags dans core/tag-sync.js).
"use strict";

const {compile, patternProblem, isColor} = require("./text");
const {THEMES, THEME_COLORS, OTHER, DOUBLON} = require("./themes");

const FALLBACK_COLOR = "#64748b";
const MAX_NAME = 60;
const FIELDS = ["name", "color", "kw", "head", "split"];

// ---------------------------------------------------------------------------
// Liste par défaut
// ---------------------------------------------------------------------------

// L'ordre des thèmes (celui de THEMES) sert à départager deux scores strictement égaux.
function defaultThemeList() {
  const themes = Object.entries(THEMES).map(([id, t]) => {
    const theme = {id, name: id, color: THEME_COLORS[id] || FALLBACK_COLOR, kw: t.kw, head: t.head || ""};
    if (t.weight) theme.weight = t.weight;
    if (t.role) theme.role = t.role;
    if (t.split) {
      const [fr, intl] = t.split;
      theme.split = {fr: {name: fr, color: THEME_COLORS[fr]}, intl: {name: intl, color: THEME_COLORS[intl]}};
    }
    return theme;
  });
  return {themes, other: {name: OTHER, color: THEME_COLORS[OTHER]}};
}

const clone = (x) => JSON.parse(JSON.stringify(x));
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// ---------------------------------------------------------------------------
// Réglage enregistré ⇄ liste résolue
// ---------------------------------------------------------------------------

function resolveThemes(stored) {
  const base = defaultThemeList();
  if (!stored) return base;
  const deleted = new Set(stored.deleted || []);
  const edits = stored.edits || {};
  const themes = base.themes.filter((t) => !deleted.has(t.id)).map((t) => {
    const edit = edits[t.id] || {};
    const theme = {...t};
    for (const key of FIELDS) if (Object.prototype.hasOwnProperty.call(edit, key)) theme[key] = clone(edit[key]);
    if (!theme.split) delete theme.split;
    theme.head = theme.head || "";
    return theme;
  });
  for (const t of stored.added || []) themes.push(clone(t));
  return {themes, other: {...base.other, ...(stored.other || {})}};
}

// Étiquettes d'une liste, chacune avec une clé stable (le renommage d'un thème garde sa clé).
// La partie française d'un thème scindé garde la clé du thème : scinder « Politique » renomme son
// étiquette au lieu d'en créer une autre.
function tagSlots(list) {
  const slots = [];
  for (const t of list.themes) {
    if (t.split) {
      slots.push({key: t.id, name: t.split.fr.name, color: t.split.fr.color, theme: t});
      slots.push({key: `${t.id}#intl`, name: t.split.intl.name, color: t.split.intl.color, theme: t});
    } else slots.push({key: t.id, name: t.name, color: t.color, theme: t});
  }
  slots.push({key: "#other", name: list.other.name, color: list.other.color, theme: null});
  return slots;
}

// Étiquettes renommées et supprimées entre deux listes, ajoutées à celles qu'aucun tri n'a encore
// traitées. Un nom de nouveau utilisé par un thème n'est ni renommé ni retiré.
function trackTagChanges(before, after, {renames = {}, removed = []} = {}) {
  const next = {...renames};
  const gone = new Set(removed);
  const afterSlots = new Map(tagSlots(after).map((s) => [s.key, s]));
  for (const slot of tagSlots(before)) {
    const now = afterSlots.get(slot.key);
    if (now && now.name === slot.name) continue;
    if (now) {
      for (const [from, to] of Object.entries(next)) if (to === slot.name) next[from] = now.name;
      next[slot.name] = now.name;
    } else {
      for (const [from, to] of Object.entries(next))
        if (to === slot.name) {
          delete next[from];
          gone.add(from);
        }
      gone.add(slot.name);
    }
  }
  for (const {name} of afterSlots.values()) {
    gone.delete(name);
    delete next[name];
  }
  for (const [from, to] of Object.entries(next)) if (from === to) delete next[from];
  return {renames: next, removed: [...gone]};
}

// Liste modifiée → réglage à enregistrer (null : liste par défaut et rien en attente).
function storeThemes(list, previous = null) {
  const base = defaultThemeList();
  const byId = new Map(list.themes.map((t) => [t.id, t]));
  const stored = {edits: {}, added: [], deleted: [], other: {}};
  for (const t of base.themes) {
    const now = byId.get(t.id);
    if (!now) {
      stored.deleted.push(t.id);
      continue;
    }
    const edit = {};
    for (const key of FIELDS) if (!same(now[key], t[key])) edit[key] = now[key] ? clone(now[key]) : null;
    if (Object.keys(edit).length) stored.edits[t.id] = edit;
  }
  const defaultIds = new Set(base.themes.map((t) => t.id));
  for (const t of list.themes) if (!defaultIds.has(t.id)) stored.added.push(clone(t));
  for (const key of ["name", "color"]) if (list.other[key] !== base.other[key]) stored.other[key] = list.other[key];

  Object.assign(stored, trackTagChanges(resolveThemes(previous), list, previous || {}));
  const empty =
    !Object.keys(stored.edits).length && !stored.added.length && !stored.deleted.length && !Object.keys(stored.other).length && !Object.keys(stored.renames).length && !stored.removed.length;
  return empty ? null : stored;
}

// Retire du réglage les étiquettes traitées par un tri (renommées, supprimées ou absentes).
function settleThemes(stored, names) {
  if (!stored) return stored;
  const done = new Set(names);
  const renames = Object.fromEntries(Object.entries(stored.renames || {}).filter(([from]) => !done.has(from)));
  const removed = (stored.removed || []).filter((n) => !done.has(n));
  const next = {...stored, renames, removed};
  return storeThemes(resolveThemes(next), next);
}

// Thème ajouté par le joueur.
function newTheme(name = "Nouveau thème", color = "#0ea5e9") {
  return {id: `t-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, color, kw: "", head: ""};
}

// Couleurs choisies avant l'éditeur de thèmes (réglage `themeColors` : nom d'étiquette → couleur).
function applyTagColors(list, colors = {}) {
  const pick = (part) => (colors[part.name] ? {...part, color: colors[part.name]} : part);
  return {
    themes: list.themes.map((t) => (t.split ? {...pick(t), split: {fr: pick(t.split.fr), intl: pick(t.split.intl)}} : pick(t))),
    other: pick(list.other),
  };
}

// ---------------------------------------------------------------------------
// Édition des mots-clés : une expression par ligne
// ---------------------------------------------------------------------------

// Coupe une alternance de regex sur ses « | » de premier niveau (hors groupes et classes).
function splitPattern(pattern) {
  const parts = [];
  let depth = 0;
  let inClass = false;
  let start = 0;
  const s = pattern || "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") i++;
    else if (inClass) inClass = c !== "]";
    else if (c === "[") inClass = true;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "|" && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  if (s) parts.push(s.slice(start));
  return parts;
}

// Lignes → alternance. Le texte des cartes est en minuscules : la saisie aussi (sauf les échappements « \\d »).
const joinPattern = (lines) =>
  String(lines || "")
    .split("\n")
    .map((l) => l.trim().replace(/[’`ʼ]/g, "'").replace(/\\.|[^\\]+/g, (m) => (m[0] === "\\" ? m : m.toLowerCase())))
    .filter(Boolean)
    .join("|");

// ---------------------------------------------------------------------------
// Vérification
// ---------------------------------------------------------------------------

// Problèmes d'une liste modifiée : [{id, message}] (id null : la liste entière ou « Autre »).
function validateThemes(list) {
  const problems = [];
  const seen = new Map();
  const checkName = (id, name, label) => {
    const n = typeof name === "string" ? name.trim() : "";
    if (!n) return problems.push({id, message: `${label} : nom manquant.`});
    if (n !== name) problems.push({id, message: `${label} : espace en début ou en fin de nom.`});
    if (n.length > MAX_NAME) problems.push({id, message: `${label} : nom trop long (${MAX_NAME} caractères au plus).`});
    if (n === DOUBLON || n.startsWith("Pour :")) problems.push({id, message: `« ${n} » est réservé à une autre étiquette de la Toolbox.`});
    if (seen.has(n)) problems.push({id, message: `« ${n} » est utilisé deux fois.`});
    seen.set(n, id);
  };
  const checkColor = (id, color, label) => !isColor(color) && problems.push({id, message: `${label} : couleur invalide.`});
  if (!list?.themes?.length) problems.push({id: null, message: "Il faut au moins un thème."});
  for (const t of list?.themes || []) {
    const label = t.name || "Thème sans nom";
    if (t.split) {
      checkName(t.id, t.split.fr.name, `${label} (France)`);
      checkName(t.id, t.split.intl.name, `${label} (international)`);
      checkColor(t.id, t.split.fr.color, label);
      checkColor(t.id, t.split.intl.color, label);
      if (!t.name?.trim()) problems.push({id: t.id, message: "Thème sans nom."});
    } else {
      checkName(t.id, t.name, label);
      checkColor(t.id, t.color, label);
    }
    if (!t.kw) problems.push({id: t.id, message: `${label} : aucun mot-clé.`});
    for (const key of ["kw", "head"]) {
      if (!t[key]) continue;
      const problem = patternProblem(t[key]);
      if (problem) problems.push({id: t.id, message: `${label} : expression invalide (${problem}).`});
    }
  }
  checkName(null, list?.other?.name, "Cartes sans thème");
  checkColor(null, list?.other?.color, "Cartes sans thème");
  return problems;
}

// ---------------------------------------------------------------------------
// Import / export en JSON
// ---------------------------------------------------------------------------

const EXPORT_FORMAT = "wikimasters-toolbox/themes";
const ROLES = ["disambig", "species", "person"];
const MAX_IMPORT = 500000;
const MAX_THEMES = 100;

// Liste → objet à enregistrer en JSON (les ids gardent le lien avec les thèmes par défaut : un thème
// « Sports » renommé reste reconnu chez celui qui importe la liste).
function exportThemes(list) {
  const themes = list.themes.map((t) => {
    const out = {id: t.id, name: t.name, color: t.color, kw: t.kw};
    if (t.head) out.head = t.head;
    if (t.weight) out.weight = t.weight;
    if (t.role) out.role = t.role;
    if (t.split) out.split = clone(t.split);
    return out;
  });
  return {format: EXPORT_FORMAT, version: 1, themes, other: {name: list.other.name, color: list.other.color}};
}

// Texte JSON → {list, problems}. Seuls les champs connus sont repris ; list est null si le texte
// n'est pas une liste de thèmes lisible. Les problèmes de contenu (nom en double, expression
// invalide…) sont ceux de validateThemes : la liste est alors chargée pour être corrigée.
function importThemes(text) {
  const fail = (message) => ({list: null, problems: [message]});
  if (typeof text !== "string" || !text.trim()) return fail("Fichier vide.");
  if (text.length > MAX_IMPORT) return fail("Fichier trop volumineux pour une liste de thèmes.");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return fail("JSON illisible.");
  }
  if (Array.isArray(data)) data = {themes: data};
  if (!data || typeof data !== "object") return fail("Ce fichier n'est pas une liste de thèmes.");
  if (data.format != null && data.format !== EXPORT_FORMAT) return fail("Ce fichier n'est pas une liste de thèmes de la Toolbox.");
  if (!Array.isArray(data.themes)) return fail("Aucune liste « themes » dans ce fichier.");
  if (data.themes.length > MAX_THEMES) return fail(`Trop de thèmes (${MAX_THEMES} au plus).`);

  const problems = [];
  const str = (v) => (typeof v === "string" ? v : "");
  const part = (v) => ({name: str(v?.name), color: str(v?.color)});
  const ids = new Set();
  const themes = [];
  data.themes.forEach((t, i) => {
    if (!t || typeof t !== "object" || Array.isArray(t)) return problems.push(`Thème n° ${i + 1} illisible.`);
    let id = typeof t.id === "string" && t.id.trim() && t.id.length <= 100 ? t.id : null;
    if (!id || ids.has(id)) id = newTheme().id + i;
    ids.add(id);
    const theme = {id, name: str(t.name), color: str(t.color), kw: str(t.kw), head: str(t.head)};
    if (typeof t.weight === "number" && t.weight >= 0.1 && t.weight <= 3) theme.weight = t.weight;
    if (ROLES.includes(t.role)) theme.role = t.role;
    if (t.split) {
      if (typeof t.split !== "object" || !t.split.fr || !t.split.intl) problems.push(`${theme.name || `Thème n° ${i + 1}`} : séparation France / international illisible.`);
      else theme.split = {fr: part(t.split.fr), intl: part(t.split.intl)};
    }
    themes.push(theme);
  });
  if (problems.length) return {list: null, problems};
  const fallback = defaultThemeList().other;
  const other = data.other && typeof data.other === "object" ? {name: str(data.other.name) || fallback.name, color: str(data.other.color) || fallback.color} : fallback;
  const list = {themes, other};
  return {list, problems: validateThemes(list).map((p) => p.message)};
}

// ---------------------------------------------------------------------------
// Liste compilée, utilisée par le moteur
// ---------------------------------------------------------------------------

// {list, rules, tags: {nom: couleur}, other, roles: {role: règle}, origin: {nom: nom par défaut}}
// tags : dans l'ordre d'affichage de THEME_COLORS (un thème renommé garde sa place), puis les
// thèmes ajoutés, puis « Autre ».
// origin : nom par défaut d'une étiquette renommée, pour que les règles des profils et des familles
// qui citent un thème par son nom d'origine (« Sports ») suivent le renommage.
const compiled = new WeakMap();
function compileThemes(list) {
  if (compiled.has(list)) return compiled.get(list);
  const defaults = new Map(tagSlots(defaultThemeList()).map((s) => [s.key, s.name]));
  const display = Object.keys(THEME_COLORS);
  const rank = (slot) => (slot.key === "#other" ? Infinity : defaults.has(slot.key) ? display.indexOf(defaults.get(slot.key)) : display.length);
  const tags = {};
  const origin = {};
  for (const slot of tagSlots(list).sort((a, b) => rank(a) - rank(b))) {
    tags[slot.name] = slot.color || FALLBACK_COLOR;
    if (defaults.has(slot.key) && defaults.get(slot.key) !== slot.name) origin[slot.name] = defaults.get(slot.key);
  }
  const rules = list.themes.map((t) => ({
    name: t.name,
    kw: compile(t.kw),
    head: t.head ? compile(t.head) : null,
    weight: t.weight || 1,
    split: t.split ? [t.split.fr.name, t.split.intl.name] : null,
  }));
  const roles = {};
  list.themes.forEach((t, i) => t.role && !roles[t.role] && (roles[t.role] = rules[i]));
  const set = {
    list,
    rules,
    tags,
    other: list.other.name,
    roles,
    origin,
  };
  compiled.set(list, set);
  return set;
}

const DEFAULT_THEME_SET = compileThemes(defaultThemeList());

// Liste compilée, liste résolue ou rien (thèmes par défaut)
const themeSetOf = (themes) => (!themes ? DEFAULT_THEME_SET : themes.rules ? themes : compileThemes(themes));

// Noms sous lesquels une règle peut désigner ce thème : son nom, et son nom d'origine s'il a été renommé.
const themeAliases = (set, name) => (set.origin[name] ? [name, set.origin[name]] : [name]);

module.exports = {
  defaultThemeList,
  resolveThemes,
  storeThemes,
  settleThemes,
  trackTagChanges,
  tagSlots,
  newTheme,
  applyTagColors,
  splitPattern,
  joinPattern,
  validateThemes,
  exportThemes,
  importThemes,
  compileThemes,
  themeSetOf,
  themeAliases,
  DEFAULT_THEME_SET,
};
