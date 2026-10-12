// Cherche dans la collection d'un ami les cartes intéressantes à échanger, avec le même
// moteur de classification que categorize_cards.js.
//   node scripts/trade_finder.js                       → liste des amis
//   node scripts/trade_finder.js <ami>                 → cartes qui correspondent à mon tag « Pour : <moi> »
//   node scripts/trade_finder.js <ami> --theme Sciences,"Atome & Chimie"
//   options : --rarity L,UR (filtre côté serveur, bien plus rapide) · --refresh (ignore le cache)
//             --limit N (lignes par section dans la console, 25 par défaut)
// La collection de l'ami est mise en cache dans cache/ (gitignoré) : le site renvoie 50 cartes
// par page et met jusqu'à 30 s par page (≈ 20 min pour 16 000 cartes, 8 pages en parallèle).
// Un rapport HTML est écrit dans trade-<ami>.html.
const fs = require("fs");
const path = require("path");
const {readToken, api, fetchAll, TAG_COLORS} = require("./categorize_cards");
const {findTrades, BUILTIN_PROFILES} = require("../core");

const SITE = "https://www.wiki-masters.com";
const ROOT = path.join(__dirname, "..");
const CACHE_DIR = path.join(ROOT, "cache");
const CACHE_MAX_AGE_H = 12;
const CONCURRENCY = 8;
const RARITY_LABEL = {L: "Légendaire", UR: "Ultra Rare", SR: "Super Rare", R: "Rare", PC: "Peu commune", C: "Commune"};

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {friend: null, themes: null, rarities: [], refresh: false, limit: 25};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => argv[++i] || "";
    if (a === "--theme") opts.themes = value().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--rarity") opts.rarities = value().toUpperCase().split(",").filter(Boolean);
    else if (a === "--refresh") opts.refresh = true;
    else if (a === "--limit") opts.limit = Number(value()) || opts.limit;
    else if (!a.startsWith("--")) opts.friend = a;
  }
  return opts;
}

// Noms de thèmes saisis à la main ("sciences", "atome") → noms exacts de TAG_COLORS
function resolveThemes(names) {
  const themes = Object.keys(TAG_COLORS).filter((t) => t !== "Doublon");
  return names.map((n) => {
    const q = n.toLowerCase();
    const found = themes.find((t) => t.toLowerCase() === q) || themes.find((t) => t.toLowerCase().includes(q));
    if (!found) throw new Error(`Thème inconnu : "${n}". Thèmes possibles : ${themes.join(", ")}`);
    return found;
  });
}

// Tag « Pour : X » correspondant à un pseudo (insensible à la casse), ou null
const friendTagFor = (username) =>
  Object.keys(TAG_COLORS).find((t) => t.toLowerCase() === `pour : ${username.toLowerCase()}`) || null;

// ---------------------------------------------------------------------------
// API du site (routes Next.js) : authentifiées par le cookie de session @supabase/ssr,
// qu'on reconstruit à partir du token (le Bearer n'est pas accepté).
// ---------------------------------------------------------------------------

const token = readToken();
const claims = (() => {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url"));
  } catch {
    throw new Error("Token invalide : récupérez-en un nouveau dans token.txt (voir AGENTS.md).");
  }
})();
if (claims.exp * 1000 < Date.now()) throw new Error("Token expiré : récupérez-en un nouveau (voir AGENTS.md).");

