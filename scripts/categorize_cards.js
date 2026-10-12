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
const PROFILES = core.BUILTIN_PROFILES;

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

const headers = {
  authorization: `Bearer ${readToken()}`,
  ...(process.env.SUPABASE_API_KEY && {apikey: process.env.SUPABASE_API_KEY}),
  "content-type": "application/json",
};

const BASE_URL = "https://cyrxjeppjqsxxjayfrur.supabase.co/rest/v1";

async function api(pathAndQuery, options = {}) {
  const res = await fetch(`${BASE_URL}/${pathAndQuery}`, {
    ...options,
    headers: {...headers, ...options.headers},
  });
  if (!res.ok)
    throw new Error(`${options.method || "GET"} ${pathAndQuery} → ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function fetchAll(query) {
  let rows = [];
  for (let page = 0; ; page++) {
    const batch = await api(`${query}&limit=1000&offset=${page * 1000}`);
    rows = rows.concat(batch);
    if (batch.length < 1000) return rows;
  }
}

// Associations actuelles d'un tag. Lecture tag par tag : une lecture globale dépasse le délai du serveur.
async function readTagged(tagId) {
  const rows = await fetchAll(`user_card_tags?select=user_card_id&tag_id=eq.${tagId}`);
  return new Set(rows.map((r) => r.user_card_id));
}

async function processCards({dryRun = false, newOnly = false} = {}) {
  console.log("Fetching tags and cards...");
  const existingTags = await api("tags?select=*");
  const userCards = await fetchAll("user_cards?select=*,cards(*)");
  const userId = existingTags[0]?.user_id || userCards[0]?.user_id;
  if (!userId) throw new Error("Impossible de déterminer l'utilisateur (aucun tag ni carte).");

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

  const {existing, create, recolor} = core.planTagUpserts(existingTags, TAG_COLORS, toInsert, {newOnly});
  const tagMap = {...existing};
  for (const {id, color} of recolor) await api(`tags?id=eq.${id}`, {method: "PATCH", body: JSON.stringify({color})});
  for (const {name, color} of create) {
    const [created] = await api("tags?select=*", {
      method: "POST",
      headers: {Prefer: "return=representation"},
      body: JSON.stringify({user_id: userId, name, color}),
    });
    tagMap[name] = created;
  }

  // On n'écrit que les différences avec l'existant (la base est lente et une suppression
  // massive peut dépasser le délai du serveur). Ajouts d'abord, suppressions ensuite :
  // si le script s'interrompt, une carte a au pire un tag en trop, jamais un tag en moins.
  const rows = toInsert.map((i) => ({user_card_id: i.userCardId, tag_id: tagMap[i.name].id}));
  let failed = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    try {
      await api("user_card_tags", {
        method: "POST",
        headers: {Prefer: "resolution=ignore-duplicates"},
        body: JSON.stringify(chunk),
      });
    } catch (e) {
      // Un lot refusé : on réessaie ligne par ligne pour ne perdre que les lignes fautives
      for (const item of chunk) {
        try {
          await api("user_card_tags", {
            method: "POST",
            headers: {Prefer: "resolution=ignore-duplicates"},
            body: JSON.stringify([item]),
          });
        } catch (err) {
          failed++;
          if (failed <= 5) console.error(err.message);
        }
      }
    }
  }

  for (const {tagId, ids} of toDelete) {
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100).join(",");
      await api(`user_card_tags?tag_id=eq.${tagId}&user_card_id=in.(${chunk})`, {method: "DELETE"});
    }
  }
  for (const id of extraTagIds) await api(`tags?id=eq.${id}`, {method: "DELETE"});

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
module.exports = {categorize, explain, hasKeyword, readToken, api, fetchAll, TAG_COLORS};
