// API REST Supabase de WikiMasters, avec la session du joueur (la RLS limite l'accès à ses données).
import {request, createLimiter, HttpError} from "../lib/http";
import {ensureSession, decodeJwt} from "../lib/session";
import {on} from "../lib/bus";

const BASE = "https://cyrxjeppjqsxxjayfrur.supabase.co/rest/v1/";
// Clé publique « anon » du site (présente dans son code client). Remplacée par celle observée
// dans les requêtes du site si elle change.
let apikey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5cnhqZXBwanFzeHhqYXlmcnVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4ODAzMzksImV4cCI6MjA4OTQ1NjMzOX0.BZluyXygNxuQGDPxFX1zG5i-cqp10CVK-8GGtuak4Rg";
// Seule une clé publique de ce projet est acceptée (un message de la page ne peut pas en imposer une autre)
const isPublicKey = (key) => /^sb_publishable_[\w-]+$/.test(key) || (decodeJwt(key).role === "anon" && decodeJwt(key).ref === "cyrxjeppjqsxxjayfrur");
on("apikey", (key) => {
  if (isPublicKey(key)) apikey = key;
});

const limit = createLimiter(4);

// prefer : header Prefer de PostgREST ("return=representation", "resolution=ignore-duplicates")
// retries : écritures idempotentes uniquement (ajout ignorant les doublons, suppression par filtre)
export function rest(path, {method = "GET", body, prefer, retries, signal} = {}) {
  return limit(async () => {
    // Session lue au moment d'envoyer : une requête peut attendre longtemps dans la file
    let session = await ensureSession();
    for (let attempt = 1; ; attempt++) {
      try {
        return await request(BASE + path, {
          method,
          body,
          retries,
          signal,
          credentials: "omit",
          timeout: 60000,
          headers: {
            apikey,
            authorization: `Bearer ${session.token}`,
            "content-type": "application/json",
            ...(prefer && {prefer}),
          },
        });
      } catch (e) {
        // Token expiré entre-temps (ou horloge du poste décalée) : la requête a été refusée sans être
        // exécutée, elle peut être rejouée une fois avec une session renouvelée, même une écriture.
        if (e.status !== 401 || attempt > 1) throw e;
        session = await ensureSession({force: true});
      }
    }
  });
}

// Lecture paginée complète (1000 lignes par page). La requête doit être triée sur une clé unique
// (`order=…`) : sans ordre stable, PostgreSQL peut renvoyer une ligne sur deux pages et en omettre
// une autre. key : champ qui dédoublonne les lignes décalées par une écriture pendant la lecture.
export async function fetchAll(query, {pageSize = 1000, onPage, signal, key = null} = {}) {
  const rows = [];
  const seen = new Set();
  const sep = query.includes("?") ? "&" : "?";
  for (let page = 0; ; page++) {
    const batch = await rest(`${query}${sep}limit=${pageSize}&offset=${page * pageSize}`, {signal});
    if (!Array.isArray(batch)) throw new HttpError("Réponse inattendue de la base WikiMasters.", {code: "bad_response"});
    for (const row of batch) {
      const k = key ? row?.[key] : null;
      if (k != null) {
        if (seen.has(k)) continue;
        seen.add(k);
      }
      rows.push(row);
    }
    onPage?.(rows.length);
    if (batch.length < pageSize) return rows;
  }
}

// Lecture filtrée sur une liste d'ids (`colonne=in.(…)`), découpée en lots : une URL trop longue
// est refusée (« Tout ouvrir » peut porter sur des centaines de cartes).
export async function restIn(path, column, ids, {size = 100, ...opts} = {}) {
  const unique = [...new Set(ids)].filter(Boolean);
  const sep = path.includes("?") ? "&" : "?";
  const rows = [];
  for (let i = 0; i < unique.length; i += size) {
    const batch = await rest(`${path}${sep}${column}=in.(${unique.slice(i, i + size).join(",")})`, opts);
    if (!Array.isArray(batch)) throw new HttpError("Réponse inattendue de la base WikiMasters.", {code: "bad_response"});
    rows.push(...batch);
  }
  return rows;
}

// Accès aux étiquettes du joueur pour core/tag-writer.js (ensureTags, insertLinks, applyPlan)
export const tagClient = (userId) => ({
  listTags: () => rest(`tags?select=id,name,color&user_id=eq.${userId}`, {retries: 3}),
  createTag: async ({name, color}) => (await rest("tags?select=id,name,color", {method: "POST", prefer: "return=representation", body: {user_id: userId, name, color}}))?.[0],
  recolorTag: (id, color) => rest(`tags?id=eq.${id}`, {method: "PATCH", body: {color}, retries: 3}),
  insertLinks: (rows) => rest("user_card_tags", {method: "POST", body: rows, prefer: "resolution=ignore-duplicates", retries: 4}),
  deleteLinks: (tagId, ids) => rest(`user_card_tags?tag_id=eq.${tagId}&user_card_id=in.(${ids.join(",")})`, {method: "DELETE", retries: 4}),
  deleteTag: (id) => rest(`tags?id=eq.${id}`, {method: "DELETE", retries: 3}),
});
