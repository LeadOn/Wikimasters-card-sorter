// Bus d'événements de l'extension, alimenté notamment par les réponses observées par le hook.
const listeners = new Map();

export function on(type, fn) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
  return () => listeners.get(type).delete(fn);
}

export function emit(type, payload) {
  for (const fn of listeners.get(type) || []) {
    try {
      fn(payload);
    } catch (e) {
      console.error("[WikiMasters Toolbox]", type, e);
    }
  }
}

// Messages du script de page (hook/main-world.js) → événements typés
const ROUTES = [
  ["my-collection", /^\/api\/my-collection(?:\?|$)/],
  ["my-collection-stats", /^\/api\/my-collection\/stats/],
  ["friend-collection", /^\/api\/profile\/([^/]+)\/collection/],
  ["catalog", /^\/api\/cards(?:\?|$)/],
  ["sales-summary", /^\/api\/marketplace\/cards\/([0-9a-f-]{36})\/sales/],
  ["auction", /^\/api\/marketplace\/([0-9a-f-]{36})$/],
  ["marketplace", /^\/api\/marketplace(?:\?|$)/],
  ["trades", /^\/api\/trades/],
  ["pack-opened", /^\/api\/packs\/(?:open|pro-daily|special)$/],
  ["notifications", /^\/api\/notifications$/],
  ["wikibidous", /^\/api\/wikibidous$/],
  ["packs-status", /^\/rest\/v1\/rpc\/sync_profile_packs$/],
];

export function startHookBridge() {
  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (event.source !== window || !msg || msg.__wmt !== "hook") return;
    if (msg.type === "apikey" && typeof msg.apikey === "string") return emit("apikey", msg.apikey);
    if (msg.type !== "response" || typeof msg.path !== "string" || msg.status < 200 || msg.status >= 300) return;
    for (const [type, re] of ROUTES) {
      const m = re.exec(msg.path);
      if (m) return emit(type, {data: msg.data, path: msg.path, method: msg.method, match: m});
    }
  });
}
