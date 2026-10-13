// Écriture des étiquettes en base : ordre sûr, lots, reprise après une interruption.
// Partagé par le script Node (scripts/categorize_cards.js) et l'extension (tri, tri des cartes tirées,
// famille → étiquette). Ne fait aucune requête lui-même : l'appelant fournit un `client` :
//
//   listTags()                      → [{id, name, color}] : étiquettes actuelles du joueur
//   createTag({name, color})        → {id, name, color}
//   recolorTag(id, color)
//   insertLinks(rows)               rows : [{user_card_id, tag_id}], ajout qui ignore les doublons
//   deleteLinks(tagId, userCardIds)
//   deleteTag(id)
//
// Les erreurs du client portent `status` (HTTP, 0 = pas de réponse) et, si possible, `code` (PostgREST).
// Toutes les écritures sont idempotentes ou précédées d'une relecture : relancer un plan après une
// interruption termine le travail sans rien créer en double.
"use strict";

const CHUNK = 100;

// Lot refusé à cause d'une ligne (étiquette ou exemplaire supprimé entre-temps, valeur refusée) :
// les autres lignes du lot peuvent passer. Toute autre erreur (réseau, session, serveur, trop de
// requêtes) arrête l'écriture : rejouer ligne par ligne ne ferait que multiplier les échecs.
function isRowError(e) {
  const status = e?.status;
  return status === 400 || status === 409 || status === 422 || /^23/.test(String(e?.code || ""));
}

// L'erreur garde la trace de ce qui a déjà été écrit, pour le message affiché au joueur.
function interrupted(e, progress) {
  if (e && typeof e === "object") e.partial = {...(e.partial || {}), ...progress};
  return e;
}

// Ids des étiquettes `wanted` ({nom: couleur}), créées si besoin. La liste est relue juste avant
// de créer : une étiquette créée par une exécution interrompue, ou en même temps par un autre
// onglet, est réutilisée au lieu d'être créée une deuxième fois.
// known : étiquettes déjà lues par l'appelant (évite la relecture quand rien ne manque).
async function ensureTags(client, wanted, {known = []} = {}) {
  const ids = new Map();
  const take = (tags) => {
    for (const t of tags || []) if (Object.prototype.hasOwnProperty.call(wanted, t.name) && !ids.has(t.name)) ids.set(t.name, t.id);
  };
  const missing = () => Object.keys(wanted).filter((name) => !ids.has(name));
  take(known);
  if (!missing().length) return ids;
  take(await client.listTags());
  for (const name of missing()) {
    const created = await client.createTag({name, color: wanted[name]});
    if (!created?.id) throw new Error(`Création de l'étiquette « ${name} » : réponse inattendue du serveur.`);
    ids.set(name, created.id);
  }
  return ids;
}

// Ajoute les associations par lots. Un lot refusé pour une ligne invalide est rejoué ligne par
// ligne (seules les lignes fautives sont perdues) ; toute autre erreur arrête l'écriture.
async function insertLinks(client, rows, {onProgress, chunkSize = CHUNK} = {}) {
  let inserted = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    onProgress?.(i, rows.length);
    const chunk = rows.slice(i, i + chunkSize);
    try {
      await client.insertLinks(chunk);
      inserted += chunk.length;
      continue;
    } catch (e) {
      if (!isRowError(e)) throw interrupted(e, {inserted, failed});
    }
    for (const row of chunk) {
      try {
        await client.insertLinks([row]);
        inserted++;
      } catch (e) {
        if (!isRowError(e)) throw interrupted(e, {inserted, failed});
        failed++;
      }
    }
  }
  onProgress?.(rows.length, rows.length);
  return {inserted, failed};
}

// Retire les associations : groups = [{tagId, ids}] (suppression par filtre, idempotente).
async function deleteLinks(client, groups, {onProgress, chunkSize = CHUNK} = {}) {
  const total = groups.reduce((n, g) => n + g.ids.length, 0);
  let deleted = 0;
  for (const {tagId, ids} of groups) {
    for (let i = 0; i < ids.length; i += chunkSize) {
      onProgress?.(deleted, total);
      const chunk = ids.slice(i, i + chunkSize);
      try {
        await client.deleteLinks(tagId, chunk);
      } catch (e) {
        throw interrupted(e, {deleted});
      }
      deleted += chunk.length;
    }
  }
  onProgress?.(total, total);
  return deleted;
}

// Applique un plan de core/tag-sync.js : {toInsert, toDelete, extraTagIds, upserts, managed}.
// Ajouts d'abord, suppressions ensuite : une interruption laisse au pire une étiquette en trop.
// onProgress({step: "tags" | "insert" | "delete", done?, total?})
async function applyPlan(client, plan, {onProgress} = {}) {
  const {existing = {}, create = [], recolor = []} = plan.upserts || {};
  onProgress?.({step: "tags"});
  for (const {id, color} of recolor) await client.recolorTag(id, color);

  const wanted = {};
  for (const {name, color} of create) wanted[name] = color;
  for (const {name} of plan.toInsert) if (!(name in wanted)) wanted[name] = plan.managed?.[name] || existing[name]?.color || "#64748b";
  const ids = await ensureTags(client, wanted, {known: Object.values(existing)});

  const rows = [];
  let missingTag = 0;
  for (const {name, userCardId} of plan.toInsert) {
    const tagId = ids.get(name);
    if (tagId) rows.push({user_card_id: userCardId, tag_id: tagId});
    else missingTag++;
  }
  const {inserted, failed} = await insertLinks(client, rows, {onProgress: (done, total) => onProgress?.({step: "insert", done, total})});
  let deleted;
  try {
    deleted = await deleteLinks(client, plan.toDelete || [], {onProgress: (done, total) => onProgress?.({step: "delete", done, total})});
  } catch (e) {
    throw interrupted(e, {inserted, failed});
  }
  for (const id of plan.extraTagIds || []) await client.deleteTag(id);
  return {inserted, failed: failed + missingTag, deleted};
}

module.exports = {isRowError, ensureTags, insertLinks, deleteLinks, applyPlan};
