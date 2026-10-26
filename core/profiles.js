// Profils d'intérêts : ce qu'un joueur collectionne. Chaque profil actif ajoute le tag
// « Pour : <name> » aux cartes qui l'intéressent.
//
// Un profil : {name, color, about?, rules: [règle, …]}. Il s'applique si l'une de ses règles s'applique.
// Une règle combine (toutes les conditions présentes doivent être vraies) :
//   theme   : thème générique, ou liste de thèmes ("Politique Française")
//   kw      : mots-clés (alternance de regex, mots entiers) cherchés dans `field`
//   field   : "focus" (titre + description + 1re phrase, par défaut) ou "title"
//   with    : autres mots-clés qui doivent aussi être présents dans `field`
//   unless  : mots-clés qui annulent la règle
//   image   : true → seulement les cartes qui ont une image
//   match   : prédicat prédéfini ("musicAlbum")
"use strict";

const {hasKeyword, patternProblem, isColor, extractFields} = require("./text");
const {PREDICATES} = require("./engine");

const FRIEND_PREFIX = "Pour : ";
const tagForProfile = (profile) => `${FRIEND_PREFIX}${profile.name}`;
const isFriendTag = (name) => name.startsWith(FRIEND_PREFIX);

// genericCat : thème de la carte, ou ses noms possibles (nom actuel et nom d'origine d'un thème renommé)
function ruleMatches(rule, card, f, genericCat) {
  let tested = false;
  if (rule.theme) {
    tested = true;
    const names = [].concat(genericCat);
    if (![].concat(rule.theme).some((t) => names.includes(t))) return false;
  }
  if (rule.match) {
    tested = true;
    const predicate = Object.prototype.hasOwnProperty.call(PREDICATES, rule.match) && PREDICATES[rule.match];
    if (!predicate || !predicate(f)) return false;
  }
  const text = rule.field === "title" ? f.title : f.focus;
  if (rule.kw) {
    tested = true;
    if (!hasKeyword(text, rule.kw)) return false;
  }
  if (rule.with && !hasKeyword(text, rule.with)) return false;
  if (rule.unless && hasKeyword(text, rule.unless)) return false;
  if (rule.image && !card.image_url) return false;
  // Une règle sans condition positive (seulement `unless` ou `image`) ne s'applique à rien
  return tested;
}

function profileMatches(profile, card, f, genericCat) {
  return (profile.rules || []).some((rule) => ruleMatches(rule, card, f, genericCat));
}

// Tags « Pour : … » d'une carte, dans l'ordre des profils.
function profileTags(profiles, card, f, genericCat) {
  const tags = [];
  for (const p of profiles || []) if (profileMatches(p, card, f || extractFields(card), genericCat)) tags.push(tagForProfile(p));
  return tags;
}

