// Trie la collection Wikimasters : un thème générique par carte, les tags « Pour : … » des profils
// d'intérêts (core/builtin-profiles.js) et le tag Doublon. Le moteur vit dans core/ (partagé avec
// l'extension WikiMasters Toolbox).
//   node scripts/categorize_cards.js [--new-only] [--dry-run]   (voir AGENTS.md)
const fs = require("fs");
const path = require("path");
require("dotenv").config({quiet: true});
const core = require("../core");

const MANUAL_MAPPING_FILE = path.join(__dirname, "manual_mapping_db.json");
const manualMapping = fs.existsSync(MANUAL_MAPPING_FILE) ? JSON.parse(fs.readFileSync(MANUAL_MAPPING_FILE, "utf8")) : null;
const PROFILES = require("../core/builtin-profiles").BUILTIN_PROFILES;

// Tags gérés par ce script, avec leur couleur
const TAG_COLORS = core.managedTags({profiles: PROFILES});

// Classement d'une carte avec les profils de la bande et les corrections manuelles.
const categorize = (card, userCardId) => core.categorize(card, {profiles: PROFILES, manualMapping, userCardId});
const {explain, hasKeyword} = core;

// ---------------------------------------------------------------------------
// Synchronisation Supabase
// ---------------------------------------------------------------------------

