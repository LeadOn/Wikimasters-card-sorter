// Charge un module de l'extension dans Node pour les tests : esbuild le regroupe en CommonJS
// (les sources de l'extension sont des modules ES aux imports sans extension). Chaque appel
// renvoie une instance neuve du module (état interne remis à zéro).
const path = require("node:path");
const Module = require("node:module");
const esbuild = require("esbuild");

const root = path.join(__dirname, "..", "..");

// entry : chemin d'un module, ou {nom: chemin} pour charger plusieurs modules qui partagent
// les mêmes dépendances (ex. le stockage et le bus d'événements qu'il utilise).
function loadExtensionModule(entry) {
  const file = path.join(root, typeof entry === "string" ? entry : "tests/helpers/entry.js");
  const source =
    typeof entry === "string"
      ? {entryPoints: [file]}
      : {stdin: {contents: Object.entries(entry).map(([name, p]) => `export * as ${name} from ${JSON.stringify(`./${p}`)};`).join("\n"), resolveDir: root, sourcefile: "entry.js"}};
  const {outputFiles} = esbuild.buildSync({
    ...source,
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    jsx: "automatic",
    jsxImportSource: "preact",
    loader: {".css": "text"},
    define: {__TARGET__: '"test"', __VERSION__: '"test"'},
    logLevel: "silent",
  });
  const m = new Module(file);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(outputFiles[0].text, file);
  return m.exports;
}

// JWT et cookie de session @supabase/ssr factices
const b64url = (s) => Buffer.from(s).toString("base64url");
function fakeJwt(claims) {
  return `${b64url(JSON.stringify({alg: "HS256"}))}.${b64url(JSON.stringify(claims))}.sig`;
}
function sessionCookie({userId = "user-1", token, expiresAt}) {
  const value = `base64-${b64url(JSON.stringify({access_token: token, expires_at: expiresAt, user: {id: userId, user_metadata: {username: "Moi"}}}))}`;
  return `sb-cyrxjeppjqsxxjayfrur-auth-token.0=${value}`;
}

// Réponse HTTP minimale pour un faux fetch
function response(status, body, headers = {}) {
  const text = body == null ? "" : typeof body === "string" ? body : JSON.stringify(body);
  return {ok: status >= 200 && status < 300, status, headers: new Headers(headers), text: async () => text};
}

module.exports = {loadExtensionModule, fakeJwt, sessionCookie, response};
