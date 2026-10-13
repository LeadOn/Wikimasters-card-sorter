// Plan de synchronisation des tags gérés (thèmes, « Pour : … », Doublon) avec la collection.
// Fonctions pures : la lecture et l'écriture en base sont faites par l'appelant (script Node ou extension).
"use strict";

const {THEME_COLORS, DOUBLON, DOUBLON_COLOR} = require("./themes");
const {tagForProfile} = require("./profiles");
const {categorize} = require("./categorize");

// Tags gérés par l'outil, avec leur couleur : thèmes, puis profils actifs, puis Doublon.
// Les autres tags (créés à la main par le joueur) ne sont jamais touchés.
function managedTags({profiles = [], themeColors = {}} = {}) {
  const tags = {};
  for (const [name, color] of Object.entries(THEME_COLORS)) tags[name] = themeColors[name] || color;
  for (const p of profiles) tags[tagForProfile(p)] = p.color || "#64748b";
  tags[DOUBLON] = themeColors[DOUBLON] || DOUBLON_COLOR;
  return tags;
}

// Tag de thème générique (un seul par carte triée).
const isThemeTag = (name) => Object.prototype.hasOwnProperty.call(THEME_COLORS, name);

// Nombre d'exemplaires de chaque carte : Map(card id → exemplaires), plusieurs lignes ou `count` > 1.
function countCopies(userCards) {
  const copies = new Map();
  for (const uc of userCards)
    if (uc.cards?.id) copies.set(uc.cards.id, (copies.get(uc.cards.id) || 0) + Math.max(1, Number(uc.count) || 1));
  return copies;
}

// userCards : [{id, card_id, count?, cards: {id, wikipedia_title, category, summary, image_url, …}}]
// Renvoie [{userCard, tags}] ; Doublon si la carte est possédée en plusieurs exemplaires
// (plusieurs lignes, ou une ligne dont `count` dépasse 1).
// copies : à fournir (countCopies de toute la collection) quand userCards n'en est qu'une partie,
// sinon deux exemplaires répartis dans deux parties ne seraient pas vus comme un doublon.
function computeAssignments(userCards, {profiles = [], manualMapping = null, copies = countCopies(userCards)} = {}) {
  const assignments = [];
  for (const uc of userCards) {
    if (!uc.cards) continue;
    const tags = categorize(uc.cards, {profiles, manualMapping, userCardId: uc.id});
    if (uc.cards.id && copies.get(uc.cards.id) > 1) tags.push(DOUBLON);
    assignments.push({userCard: uc, tags: [...new Set(tags)]});
  }
  return assignments;
}

// Ids des tags existants portant un nom géré, par nom. Plusieurs tags peuvent porter le même nom :
// le 1er est conservé, les autres sont des doublons à supprimer (mode complet).
function managedTagIds(existingTags, managed) {
  const idsByName = {};
  for (const tag of existingTags) if (tag.name in managed) (idsByName[tag.name] ||= []).push(tag.id);
  return idsByName;
}

// Calcule les associations à ajouter / supprimer (par nom de tag : un tag peut ne pas encore exister).
// current : Map(tagId → Set(userCardId)), associations actuelles des tags gérés.
// Mode complet : toutes les cartes sont resynchronisées sur le résultat du moteur.
// Mode newOnly : seules les cartes sans tag de thème (jamais triées) sont classées ; les cartes
// déjà triées gardent leurs tags (corrections manuelles comprises), sauf Doublon, recalculé partout.
function planChanges(assignments, existingTags, current, {newOnly = false, managed}) {
  const wanted = Object.fromEntries(Object.keys(managed).map((name) => [name, new Set()]));
  for (const {userCard, tags} of assignments) for (const t of tags) wanted[t]?.add(userCard.id);

  const idsByName = managedTagIds(existingTags, managed);

  let fresh = null;
  let inScope = () => true;
  let mayDelete = () => true;
  if (newOnly) {
    const sorted = new Set();
    for (const [name, ids] of Object.entries(idsByName))
      if (isThemeTag(name)) for (const id of ids) for (const ucId of current.get(id) || []) sorted.add(ucId);
    fresh = new Set(assignments.map((a) => a.userCard.id).filter((id) => !sorted.has(id)));
    inScope = (name, ucId) => name === DOUBLON || fresh.has(ucId);
    mayDelete = (name) => name === DOUBLON;
  }

  const toInsert = [];
  const toDelete = [];
  const extraTagIds = [];
  for (const [name, want] of Object.entries(wanted)) {
    const [primary, ...extras] = idsByName[name] || [];
    const have = current.get(primary) || new Set();
    for (const id of want) if (!have.has(id) && inScope(name, id)) toInsert.push({name, userCardId: id});
    const stale = [...have].filter((id) => !want.has(id) && inScope(name, id) && mayDelete(name));
    if (stale.length) toDelete.push({name, tagId: primary, ids: stale});
    if (newOnly) continue;
    for (const id of extras) {
      if (current.get(id)?.size) toDelete.push({name, tagId: id, ids: [...current.get(id)]});
      extraTagIds.push(id);
    }
  }
  return {fresh, toInsert, toDelete, extraTagIds};
}

// Tags à créer ou à recolorer avant d'insérer les associations.
// En mode newOnly, un tag géré absent n'est créé que s'il reçoit au moins une carte
// (un ancien tag supprimé à la main n'est pas recréé pour rien).
function planTagUpserts(existingTags, managed, toInsert, {newOnly = false} = {}) {
  const first = {};
  for (const tag of existingTags) if (tag.name in managed && !first[tag.name]) first[tag.name] = tag;
  const needed = new Set(toInsert.map((i) => i.name));
  const create = [];
  const recolor = [];
  for (const [name, color] of Object.entries(managed)) {
    const tag = first[name];
    if (tag) {
      if (tag.color !== color) recolor.push({id: tag.id, name, color});
    } else if (!newOnly || needed.has(name)) {
      create.push({name, color});
    }
  }
  return {existing: first, create, recolor};
}

// Répartition par tag, dans l'ordre des tags gérés.
function countByTag(assignments, managed) {
  const counts = {};
  for (const a of assignments) for (const t of a.tags) counts[t] = (counts[t] || 0) + 1;
  return Object.keys(managed).filter((n) => counts[n]).map((name) => ({name, count: counts[name]}));
}

module.exports = {managedTags, isThemeTag, countCopies, computeAssignments, managedTagIds, planChanges, planTagUpserts, countByTag};
