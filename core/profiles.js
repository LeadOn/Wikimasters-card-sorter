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

const {hasKeyword, extractFields} = require("./text");
const {PREDICATES} = require("./engine");

const FRIEND_PREFIX = "Pour : ";
const tagForProfile = (profile) => `${FRIEND_PREFIX}${profile.name}`;
const isFriendTag = (name) => name.startsWith(FRIEND_PREFIX);

function ruleMatches(rule, card, f, genericCat) {
  let tested = false;
  if (rule.theme) {
    tested = true;
    if (![].concat(rule.theme).includes(genericCat)) return false;
  }
  if (rule.match) {
    tested = true;
    const predicate = PREDICATES[rule.match];
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

// Vérifie un profil (importé ou saisi) ; renvoie la liste des problèmes.
function validateProfile(profile) {
  const problems = [];
  if (!profile || typeof profile !== "object") return ["Profil illisible."];
  if (!String(profile.name || "").trim()) problems.push("Le profil n'a pas de nom.");
  if (!Array.isArray(profile.rules) || !profile.rules.length) problems.push("Le profil n'a aucune règle.");
  for (const rule of profile.rules || []) {
    for (const key of ["kw", "with", "unless"]) {
      if (rule[key] == null) continue;
      try {
        new RegExp(rule[key]);
      } catch (e) {
        problems.push(`Expression invalide (${key}) : ${e.message}`);
      }
    }
    if (rule.match && !PREDICATES[rule.match]) problems.push(`Prédicat inconnu : ${rule.match}`);
  }
  return problems;
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
};
