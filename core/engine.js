// Moteur de classement : un thème générique par carte, puis les tags « Pour : … » des profils d'intérêts.
"use strict";

const {compile, hasKeyword, firstMatch, extractFields} = require("./text");
const {themeSetOf} = require("./theme-set");

// Pondération : la description courte (`category` = description Wikidata) est le signal
// le plus fiable, puis la définition, puis le titre ; le reste du résumé ne fait que départager.
const WEIGHTS = {desc: 10, def: 7, lead: 4, title: 3, body: 0.5};
const MIN_SCORE = 1;

// Plus le mot est loin du début de la description, moins il pèse.
const positionFactor = (word) => Math.max(0.3, 1 - 0.1 * word);

// Meilleure occurrence d'un thème dans un champ positionnel (mot-clé, ou nom de tête).
function bestMatch(rule, text) {
  const candidates = [firstMatch(rule.kw, text)];
  if (rule.head) {
    const h = firstMatch(rule.head, text);
    if (h && h.word <= 1) candidates.push(h);
  }
  return candidates
    .filter(Boolean)
    .sort((a, b) => a.word - b.word || b.length - a.length)[0];
}

// Une occurrence incluse dans une expression plus longue d'un autre thème ne compte pas :
// "cheval" (Faune) dans "cheval de course" (Sports), "navire" dans "navire de guerre".
const isShadowed = (m, others) =>
  others.some(
    (o) => o !== m && o.length > m.length && o.index <= m.index && o.index + o.length >= m.index + m.length,
  );

// themes : liste de thèmes compilée (core/theme-set.js) ; par défaut, celle de core/themes.js.
function scoreThemes(f, themes) {
  const RULES = themeSetOf(themes).rules;
  const totals = new Map(RULES.map((r) => [r, 0]));
  for (const field of ["desc", "def", "lead"]) {
    const text = f[field];
    if (!text) continue;
    const matches = new Map();
    for (const rule of RULES) {
      const m = bestMatch(rule, text);
      if (m) matches.set(rule, m);
    }
    const all = [...matches.values()];
    for (const [rule, m] of matches) {
      if (isShadowed(m, all)) continue;
      // + longueur : à position égale, l'expression la plus précise l'emporte
      totals.set(rule, totals.get(rule) + WEIGHTS[field] * positionFactor(m.word) + m.length * 0.01);
    }
  }
  // Un mot isolé du titre ("Pommes duchesse", "Guy Dauphin Environnement") ne suffit pas
  // quand la carte a une description qui ne confirme pas le thème.
  const hasText = Boolean(f.desc || f.def || f.lead);
  const scores = {};
  for (const rule of RULES) {
    let total = totals.get(rule);
    const t = f.title && firstMatch(rule.kw, f.title);
    if (t) total += total > 0 || !hasText || t.text.includes(" ") ? WEIGHTS.title : WEIGHTS.body;
    if (f.body && rule.kw.test(f.body)) total += WEIGHTS.body;
    if (total > 0) scores[rule.name] = Math.round(total * rule.weight * 100) / 100;
  }
  return scores;
}

// Pages d'homonymie, noms de famille, prénoms : classées avant tout le reste,
// sinon elles héritent du thème des personnes listées.
const DISAMBIG_DESC = compile(
  "pages? d'homonymie|homonymies?|noms? de famille|patronymes?|prénoms?|toponymes?",
);
const DISAMBIG_LEAD = compile(
  "peut (?:désigner|faire référence|se référer|renvoyer)|pouvant (?:désigner|faire référence)|(?:est|sont) (?:un|une|des) (?:noms?|patronymes?|prénoms?|toponymes?)(?! de code)|notamment port[ée]e?s? (?:[^.]{0,30} )?par",
);
function isDisambiguation(f) {
  const d = firstMatch(DISAMBIG_DESC, f.desc);
  if (d && d.word <= 1) return true;
  if (firstMatch(DISAMBIG_DESC, f.def)?.word === 0) return true;
  if (/\(homonymie\)/.test(f.title)) return true;
  return DISAMBIG_LEAD.test(f.leadFull);
}

