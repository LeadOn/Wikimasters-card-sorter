// Build de WikiMasters Toolbox : esbuild → dist/chrome et dist/firefox (+ .zip avec --zip).
//   node extension/build.mjs [--watch] [--zip]
import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {execFileSync} from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const dist = path.join(root, "dist");
const watch = process.argv.includes("--watch");
const zip = process.argv.includes("--zip");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const SITE_MATCHES = ["https://www.wiki-masters.com/*", "https://wiki-masters.com/*"];
// Chrome : les requêtes d'un script de contenu suivent les règles CORS de la page, et Supabase
// (le site l'appelle lui-même) comme les API de Wikimedia (origin=*) les autorisent. Aucune
// permission d'hôte n'est donc demandée pour eux (moins d'alertes, examen du Web Store plus simple).
// Firefox : conservées, ses scripts de contenu n'appliquent pas les mêmes règles.
const FIREFOX_EXTRA_HOSTS = [
  "https://cyrxjeppjqsxxjayfrur.supabase.co/*",
  // Images manquantes (option) : API de Wikipédia (le français, l'anglais et, par les liens de
  // Wikidata, d'autres langues) et de Wikidata (les images viennent de Wikimedia Commons)
  "https://*.wikipedia.org/*",
  "https://www.wikidata.org/*",
];

// Description de l'extension dans la langue du navigateur (_locales), anglais à défaut, comme l'interface.
// 132 caractères au plus (Chrome Web Store).
const LOCALES = {
  en: {description: "Unofficial tools for WikiMasters: card sorting, market prices, filters, trades, auctions, packs, families and achievements."},
  fr: {description: "Outils non officiels pour WikiMasters : tri des cartes, prix du marché, filtres, échanges, enchères, paquets, familles et succès."},
};

function writeLocales(out) {
  for (const [lang, messages] of Object.entries(LOCALES)) {
    const dir = path.join(out, "_locales", lang);
    fs.mkdirSync(dir, {recursive: true});
    const json = Object.fromEntries(Object.entries(messages).map(([k, message]) => [k, {message}]));
    fs.writeFileSync(path.join(dir, "messages.json"), JSON.stringify(json, null, 2));
  }
}

function manifest(target) {
  const m = {
    manifest_version: 3,
    name: "WikiMasters Toolbox",
    version: pkg.version,
    default_locale: "en",
    description: "__MSG_description__",
    icons: {16: "icons/16.png", 32: "icons/32.png", 48: "icons/48.png", 128: "icons/128.png"},
    action: {default_popup: "popup.html", default_title: "WikiMasters Toolbox", default_icon: {16: "icons/16.png", 32: "icons/32.png"}},
    permissions: ["storage", "unlimitedStorage"],
    host_permissions: [...SITE_MATCHES, ...(target === "firefox" ? FIREFOX_EXTRA_HOSTS : [])],
    content_scripts: [
      {matches: SITE_MATCHES, js: ["hook.js"], run_at: "document_start", world: "MAIN"},
      {matches: SITE_MATCHES, js: ["content.js"], run_at: "document_start"},
    ],
    // Polices de l'interface : chargées par une règle @font-face ajoutée à la page du site
    web_accessible_resources: [{resources: ["fonts/*.woff2"], matches: SITE_MATCHES}],
  };
  // Scripts de contenu dans le « monde principal » (Chrome 111+) ; build ciblé sur Chrome 120
  if (target === "chrome") m.minimum_chrome_version = "120";
  if (target === "firefox") {
    m.browser_specific_settings = {
      gecko: {id: "wikimasters-toolbox@leadon", strict_min_version: "128.0", data_collection_permissions: {required: ["none"]}},
    };
  }
  return m;
}

// Polices de l'interface (IBM Plex, licence OFL jointe), copiées depuis node_modules
const FONTS = {
  "plex-sans.woff2": "@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2",
  "plex-mono-400.woff2": "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2",
  "plex-mono-500.woff2": "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2",
  "plex-mono-600.woff2": "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2",
  "OFL-plex-sans.txt": "@fontsource-variable/ibm-plex-sans/LICENSE",
  "OFL-plex-mono.txt": "@fontsource/ibm-plex-mono/LICENSE",
};

function copyFonts(out) {
  const dir = path.join(out, "fonts");
  fs.mkdirSync(dir, {recursive: true});
  for (const [name, from] of Object.entries(FONTS)) fs.copyFileSync(path.join(root, "node_modules", from), path.join(dir, name));
}

const entries = {
  hook: "extension/src/hook/main-world.js",
  content: "extension/src/content/index.jsx",
  popup: "extension/src/popup/popup.jsx",
};

async function buildTarget(target) {
  const out = path.join(dist, target);
  fs.rmSync(out, {recursive: true, force: true});
  fs.mkdirSync(out, {recursive: true});
  fs.cpSync(path.join(here, "static"), out, {recursive: true});
  copyFonts(out);
  writeLocales(out);
  fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest(target), null, 2));
  const options = {
    absWorkingDir: root,
    entryPoints: entries,
    outdir: out,
    bundle: true,
    format: "iife",
    target: ["chrome120", "firefox128"],
    jsx: "automatic",
    jsxImportSource: "preact",
    loader: {".css": "text"},
    define: {__TARGET__: JSON.stringify(target), __VERSION__: JSON.stringify(pkg.version)},
    minify: !watch,
    sourcemap: watch ? "inline" : false,
    legalComments: "none",
    logLevel: "info",
  };
  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
  } else {
    await esbuild.build(options);
    if (zip) {
      const file = path.join(dist, `wikimasters-toolbox-${target}-${pkg.version}.zip`);
      fs.rmSync(file, {force: true});
      execFileSync("zip", ["-qr", file, "."], {cwd: out});
      console.log(`→ ${path.relative(root, file)}`);
    }
  }
}

await buildTarget("chrome");
await buildTarget("firefox");