const sessionCookie = (() => {
  const session = {
    access_token: token,
    token_type: "bearer",
    expires_in: claims.exp - Math.floor(Date.now() / 1000),
    expires_at: claims.exp,
    refresh_token: "",
    user: {id: claims.sub},
  };
  return `sb-cyrxjeppjqsxxjayfrur-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
})();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Le serveur renvoie souvent des 500 / 502 / 525 passagers : on réessaie avec un délai croissant.
async function retry(fn, attempts = 8) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts || /\b40[13]\b/.test(e.message)) throw e;
      await sleep(Math.min(30000, 2000 * i));
    }
  }
}

async function site(pathAndQuery) {
  return retry(async () => {
    const res = await fetch(`${SITE}${pathAndQuery}`, {headers: {cookie: sessionCookie}});
    if (!res.ok) throw new Error(`GET ${pathAndQuery} → ${res.status} ${(await res.text()).slice(0, 120)}`);
    return res.json();
  });
}

async function friendsList() {
  const {friendships = []} = await site("/api/friends");
  return friendships
    .filter((f) => f.status === "accepted")
    .map((f) => (f.requester?.id === claims.sub ? f.addressee : f.requester))
    .filter(Boolean);
}

async function myUsername() {
  const {friendships = []} = await site("/api/friends");
  for (const f of friendships) {
    if (f.requester?.id === claims.sub) return f.requester.username;
    if (f.addressee?.id === claims.sub) return f.addressee.username;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Collection de l'ami (paginée, mise en cache page par page pour reprendre après une interruption)
// ---------------------------------------------------------------------------

async function pool(items, size, fn) {
  const queue = [...items];
  await Promise.all(
    Array.from({length: size}, async () => {
      while (queue.length) await fn(queue.shift());
    }),
  );
}

async function fetchFriendCollection(username, {rarities, refresh}) {
  fs.mkdirSync(CACHE_DIR, {recursive: true});
  const suffix = rarities.length ? `-${[...rarities].sort().join("-")}` : "";
  const file = path.join(CACHE_DIR, `${username.toLowerCase()}${suffix}.json`);
  let cache = !refresh && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
  const ageH = cache ? (Date.now() - new Date(cache.fetched_at)) / 3.6e6 : Infinity;
  if (cache && ageH > CACHE_MAX_AGE_H) cache = null;

  const query = (page) => {
    const q = new URLSearchParams({page: String(page), sort: "rarity", stats: page === 0 ? "1" : "0", pending: "1"});
    for (const r of rarities) q.append("rarity", r);
    return `/api/profile/${encodeURIComponent(username)}/collection?${q}`;
  };
  const compact = (it) => ({
    id: it.id,
    card_id: it.card_id,
    count: it.count || 1,
    is_shiny: Boolean(it.is_shiny),
    card: {
      wikipedia_title: it.card?.wikipedia_title,
      category: it.card?.category,
      rarity: it.card?.rarity,
      image_url: it.card?.hide_image ? null : it.card?.image_url,
      wikipedia_url: it.card?.wikipedia_url,
      pageviews: it.card?.pageviews,
    },
  });

  if (!cache) {
    const first = await site(query(0));
    const pageSize = (first.collection || []).length || 50;
    cache = {
      fetched_at: new Date().toISOString(),
      total: first.total ?? 0,
      pageSize,
      pageCount: Math.ceil((first.total ?? 0) / pageSize),
      pendingTradeCardIds: first.pendingTradeCardIds || [],
      pages: {0: (first.collection || []).map(compact)},
      summaries: {},
    };
  }
  const save = () => fs.writeFileSync(file, JSON.stringify(cache));
  save();

  const missing = [];
  for (let p = 0; p < cache.pageCount; p++) if (!cache.pages[p]) missing.push(p);
  if (missing.length) {
    console.log(
      `Collection de ${username} : ${cache.total} cartes, ${missing.length} page(s) à télécharger` +
        ` (≈ ${Math.ceil((missing.length * 35) / CONCURRENCY / 60)} min, reprise possible en cas d'interruption)...`,
    );
    let done = 0;
    await pool(missing, CONCURRENCY, async (p) => {
      const res = await site(query(p));
      cache.pages[p] = (res.collection || []).map(compact);
      save();
      if (++done % 20 === 0 || done === missing.length) console.log(`  ${done}/${missing.length} pages`);
    });
  } else {
    console.log(`Collection de ${username} : ${cache.total} cartes (cache de ${ageH.toFixed(1)} h, --refresh pour la recharger)`);
  }

  // La pagination par offset peut renvoyer deux fois la même carte si la collection bouge pendant le téléchargement
  const items = new Map();
  for (const page of Object.values(cache.pages)) for (const it of page) items.set(it.id, it);
  return {cache, save, items: [...items.values()]};
}

