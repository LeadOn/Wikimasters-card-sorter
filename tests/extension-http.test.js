// Couche réseau de l'extension : réessais, écritures jamais rejouées, réponses inattendues,
// session renouvelée après un refus, pagination dédoublonnée.
const test = require("node:test");
const assert = require("node:assert/strict");
const {loadExtensionModule, fakeJwt, sessionCookie, response} = require("./helpers/extension");

const {request, runAll, sleep} = loadExtensionModule("extension/src/content/lib/http.js");
const fast = {retryDelay: () => 0};

// Faux fetch : chaque appel consomme la réponse suivante (fonction, réponse ou erreur)
function scriptedFetch(steps) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({url, ...init});
    const step = steps.length > 1 ? steps.shift() : steps[0];
    const r = typeof step === "function" ? await step(url, init) : step;
    if (r instanceof Error) throw r;
    return r;
  };
  return calls;
}

test("lecture : réessayée sur une erreur passagère", async () => {
  const calls = scriptedFetch([response(503, {}), response(200, [1])]);
  assert.deepEqual(await request("/x", fast), [1]);
  assert.equal(calls.length, 2);
});

test("écriture : jamais rejouée, et signalée « incertaine » sans réponse", async () => {
  let calls = scriptedFetch([response(503, {})]);
  await assert.rejects(request("/x", {...fast, method: "POST", body: {}}), (e) => e.status === 503 && !e.uncertain);
  assert.equal(calls.length, 1);

  calls = scriptedFetch([new TypeError("fetch failed")]);
  await assert.rejects(request("/x", {...fast, method: "POST", body: {}}), (e) => e.status === 0 && e.uncertain && /peut-être/.test(e.message));
  assert.equal(calls.length, 1);

  scriptedFetch([new TypeError("fetch failed")]);
  await assert.rejects(request("/x", {...fast, retries: 2}), (e) => e.code === "network" && !e.uncertain);
});

test("délai dépassé : code « timeout »", async () => {
  globalThis.fetch = (url, {signal}) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("x", "AbortError"))));
  await assert.rejects(request("/x", {...fast, timeout: 10, retries: 1}), (e) => e.code === "timeout");
});

test("page HTML reçue en 200 (vérification, maintenance) : erreur, pas des données", async () => {
  const calls = scriptedFetch([response(200, "<!doctype html><title>Just a moment…</title>")]);
  await assert.rejects(request("/x", {...fast, retries: 2}), (e) => e.code === "bad_response");
  assert.equal(calls.length, 2, "lecture réessayée");
  scriptedFetch([response(200, "<html>")]);
  await assert.rejects(request("/x", {...fast, method: "POST"}), (e) => e.code === "bad_response" && e.uncertain);
  scriptedFetch([response(204, "")]);
  assert.equal(await request("/x", {method: "DELETE"}), null, "réponse vide acceptée");
});

test("vérification anti-robot et erreurs du serveur", async () => {
  scriptedFetch([response(403, {code: "human_verification_required"})]);
  await assert.rejects(request("/x", {method: "POST"}), (e) => e.name === "HumanCheckError");
  scriptedFetch([response(400, {code: "bid_too_low", min: 12})]);
  await assert.rejects(request("/x", {method: "POST"}), (e) => e.code === "bid_too_low" && e.data.min === 12);
});

test("annulation : immédiate, même pendant l'attente entre deux essais", async () => {
  const ctrl = new AbortController();
  ctrl.abort();
  await assert.rejects(sleep(10000, ctrl.signal), (e) => e.name === "AbortError");
  const ctrl2 = new AbortController();
  scriptedFetch([response(503, {})]);
  const p = request("/x", {signal: ctrl2.signal, retryDelay: () => 60000});
  setTimeout(() => ctrl2.abort(), 20);
  await assert.rejects(p, (e) => e.name === "AbortError");
});

test("runAll : plus aucune tâche lancée après la première erreur", async () => {
  const started = [];
  await assert.rejects(
    runAll(
      Array.from({length: 20}, (_, i) => i),
      async (i) => {
        started.push(i);
        await new Promise((r) => setTimeout(r, 5));
        if (i === 1) throw new Error("page 2 illisible");
      },
      {concurrency: 2},
    ),
    /page 2/,
  );
  assert.ok(started.length <= 3, `tâches lancées : ${started.length}`);
});

// --- Supabase : session lue au moment d'envoyer, renouvelée une fois après un 401
test("rest : token expiré → session renouvelée puis requête rejouée une fois", async () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const oldToken = fakeJwt({sub: "user-1", exp});
  const newToken = fakeJwt({sub: "user-1", exp: exp + 60});
  globalThis.document = {cookie: sessionCookie({token: oldToken, expiresAt: exp})};
  const {rest, fetchAll, restIn} = loadExtensionModule("extension/src/content/api/supabase.js");

  const seen = [];
  globalThis.fetch = async (url, init = {}) => {
    if (url === "/api/wikibidous") {
      globalThis.document.cookie = sessionCookie({token: newToken, expiresAt: exp + 60});
      return response(200, {balance: 1});
    }
    const auth = init.headers.authorization;
    seen.push(auth === `Bearer ${newToken}` ? "new" : "old");
    return auth === `Bearer ${newToken}` ? response(201, [{id: "t1"}]) : response(401, {code: "PGRST301", message: "JWT expired"});
  };
  assert.deepEqual(await rest("tags", {method: "POST", body: {}}), [{id: "t1"}]);
  assert.deepEqual(seen, ["old", "new"], "rejouée avec le nouveau token");

  // Refus persistant : pas de boucle
  seen.length = 0;
  globalThis.fetch = async (url) => (url === "/api/wikibidous" ? response(200, {}) : (seen.push(url), response(401, {message: "JWT expired"})));
  await assert.rejects(rest("tags"), (e) => e.status === 401);
  assert.equal(seen.length, 2);

  // Pagination : lignes déplacées d'une page à l'autre dédoublonnées, réponse inattendue refusée
  const pages = [Array.from({length: 1000}, (_, i) => ({id: i})), [{id: 999}, {id: 1000}]];
  globalThis.fetch = async () => response(200, pages.shift());
  const rows = await fetchAll("user_cards?select=id&order=id.asc", {key: "id"});
  assert.equal(rows.length, 1001);
  globalThis.fetch = async () => response(200, {message: "oops"});
  await assert.rejects(fetchAll("user_cards?select=id"), /inattendue/);

  // Listes d'ids découpées en lots de 100
  const urls = [];
  globalThis.fetch = async (url) => (urls.push(url), response(200, [{ok: 1}]));
  const ids = Array.from({length: 250}, (_, i) => `id${i}`);
  assert.equal((await restIn("user_cards?select=id", "card_id", [...ids, ...ids])).length, 3);
  assert.equal(urls.length, 3);
  assert.ok(urls.every((u) => u.split(",").length <= 100));
});
