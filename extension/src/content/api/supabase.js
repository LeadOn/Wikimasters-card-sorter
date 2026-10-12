// API REST Supabase de WikiMasters, avec la session du joueur (la RLS limite l'accès à ses données).
import {request, createLimiter} from "../lib/http";
import {ensureSession} from "../lib/session";
import {on} from "../lib/bus";

const BASE = "https://cyrxjeppjqsxxjayfrur.supabase.co/rest/v1/";
// Clé publique « anon » du site (présente dans son code client). Remplacée par celle observée
// dans les requêtes du site si elle change.
let apikey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5cnhqZXBwanFzeHhqYXlmcnVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4ODAzMzksImV4cCI6MjA4OTQ1NjMzOX0.BZluyXygNxuQGDPxFX1zG5i-cqp10CVK-8GGtuak4Rg";
on("apikey", (key) => (apikey = key));

const limit = createLimiter(4);

// prefer : header Prefer de PostgREST ("return=representation", "resolution=ignore-duplicates")
// retries : écritures idempotentes uniquement (ajout ignorant les doublons, suppression par filtre)
export async function rest(path, {method = "GET", body, prefer, retries, signal} = {}) {
  const session = await ensureSession();
  return limit(() =>
    request(BASE + path, {
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
    }),
  );
}

// Lecture paginée complète (1000 lignes par page)
export async function fetchAll(query, {pageSize = 1000, onPage, signal} = {}) {
  const rows = [];
  const sep = query.includes("?") ? "&" : "?";
  for (let page = 0; ; page++) {
    const batch = await rest(`${query}${sep}limit=${pageSize}&offset=${page * pageSize}`, {signal});
    rows.push(...batch);
    onPage?.(rows.length);
    if (batch.length < pageSize) return rows;
  }
}