// Résumés Wikipédia (absents de la route du site) : lus dans la table `cards`, au mieux.
// Sans résumé, le moteur se fie à la description et au titre (≈ 92 % de bons thèmes au lieu de 99 %).
async function loadSummaries(cardIds, cache, save) {
  const todo = [...new Set(cardIds)].filter((id) => !(id in cache.summaries));
  if (!todo.length) return;
  console.log(`Lecture des résumés de ${todo.length} carte(s)...`);
  const batches = [];
  for (let i = 0; i < todo.length; i += 100) batches.push(todo.slice(i, i + 100));
  let failed = 0;
  await pool(batches, CONCURRENCY, async (ids) => {
    try {
      const rows = await retry(() => api(`cards?select=id,summary&id=in.(${ids.join(",")})`), 4);
      // Tronqué : au-delà de la 1re phrase, le résumé ne sert qu'à départager (×0,5), et le cache reste léger
      for (const r of rows) cache.summaries[r.id] = (r.summary || "").slice(0, 1000);
      save();
    } catch {
      failed += ids.length;
    }
  });
  if (failed) console.log(`  ${failed} résumé(s) illisible(s) : ces cartes sont classées sur leur description seule.`);
}

// ---------------------------------------------------------------------------
// Analyse
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const friends = await friendsList();
  if (!opts.friend) {
    console.log("Amis :");
    for (const f of friends) console.log(`  ${f.username}${friendTagFor(f.username) ? "" : "  (pas de tag « Pour : … »)"}`);
    console.log('\nUsage : node scripts/trade_finder.js <ami> [--theme "Sciences,Histoire"] [--rarity L,UR] [--refresh]');
    return;
  }
  const friend = friends.find((f) => f.username.toLowerCase() === opts.friend.toLowerCase());
  if (!friend) throw new Error(`"${opts.friend}" ne fait pas partie de vos amis (${friends.map((f) => f.username).join(", ")}).`);

  // Ce que je cherche : les thèmes demandés, sinon mon propre tag « Pour : <moi> »
  const me = await myUsername();
  const myTag = me && friendTagFor(me);
  const themes = opts.themes ? resolveThemes(opts.themes) : null;
  if (!themes && !myTag)
    throw new Error(`Aucun tag « Pour : ${me} » dans categorize_cards.js : précisez les thèmes voulus avec --theme.`);
  const wanted = themes || [myTag];
  const friendTag = friendTagFor(friend.username);

  console.log("Lecture de ma collection et de ma liste de souhaits...");
  const [mine, wishlist] = await Promise.all([
    retry(() =>
      fetchAll("user_cards?select=id,card_id,cards(id,wikipedia_title,category,summary,rarity,image_url,wikipedia_url,pageviews)"),
    ),
    retry(() => api("wishlist_items?select=card_id")).catch(() => []),
  ]);
  const myCopies = new Map();
  for (const uc of mine) myCopies.set(uc.card_id, (myCopies.get(uc.card_id) || 0) + 1);
  const wished = new Set(wishlist.map((w) => w.card_id));

  const {cache, save, items} = await fetchFriendCollection(friend.username, opts);
  const pending = new Set(cache.pendingTradeCardIds);

  // --- À demander / à proposer : même moteur que l'extension (core/trade.js)
  const notMine = items.filter((it) => !myCopies.has(it.card_id));
  await loadSummaries(notMine.map((it) => it.card_id), cache, save);
  const {toAsk, toOffer} = findTrades({
    mine,
    friendItems: items,
    summaries: new Map(Object.entries(cache.summaries)),
    wishlist: wished,
    pending,
    wanted,
    friendTag,
    profiles: BUILTIN_PROFILES,
    rarities: opts.rarities,
  });

  // --- Console
  const line = (c, extra) =>
    `  ${(c.card.rarity || "?").padEnd(2)} ${c.card.wikipedia_title}  [${c.theme}]${extra ? `  ${extra}` : ""}`;
  console.log(`\n=== À demander à ${friend.username} : ${toAsk.length} carte(s) (${wanted.join(", ")}${wished.size ? " + liste de souhaits" : ""}) ===`);
  for (const [theme, n] of countBy(toAsk, (c) => c.theme)) console.log(`  ${String(n).padStart(5)}  ${theme}`);
  console.log("");
  for (const c of toAsk.slice(0, opts.limit)) {
    const flags = [c.wished && "♥ souhaitée", c.spare && `${c.count} ex. chez ${friend.username}`, c.is_shiny && "✨", c.pending && "échange en cours"];
    console.log(line(c, flags.filter(Boolean).join(" · ")));
  }
  if (toAsk.length > opts.limit) console.log(`  … ${toAsk.length - opts.limit} autre(s) dans le rapport HTML`);

  console.log(
    `\n=== À proposer à ${friend.username} : ${toOffer.length} carte(s) (${friendTag || "mes doublons qu'il n'a pas"}) ===`,
  );
  for (const c of toOffer.slice(0, opts.limit)) console.log(line(c, c.spare ? `${c.copies} ex. chez moi` : ""));
  if (toOffer.length > opts.limit) console.log(`  … ${toOffer.length - opts.limit} autre(s) dans le rapport HTML`);

  const out = path.join(ROOT, `trade-${friend.username.toLowerCase()}.html`);
  fs.writeFileSync(out, renderHtml({friend: friend.username, wanted, friendTag, toAsk, toOffer, cache}));
  console.log(`\nRapport : ${out}`);
}