// Si SUPABASE_TOKEN n'est pas défini, on lit le token extrait par Playwright dans token.txt (gitignoré)
function readToken() {
  if (process.env.SUPABASE_TOKEN) return process.env.SUPABASE_TOKEN;
  try {
    const raw = fs.readFileSync(path.join(__dirname, "..", "token.txt"), "utf8");
    return raw.replace(/["\s]/g, "");
  } catch (e) {
    return "YOUR_SUPABASE_TOKEN_HERE";
  }
}

// Claims du token (id du joueur, expiration). Vérifiés avant toute requête : un token expiré
// ferait échouer le script au milieu de l'écriture.
function tokenClaims(token = readToken()) {
  let claims = null;
  try {
    claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url"));
  } catch {}
  if (!claims?.sub) throw new Error("Token absent ou illisible : récupérez-en un nouveau dans token.txt (voir AGENTS.md).");
  if (claims.exp * 1000 < Date.now() + 5 * 60 * 1000)
    throw new Error(`Token expiré ou sur le point d'expirer (${new Date(claims.exp * 1000).toLocaleTimeString("fr-FR")}) : récupérez-en un nouveau (voir AGENTS.md).`);
  return claims;
}

const headers = {
  authorization: `Bearer ${readToken()}`,
  ...(process.env.SUPABASE_API_KEY && {apikey: process.env.SUPABASE_API_KEY}),
  "content-type": "application/json",
};

const BASE_URL = "https://cyrxjeppjqsxxjayfrur.supabase.co/rest/v1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const httpError = (message, status, code = null) => Object.assign(new Error(message), {status, code});

// Les lectures et les écritures idempotentes (PATCH, DELETE par filtre, ajout qui ignore les doublons)
// sont réessayées sur les erreurs passagères (réseau, 5xx, 429). Une création n'est jamais rejouée :
// sans réponse, on ne sait pas si elle a eu lieu.
async function api(pathAndQuery, options = {}) {
  const method = options.method || "GET";
  const prefer = options.headers?.Prefer || "";
  const idempotent = method !== "POST" || prefer.includes("resolution=ignore-duplicates");
  const attempts = options.attempts ?? (idempotent ? 4 : 1);
  for (let attempt = 1; ; attempt++) {
    let res;
    let text;
    try {
      res = await fetch(`${BASE_URL}/${pathAndQuery}`, {
        ...options,
        headers: {...headers, ...options.headers},
        signal: AbortSignal.timeout(90000),
      });
      text = await res.text();
    } catch (e) {
      if (attempt >= attempts) throw httpError(`${method} ${pathAndQuery} → pas de réponse (${e.message})`, 0);
      await sleep(2000 * attempt);
      continue;
    }
    if (res.ok) {
      try {
        return text ? JSON.parse(text) : null;
      } catch {
        throw httpError(`${method} ${pathAndQuery} → réponse illisible (${text.slice(0, 80)})`, res.status, "bad_response");
      }
    }
    let code = null;
    try {
      code = JSON.parse(text).code || null;
    } catch {}
    const transient = res.status === 408 || res.status === 429 || res.status >= 500;
    if (!transient || attempt >= attempts) throw httpError(`${method} ${pathAndQuery} → ${res.status} ${text.slice(0, 300)}`, res.status, code);
    await sleep(2000 * attempt);
  }
}

// Lecture paginée complète. La requête doit être triée sur une clé unique (`order=…`) : sans ordre
// stable, PostgreSQL peut renvoyer une ligne sur deux pages et en omettre une autre. `key` dédoublonne
// en plus les lignes déplacées d'une page à l'autre par une écriture pendant la lecture.
async function fetchAll(query, {key = null} = {}) {
  const rows = [];
  const seen = new Set();
  for (let page = 0; ; page++) {
    const batch = await api(`${query}&limit=1000&offset=${page * 1000}`);
    if (!Array.isArray(batch)) throw new Error(`${query} : réponse inattendue du serveur.`);
    for (const row of batch) {
      if (key && row[key] != null) {
        if (seen.has(row[key])) continue;
        seen.add(row[key]);
      }
      rows.push(row);
    }
    if (batch.length < 1000) return rows;
  }
}

// Associations actuelles d'un tag. Lecture tag par tag : une lecture globale dépasse le délai du serveur.
async function readTagged(tagId) {
  const rows = await fetchAll(`user_card_tags?select=user_card_id&tag_id=eq.${tagId}&order=user_card_id.asc`);
  return new Set(rows.map((r) => r.user_card_id));
}

// Accès aux étiquettes pour core/tag-writer.js
const tagClient = (userId) => ({
  listTags: () => api(`tags?select=id,name,color&user_id=eq.${userId}`),
  createTag: async ({name, color}) =>
    (await api("tags?select=*", {method: "POST", headers: {Prefer: "return=representation"}, body: JSON.stringify({user_id: userId, name, color})}))?.[0],
  recolorTag: (id, color) => api(`tags?id=eq.${id}`, {method: "PATCH", body: JSON.stringify({color})}),
  insertLinks: (rows) => api("user_card_tags", {method: "POST", headers: {Prefer: "resolution=ignore-duplicates"}, body: JSON.stringify(rows)}),
  deleteLinks: (tagId, ids) => api(`user_card_tags?tag_id=eq.${tagId}&user_card_id=in.(${ids.join(",")})`, {method: "DELETE"}),
  deleteTag: (id) => api(`tags?id=eq.${id}`, {method: "DELETE"}),
});

async function processCards({dryRun = false, newOnly = false} = {}) {
  const userId = tokenClaims().sub;
  console.log("Fetching tags and cards...");
  const existingTags = await api(`tags?select=*&user_id=eq.${userId}`);
  const userCards = await fetchAll(`user_cards?select=*,cards(*)&user_id=eq.${userId}&order=id.asc`, {key: "id"});

  const assignments = core.computeAssignments(userCards, {profiles: PROFILES, manualMapping});

  console.log("Reading current automatic tag assignments...");
  const current = new Map();
  for (const ids of Object.values(core.managedTagIds(existingTags, TAG_COLORS)))
    for (const id of ids) current.set(id, await readTagged(id));
  const {fresh, toInsert, toDelete, extraTagIds} = core.planChanges(assignments, existingTags, current, {
    newOnly,
    managed: TAG_COLORS,
  });

  const scoped = fresh ? assignments.filter((a) => fresh.has(a.userCard.id)) : assignments;
  console.log(
    fresh
      ? `${fresh.size} carte(s) non triée(s) sur ${userCards.length} :`
      : `${userCards.length} cartes classées :`,
  );
  for (const {name, count} of core.countByTag(scoped, TAG_COLORS)) console.log(`  ${String(count).padStart(5)}  ${name}`);

  const title = new Map(userCards.map((uc) => [uc.id, uc.cards?.wikipedia_title]));
  if (fresh) for (const {userCard, tags} of scoped) console.log(`  + ${userCard.cards.wikipedia_title} → ${tags.join(", ")}`);
  const doublonAdds = toInsert.filter((i) => i.name === core.DOUBLON && !fresh?.has(i.userCardId));
  const doublonDels = toDelete.filter((d) => d.name === core.DOUBLON).flatMap((d) => d.ids);
  for (const i of doublonAdds) console.log(`  + Doublon : ${title.get(i.userCardId)}`);
  for (const id of doublonDels) console.log(`  - Doublon : ${title.get(id)}`);
  const deleteCount = toDelete.reduce((n, d) => n + d.ids.length, 0);
  console.log(`${toInsert.length} association(s) à ajouter, ${deleteCount} à supprimer.`);

  if (dryRun) {
    const report = scoped.map(({userCard: uc, tags}) => ({
      user_card_id: uc.id,
      title: uc.cards.wikipedia_title,
      category: uc.cards.category,
      tags,
    }));
    const out = path.join(__dirname, "..", "dry-run.json");
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(`Dry run : aucune écriture en base. Détail dans ${out}`);
    return;
  }

  // Seuls les tags gérés (TAG_COLORS) sont mis à jour : les tags créés à la main
  // par l'utilisateur et leurs associations ne sont jamais touchés.
  const unmanaged = existingTags.filter((t) => !(t.name in TAG_COLORS)).map((t) => t.name);
  if (unmanaged.length) console.log(`Tags personnels conservés : ${unmanaged.join(", ")}`);

  // Ajouts d'abord, suppressions ensuite, en ne relisant que les différences (core/tag-writer.js) :
  // si le script s'interrompt, une carte a au pire un tag en trop, et le relancer termine le travail.
  const upserts = core.planTagUpserts(existingTags, TAG_COLORS, toInsert, {newOnly});
  let lastStep = null;
  let result;
  try {
    result = await core.applyPlan(tagClient(userId), {toInsert, toDelete, extraTagIds, upserts, managed: TAG_COLORS}, {
      onProgress: ({step, done, total}) => {
        if (step !== lastStep) console.log({tags: "Mise à jour des tags...", insert: "Ajout des associations...", delete: "Retrait des associations obsolètes..."}[step]);
        lastStep = step;
        if (total && done && done % 1000 === 0) console.log(`  ${done}/${total}`);
      },
    });
  } catch (e) {
    const p = e.partial || {};
    console.error(`Écriture interrompue (${p.inserted ?? 0} ajout(s), ${p.deleted ?? 0} retrait(s) faits) : relancez la même commande pour terminer.`);
    throw e;
  }
  const {failed} = result;
  console.log(failed ? `Terminé avec ${failed} ajout(s) en échec.` : "Synchronisation terminée.");
}

if (require.main === module)
  processCards({
    dryRun: process.argv.includes("--dry-run"),
    newOnly: process.argv.includes("--new-only"),
  }).catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
module.exports = {categorize, explain, hasKeyword, readToken, tokenClaims, api, fetchAll, TAG_COLORS};
