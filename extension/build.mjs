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

function manifest(target) {
  const m = {
    manifest_version: 3,
    name: "WikiMasters Toolbox",
    version: pkg.version,
    description: "Tri automatique, doublons, échanges, prix, enchères, paquets et familles pour WikiMasters.",
    icons: {16: "icons/16.png", 32: "icons/32.png", 48: "icons/48.png", 128: "icons/128.png"},
    action: {default_popup: "popup.html", default_title: "WikiMasters Toolbox", default_icon: {16: "icons/16.png", 32: "icons/32.png"}},
    permissions: ["storage", "unlimitedStorage"],
    host_permissions: [...SITE_MATCHES, "https://cyrxjeppjqsxxjayfrur.supabase.co/*", "https://fr.wikipedia.org/*"],
    content_scripts: [
      {matches: SITE_MATCHES, js: ["hook.js"], run_at: "document_start", world: "MAIN"},
      {matches: SITE_MATCHES, js: ["content.js"], run_at: "document_start"},
    ],
  };
  if (target === "firefox") {
    m.browser_specific_settings = {
      gecko: {id: "wikimasters-toolbox@leadon", strict_min_version: "128.0", data_collection_permissions: {required: ["none"]}},
    };
  }
  return m;
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