function countBy(list, key) {
  const m = new Map();
  for (const x of list) m.set(key(x), (m.get(key(x)) || 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]);
}

// ---------------------------------------------------------------------------
// Rapport HTML (autonome, gitignoré)
// ---------------------------------------------------------------------------

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"})[c]);

function renderHtml({friend, wanted, friendTag, toAsk, toOffer, cache}) {
  const card = (c, badges) => `
    <a class="card r-${esc(c.card.rarity)}" href="${esc(c.card.wikipedia_url)}" target="_blank" rel="noopener"
       data-theme="${esc(c.theme)}" data-text="${esc(`${c.card.wikipedia_title} ${c.card.category || ""}`.toLowerCase())}">
      ${c.card.image_url ? `<img loading="lazy" src="${esc(c.card.image_url)}" alt="">` : `<div class="noimg"></div>`}
      <div class="body">
        <div class="title">${esc(c.card.wikipedia_title)}</div>
        <div class="desc">${esc(c.card.category || "")}</div>
        <div class="badges"><span class="rarity">${esc(RARITY_LABEL[c.card.rarity] || c.card.rarity || "?")}</span>
          <span class="theme" style="--c:${TAG_COLORS[c.theme] || "#6b7280"}">${esc(c.theme)}</span>
          ${badges.filter(Boolean).map((b) => `<span class="flag">${esc(b)}</span>`).join("")}</div>
      </div>
    </a>`;
  const section = (id, title, list, badges) => `
    <section id="${id}">
      <h2>${esc(title)} <small>${list.length}</small></h2>
      <div class="chips">${countBy(list, (c) => c.theme)
        .map(([t, n]) => `<button data-theme="${esc(t)}">${esc(t)} · ${n}</button>`)
        .join("")}</div>
      <div class="grid">${list.map((c) => card(c, badges(c))).join("")}</div>
    </section>`;
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Échanges avec ${esc(friend)}</title>
<style>
  :root { --bg:#f7f7f8; --fg:#18181b; --muted:#71717a; --card:#fff; --line:#e4e4e7; }
  @media (prefers-color-scheme: dark) { :root { --bg:#18181b; --fg:#f4f4f5; --muted:#a1a1aa; --card:#27272a; --line:#3f3f46; } }
  * { box-sizing:border-box; } body { margin:0; padding:24px 16px; font:14px/1.4 system-ui, sans-serif; background:var(--bg); color:var(--fg); }
  main { max-width:1200px; margin:0 auto; } h1 { margin:0 0 4px; } .meta { color:var(--muted); margin-bottom:16px; }
  input { width:100%; padding:10px 12px; border:1px solid var(--line); border-radius:8px; background:var(--card); color:var(--fg); font:inherit; }
  h2 small { color:var(--muted); font-weight:normal; } section { margin-top:28px; }
  .chips { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; }
  .chips button { border:1px solid var(--line); background:var(--card); color:var(--fg); border-radius:999px; padding:4px 10px; cursor:pointer; font:inherit; font-size:12px; }
  .chips button.on { background:var(--fg); color:var(--bg); }
  .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:12px; }
  .card { display:flex; gap:10px; padding:10px; background:var(--card); border:1px solid var(--line); border-left-width:4px; border-radius:8px; color:inherit; text-decoration:none; }
  .card:hover { border-color:var(--muted); }
  .r-L { border-left-color:#f59e0b; } .r-UR { border-left-color:#a855f7; } .r-SR { border-left-color:#3b82f6; }
  img, .noimg { width:56px; height:72px; object-fit:cover; border-radius:4px; flex:none; background:var(--line); }
  .body { min-width:0; } .title { font-weight:600; } .desc { color:var(--muted); font-size:12px; margin:2px 0 6px; }
  .badges { display:flex; flex-wrap:wrap; gap:4px; } .badges span { font-size:11px; padding:1px 6px; border-radius:4px; background:var(--line); }
  .theme { background:color-mix(in srgb, var(--c) 25%, transparent) !important; } .flag { background:#fde68a !important; color:#18181b; }
  .hidden { display:none; }
</style></head><body><main>
<h1>Échanges avec ${esc(friend)}</h1>
<div class="meta">Collection de ${esc(friend)} lue le ${new Date(cache.fetched_at).toLocaleString("fr-FR")} (${cache.total} cartes).
Cartes recherchées : ${esc(wanted.join(", "))}.</div>
<input id="q" type="search" placeholder="Filtrer par titre ou description…">
${section("ask", `À demander à ${friend}`, toAsk, (c) => [
  c.wished && "♥ souhaitée",
  c.spare && `${c.count} ex. chez ${friend}`,
  c.is_shiny && "✨ shiny",
  c.pending && "échange en cours",
])}
${section("offer", `À proposer à ${friend} (${friendTag || "mes doublons"})`, toOffer, (c) => [c.spare && `${c.copies} ex. chez moi`])}
</main>
<script>
  const q = document.getElementById("q");
  const active = new Map();
  function apply() {
    const text = q.value.trim().toLowerCase();
    document.querySelectorAll("section").forEach((s) => {
      const theme = active.get(s.id);
      s.querySelectorAll(".card").forEach((c) => {
        c.classList.toggle("hidden", (theme && c.dataset.theme !== theme) || (text && !c.dataset.text.includes(text)));
      });
    });
  }
  document.querySelectorAll(".chips button").forEach((b) => b.addEventListener("click", () => {
    const s = b.closest("section").id;
    const on = active.get(s) === b.dataset.theme;
    active.set(s, on ? null : b.dataset.theme);
    b.parentElement.querySelectorAll("button").forEach((x) => x.classList.toggle("on", !on && x === b));
    apply();
  }));
  q.addEventListener("input", apply);
</script></body></html>`;
}

main().catch((e) => {
  console.error(e.message || e);
  process.exitCode = 1;
});