// ---------------------------------------------------------------------------
// Éditeur simple : mots-clés saisis à la main → alternance de regex
// ---------------------------------------------------------------------------

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// "requin, Star Wars, haltérophil*" → "requins?|star wars|haltérophil[a-zà-ÿ]*"
// Un mot seul accepte son pluriel en -s ou -x ; « * » en fin de mot accepte n'importe quelle fin.
function keywordsToPattern(input) {
  return String(input || "")
    .split(/[,;\n]+/)
    .map((k) => k.trim().toLowerCase().replace(/[’`ʼ]/g, "'").replace(/\s+/g, " "))
    .filter(Boolean)
    .map((k) => {
      const wildcard = k.endsWith("*");
      const base = escapeRegex(wildcard ? k.slice(0, -1) : k);
      if (wildcard) return `${base}[a-zà-ÿ]*`;
      return /^[a-zà-ÿ]+$/.test(k) && !/[sx]$/.test(k) ? `${base}[sx]?` : base;
    })
    .join("|");
}

// Profil simple → profil à règles. `simple` : {name, color, themes: [], keywords: "…", exclude: "…", imageOnly}
function simpleToProfile(simple) {
  const rules = [];
  const unless = keywordsToPattern(simple.exclude) || undefined;
  if (simple.themes?.length) rules.push({theme: [...simple.themes], ...(unless && {unless})});
  const kw = keywordsToPattern(simple.keywords);
  if (kw) rules.push({kw, ...(unless && {unless}), ...(simple.imageOnly && {image: true})});
  return {name: simple.name.trim(), color: simple.color, about: simple.about || "", rules, simple};
}

const MAX_NAME = 60;

// Vérifie un profil (importé ou saisi) ; renvoie la liste des problèmes.
function validateProfile(profile) {
  const problems = [];
  if (!profile || typeof profile !== "object") return ["Profil illisible."];
  const name = typeof profile.name === "string" ? profile.name.trim() : "";
  if (!name) problems.push("Le profil n'a pas de nom.");
  else if (name.length > MAX_NAME) problems.push(`Nom trop long (${MAX_NAME} caractères au plus).`);
  if (profile.color != null && !isColor(profile.color)) problems.push("Couleur invalide (format #rrggbb attendu).");
  if (!Array.isArray(profile.rules) || !profile.rules.length) problems.push("Le profil n'a aucune règle.");
  for (const rule of Array.isArray(profile.rules) ? profile.rules : []) {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
      problems.push("Règle illisible : chaque règle doit être un objet.");
      continue;
    }
    for (const key of ["kw", "with", "unless"]) {
      if (rule[key] == null) continue;
      const problem = patternProblem(rule[key]);
      if (problem) problems.push(`Expression invalide (${key}) : ${problem}.`);
    }
    if (rule.theme != null && ![].concat(rule.theme).every((t) => typeof t === "string")) problems.push("Thème invalide : texte ou liste de textes attendu.");
    if (rule.field != null && rule.field !== "title" && rule.field !== "focus") problems.push(`Champ inconnu : ${rule.field}`);
    if (rule.match && !Object.prototype.hasOwnProperty.call(PREDICATES, rule.match)) problems.push(`Prédicat inconnu : ${rule.match}`);
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Import / export en JSON
// ---------------------------------------------------------------------------

const PROFILES_FORMAT = "wikimasters-toolbox/profiles";
const MAX_PROFILES = 200;
const MAX_PROFILES_IMPORT = 1000000;
const RULE_KEYS = ["theme", "kw", "field", "with", "unless", "image", "match"];

// Profil réduit à ce qui se partage (ni id, ni état local)
function shareableProfile(p) {
  const out = {name: p.name, color: p.color, about: p.about || "", rules: p.rules};
  if (p.simple) out.simple = p.simple;
  if (p.enabled === false) out.enabled = false;
  return out;
}

// profiles : [profil] (le mien sous mon pseudo, puis ceux des amis) → objet à enregistrer en JSON
function exportProfiles(profiles) {
  return {format: PROFILES_FORMAT, version: 1, profiles: profiles.map(shareableProfile)};
}

// Profil lu dans un fichier : seulement les champs connus. Un profil de l'éditeur simple est
// reconstruit depuis sa saisie, pour que ses règles correspondent toujours à ce qu'affiche l'éditeur.
function cleanProfile(raw) {
  const str = (v) => (typeof v === "string" ? v : "");
  const name = str(raw.name).trim();
  const color = raw.color == null ? undefined : raw.color;
  let profile;
  if (raw.simple && typeof raw.simple === "object" && !Array.isArray(raw.simple)) {
    const s = raw.simple;
    const themes = Array.isArray(s.themes) ? s.themes.filter((t) => typeof t === "string") : [];
    profile = simpleToProfile({name, color, about: str(raw.about), themes, keywords: str(s.keywords), exclude: str(s.exclude), imageOnly: s.imageOnly === true});
  } else {
    const rules = Array.isArray(raw.rules)
      ? raw.rules.map((r) => (r && typeof r === "object" && !Array.isArray(r) ? Object.fromEntries(RULE_KEYS.filter((k) => r[k] != null).map((k) => [k, r[k]])) : r))
      : raw.rules;
    profile = {name, color, about: str(raw.about), rules};
  }
  if (raw.enabled === false) profile.enabled = false;
  return profile;
}

// Texte JSON → {profiles, rejected: [{name, problems}], error}. Accepte un export de la Toolbox,
// une liste de profils ou un profil seul. Un profil invalide est écarté, les autres sont gardés.
function importProfiles(text) {
  const fail = (error) => ({profiles: [], rejected: [], error});
  if (typeof text !== "string" || !text.trim()) return fail("Fichier vide.");
  if (text.length > MAX_PROFILES_IMPORT) return fail("Fichier trop volumineux pour des profils.");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return fail("JSON illisible.");
  }
  if (!data || typeof data !== "object") return fail("Ce fichier ne contient pas de profils.");
  if (data.format != null && data.format !== PROFILES_FORMAT) return fail("Ce fichier n'est pas un export de profils de la Toolbox.");
  const list = Array.isArray(data) ? data : Array.isArray(data.profiles) ? data.profiles : data.rules || data.simple ? [data] : null;
  if (!list) return fail("Ce fichier ne contient pas de profils.");
  if (list.length > MAX_PROFILES) return fail(`Trop de profils (${MAX_PROFILES} au plus).`);

  const profiles = [];
  const rejected = [];
  const seen = new Set();
  list.forEach((raw, i) => {
    const label = typeof raw?.name === "string" && raw.name.trim() ? raw.name.trim() : `Profil n° ${i + 1}`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return rejected.push({name: label, problems: ["Profil illisible."]});
    const profile = cleanProfile(raw);
    const problems = validateProfile(profile);
    if (!problems.length && seen.has(profile.name.toLowerCase())) problems.push("Nom en double dans le fichier.");
    if (problems.length) return rejected.push({name: label, problems});
    seen.add(profile.name.toLowerCase());
    profiles.push(profile);
  });
  return {profiles, rejected, error: null};
}

// Ajoute des profils importés : celui qui porte mon pseudo devient mon profil, un ami déjà présent
// (même nom) est remplacé en gardant son id, les autres sont ajoutés.
// state : {mine, friends} ; renvoie {state, added, replaced, mine: "added" | "replaced" | null}.
function mergeProfiles(state, imported, me, newId) {
  const lower = (s) => (s || "").toLowerCase();
  let mine = state.mine;
  let mineChange = null;
  const friends = [...state.friends];
  const added = [];
  const replaced = [];
  for (const p of imported) {
    if (me && lower(p.name) === lower(me)) {
      mineChange = mine ? "replaced" : "added";
      const {enabled, ...rest} = p;
      mine = {...rest, id: mine?.id || newId()};
      continue;
    }
    const i = friends.findIndex((f) => lower(f.name) === lower(p.name));
    if (i >= 0) {
      friends[i] = {...p, id: friends[i].id, enabled: p.enabled ?? friends[i].enabled ?? true};
      replaced.push(p.name);
    } else {
      friends.push({...p, id: newId(), enabled: p.enabled ?? true});
      added.push(p.name);
    }
  }
  return {state: {mine, friends}, added, replaced, mine: mineChange};
}

module.exports = {
  FRIEND_PREFIX,
  tagForProfile,
  isFriendTag,
  ruleMatches,
  profileMatches,
  profileTags,
  keywordsToPattern,
  simpleToProfile,
  validateProfile,
  exportProfiles,
  importProfiles,
  mergeProfiles,
};
