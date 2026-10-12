// Assemble dist/dev-inject.js (imitation de l'API d'extension + hook + script de contenu), à injecter
// dans une page wiki-masters.com ouverte avec Playwright pour tester l'interface sans installer l'extension.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const out = [read("extension/dev/shim.js"), read("dist/chrome/hook.js"), read("dist/chrome/content.js")].join("\n;\n");
fs.writeFileSync(path.join(root, "dist/dev-inject.js"), out);
console.log("dist/dev-inject.js", (out.length / 1024).toFixed(0), "Ko");
