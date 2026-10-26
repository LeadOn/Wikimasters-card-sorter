// Outils de texte du moteur : normalisation, mots-clés entiers, extraction des champs d'une carte.
// Sans dépendance : partagé par les scripts Node, les tests et l'extension.
"use strict";

// ---------------------------------------------------------------------------
// Correspondance de mots-clés
// ---------------------------------------------------------------------------

// Un mot-clé doit être un mot entier. Le tiret compte comme une lettre, sinon
// "Saint-Priest" contiendrait "saint" et "Nouvelle-Aquitaine" "nouvelle".
// Exception : après un préfixe adjectival en "-o" ("germano-soviétique", "franco-russe").
const WORD_CHARS = "a-zà-ÿœæ0-9";
function compile(keywords) {
  return new RegExp(
    `(?:(?<![${WORD_CHARS}-])|(?<=[a-zà-ÿ]o-))(?:${keywords})(?![${WORD_CHARS}-])`,
  );
}

const regexCache = new Map();
function hasKeyword(text, keywords) {
  if (!regexCache.has(keywords)) regexCache.set(keywords, compile(keywords));
  return regexCache.get(keywords).test(text);
}

// Une expression saisie par un joueur (profil importé, thème modifié) est appliquée à chaque carte
// de la collection : trop longue, ou à quantificateurs imbriqués (« (a+)+ », temps d'exécution
// explosif), elle figerait la page. Renvoie le problème, ou null.
const MAX_PATTERN = 5000;
const NESTED_QUANTIFIER = /\((?:[^()\\]|\\.)*[+*}](?:[^()\\]|\\.)*\)[+*{]/;
function patternProblem(pattern) {
  if (typeof pattern !== "string") return "texte attendu";
  if (pattern.length > MAX_PATTERN) return `trop longue, ${MAX_PATTERN} caractères au plus`;
  if (NESTED_QUANTIFIER.test(pattern)) return "quantificateurs imbriqués, trop lente à évaluer";
  try {
    compile(pattern);
  } catch (e) {
    return e.message;
  }
  return null;
}

const isColor = (c) => typeof c === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(c);

function normalize(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[’`ʼ]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Position (en mots) de la première occurrence : sert à privilégier le nom de tête
// d'une description ("commune française…", "film sorti en…").
function firstMatch(re, text) {
  const m = re.exec(text);
  if (!m) return null;
  const before = text.slice(0, m.index).trim();
  return {index: m.index, word: before ? before.split(" ").length : 0, length: m[0].length, text: m[0]};
}

// ---------------------------------------------------------------------------
// Extraction des champs d'une carte
// ---------------------------------------------------------------------------

// Fin de phrase : ponctuation précédée d'au moins 2 lettres (évite "J. R. R. Tolkien")
// et suivie d'une majuscule.
const SENTENCE_END = /(?<=[a-zà-ÿ0-9)»"]{2}[.!?])\s+(?=[A-ZÀ-Ý«"(])/;

// "X est un/une …" : ce qui suit est la définition de l'article, le signal le plus fiable
// quand la description courte (`category`) est absente.
const COPULA =
  /(?<![a-zà-ÿ'-])(?:est|était|sont|étaient|fut|furent|désigne|désignait|reste|devient) (?:(?:actuellement|aujourd'hui|également|aussi|alors|désormais|notamment|plus précisément|à l'origine) )?(?:(?:une|un|les|le|la|des) |l')/;

function extractFields(card) {
  const summary = (card.summary || "").trim();
  const firstParagraph = summary.split(/\n+/)[0] || "";
  const leadRaw = firstParagraph.split(SENTENCE_END)[0] || "";
  const lead = normalize(leadRaw);
  const body = normalize(summary.slice(summary.indexOf(leadRaw) + leadRaw.length));
  const copula = COPULA.exec(lead);
  const title = normalize(card.wikipedia_title);
  const desc = normalize(card.category);
  return {
    title,
    rawTitle: (card.wikipedia_title || "").trim(),
    desc,
    // Définition après "est un/une…" ; à défaut, la première phrase entière (moins fiable)
    def: copula ? lead.slice(copula.index + copula[0].length) : "",
    lead: copula ? "" : lead,
    body,
    // Texte "fort" (titre + description + 1re phrase) utilisé pour les tags par ami
    leadFull: lead,
    focus: `${title} ${desc} ${lead}`,
    all: `${title} ${desc} ${lead} ${body}`,
  };
}

module.exports = {WORD_CHARS, compile, hasKeyword, patternProblem, isColor, normalize, firstMatch, extractFields};
