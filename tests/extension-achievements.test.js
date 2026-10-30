// Succès : liste (définitions, déblocages, progression du site), réclamation des récompenses
// disponibles une à une, arrêt à la première erreur, solde du site rafraîchi.
const test = require("node:test");
const assert = require("node:assert/strict");
const {loadExtensionModule, response, fakeJwt, sessionCookie} = require("./helpers/extension");

function fakeBrowser() {
  const target = new EventTarget();
  globalThis.window = globalThis;
  globalThis.addEventListener = target.addEventListener.bind(target);
  globalThis.removeEventListener = target.removeEventListener.bind(target);
  globalThis.dispatchEvent = target.dispatchEvent.bind(target);
  const exp = Math.floor(Date.now() / 1000) + 3600;
  globalThis.document = {addEventListener() {}, visibilityState: "visible", cookie: sessionCookie({userId: "me", token: fakeJwt({sub: "me", exp}), expiresAt: exp})};
  const data = {};
  globalThis.chrome = {
    runtime: {id: "test"},
    storage: {
      local: {
        get: async (key) => Object.fromEntries([].concat(key).filter((k) => k in data).map((k) => [k, data[k]])),
        set: async (obj) => Object.assign(data, structuredClone(obj)),
        remove: async (key) => [].concat(key).forEach((k) => delete data[k]),
      },
      onChanged: {addListener() {}, removeListener() {}},
    },
  };
  const events = [];
  target.addEventListener("wikimasters:wikibidous-balance-refresh", (e) => events.push(e.type));
  return events;
}

const DEFS = [
  {id: "a1", code: "collect_50", title: "Débutant", description: "Posséder 50 cartes", wikibidous_reward: 10},
  {id: "a2", code: "collect_30000", title: "Wiki Légende", description: "Posséder 30000 cartes", wikibidous_reward: 1000},
  {id: "a3", code: "wins_5", title: "Combattant", description: "Gagner 5 batailles", wikibidous_reward: 50},
  {id: "a4", code: "max_atk", title: "ATK Maximum", description: "Obtenir une carte avec 10000 ATK", wikibidous_reward: 75},
  {id: "a5", code: "trades_5", title: "Troqueur", description: "Conclure 5 échanges", wikibidous_reward: 35},
];
const MINE = [
  {achievement_id: "a1", unlocked_at: "2026-10-01T00:00:00Z", claimed_at: "2026-10-01T00:01:00Z"},
  {achievement_id: "a4", unlocked_at: "2026-10-30T09:00:00Z", claimed_at: null},
  {achievement_id: "a5", unlocked_at: "2026-10-30T09:00:00Z", claimed_at: null},
];
const PROGRESS = [
  {code: "collect_30000", current: 10081, target: 30000},
  {code: "wins_5", current: 4, target: 5},
];

// Faux réseau : routes du site et de Supabase ; claims : réponse de chaque réclamation, dans l'ordre
function fakeNetwork({claims = []} = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({url: String(url), method: init.method || "GET", body: init.body});
    if (url === "/api/achievements/check") return response(200, {unlocked: [], progress: PROGRESS});
    if (url === "/api/achievements/claim") {
      const next = claims.shift();
      return next instanceof Error ? Promise.reject(next) : next;
    }
    if (String(url).includes("/rest/v1/achievements?")) return response(200, DEFS);
    if (String(url).includes("/rest/v1/user_achievements?")) return response(200, MINE);
    throw new Error(`requête inattendue : ${url}`);
  };
  return calls;
}

function setup(opts) {
  const events = fakeBrowser();
  const calls = fakeNetwork(opts);
  return {events, calls, m: loadExtensionModule("extension/src/content/features/achievements.js")};
}

test("liste : à réclamer, puis en cours (les plus avancés d'abord), puis réclamés", () => {
  const {m} = setup();
  const list = m.mergeAchievements(DEFS, MINE, PROGRESS);
  assert.deepEqual(
    list.map((a) => [a.title, a.status]),
    [
      ["ATK Maximum", "claimable"],
      ["Troqueur", "claimable"],
      ["Combattant", "locked"],
      ["Wiki Légende", "locked"],
      ["Débutant", "claimed"],
    ],
  );
  assert.deepEqual(list[2].progress, {code: "wins_5", current: 4, target: 5});
  assert.equal(list[4].progress, null, "pas de progression pour un succès débloqué");
  assert.deepEqual(m.claimable(list).map((a) => a.id), ["a4", "a5"]);
});

test("lecture : synchronisation du site d'abord, puis définitions et déblocages du joueur", async () => {
  const {m, calls} = setup();
  const list = await m.loadAchievements();
  assert.equal(calls[0].url, "/api/achievements/check");
  assert.equal(calls[0].method, "POST");
  assert.deepEqual(JSON.parse(calls[0].body), {event: "achievements_sync"});
  assert.ok(calls.some((c) => c.url.includes("user_achievements?select=*&user_id=eq.me&order=achievement_id")));
  assert.equal(list.length, 5);
  assert.equal(m.achievementsState.get().loading, false);
});

test("tout réclamer : une requête par succès disponible, total reçu, solde du site rafraîchi", async () => {
  const {m, calls, events} = setup({claims: [response(200, {claimed_at: "2026-10-30T10:00:00Z", amount: 75}), response(200, {already_claimed: true, claimed_at: "2026-10-30T09:59:00Z"})]});
  await m.loadAchievements();
  const r = await m.claimAll();
  const claims = calls.filter((c) => c.url === "/api/achievements/claim");
  assert.deepEqual(claims.map((c) => JSON.parse(c.body)), [{achievement_id: "a4"}, {achievement_id: "a5"}]);
  assert.deepEqual(r, {claimed: [{title: "ATK Maximum", amount: 75}], total: 75}, "un succès déjà réclamé ne compte pas");
  assert.deepEqual(m.claimable(m.achievementsState.get().list), []);
  assert.deepEqual(events, ["wikimasters:wikibidous-balance-refresh"]);
});

test("tout réclamer : arrêt à la première erreur, jamais rejouée, liste relue", async () => {
  const {m, calls} = setup({claims: [response(200, {claimed_at: "2026-10-30T10:00:00Z", amount: 75}), response(500, {error: "Impossible de réclamer la récompense."})]});
  await m.loadAchievements();
  await assert.rejects(m.claimAll(), (e) => {
    assert.deepEqual(e.claimed, [{title: "ATK Maximum", amount: 75}]);
    return true;
  });
  assert.equal(calls.filter((c) => c.url === "/api/achievements/claim").length, 2, "la réclamation en erreur n'est pas rejouée");
  assert.equal(m.achievementsState.get().claiming, false);
});