const FRENCH = compile(
  "français|française|françaises|france|paris|assemblée nationale française|cinquième république|ve république|ive république|iiie république",
);
// Étiquette d'un thème ; un thème scindé (Politique) l'est selon la nationalité.
function tagOf(rule, f) {
  if (!rule.split) return rule.name;
  // On cherche la nationalité dans la description / définition, pas dans tout le résumé
  // (un homme politique hongrois mort à Paris reste un homme politique hongrois).
  const strong = f.desc || f.def ? `${f.desc} ${f.def} ${f.title}` : f.all;
  return FRENCH.test(strong) ? rule.split[0] : rule.split[1];
}

// Biographie non reconnue ("X, né le … à …") : à défaut de mieux, Personnalités.
const PERSON_LEAD =
  /(?:^|[ ,(])née? (?:le |en |à |vers )|\((?:né|née) |\([^()]*\d{3,4}\s*[-–][^()]*\d{3,4}\s*\)|, mort(?:e)? (?:le|en|à) /;

// Carte sans aucun texte dont le titre est un nom latin ("Crataegus punctata") : une espèce.
const LATIN_BINOMIAL =
  /^[A-Z][a-z]+(?: [a-z]+){1,2}$/;
const LATIN_ENDING = /(?:us|a|um|is|ensis|ii|i|ae|oides|ata|atus|ica|icus|ana|anus|ina|inus|osa|osus|ens|ans|ella|ellus|ula|ulus|ax|ex|ix|ops)$/;

// Corrections manuelles : { "Thème": [id de user_card, …] }, fournies par l'appelant
// (manual_mapping_db.json pour les scripts Node). Utilisées seulement quand le moteur
// n'a pas de réponse fiable (aucun thème reconnu).
const manualIndex = new WeakMap();
function manualCategory(mapping, userCardId) {
  if (!mapping || !userCardId) return null;
  if (!manualIndex.has(mapping)) {
    const index = new Map();
    for (const [theme, ids] of Object.entries(mapping)) for (const id of ids) index.set(id, theme);
    manualIndex.set(mapping, index);
  }
  return manualIndex.get(mapping).get(userCardId) || null;
}

// Les règles à part (homonymies, nom latin, biographie) visent le thème qui a ce rôle ;
// sans lui (thème supprimé par le joueur), la carte suit le cas général.
function genericCategory(f, themes) {
  const set = themeSetOf(themes);
  const {disambig, species, person} = set.roles;
  if (isDisambiguation(f)) return {theme: disambig ? tagOf(disambig, f) : set.other, scores: {}, confident: true};
  const scores = scoreThemes(f, set);
  let rule = null;
  let best = MIN_SCORE - 0.001;
  for (const r of set.rules) {
    if (scores[r.name] > best) [rule, best] = [r, scores[r.name]];
  }
  // Replis quand aucun thème n'est reconnu : supposition raisonnable, mais pas fiable
  const confident = Boolean(rule);
  if (!confident) {
    if (!f.desc && !f.leadFull && LATIN_BINOMIAL.test(f.rawTitle) && LATIN_ENDING.test(f.rawTitle)) rule = species;
    else if (PERSON_LEAD.test(f.leadFull.slice(0, 250))) rule = person;
  }
  return {theme: rule ? tagOf(rule, f) : set.other, scores, confident};
}

// Album de musique : "album" en tête de la description ou de la définition ("album de Bob Dylan",
// "huitième album studio d'Oddisee"), ou "(album)" dans le titre. Une chanson "extraite de
// l'album …" ne compte pas, ni un album de bande dessinée ou jeunesse.
const ALBUM = compile("albums?|mini-albums?");
function isMusicAlbum(f) {
  if (/\(album[ )]/.test(f.title)) return true;
  const atHead = [f.desc, f.def].some((t) => firstMatch(ALBUM, t)?.word <= 2);
  return (
    atHead &&
    !hasKeyword(`${f.desc} ${f.def}`, "bandes? dessinées?|bd|jeunesse|photos?|illustrée?s?|vignettes?|autocollants?|panini")
  );
}

// Prédicats utilisables dans les règles des profils d'intérêts ({match: "musicAlbum"}).
const PREDICATES = {musicAlbum: isMusicAlbum};

module.exports = {genericCategory, manualCategory, scoreThemes, isMusicAlbum, PREDICATES, extractFields};
