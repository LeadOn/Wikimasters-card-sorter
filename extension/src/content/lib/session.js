// Session du joueur, lue dans les cookies du site (@supabase/ssr) : aucun token à copier.
const COOKIE = "sb-cyrxjeppjqsxxjayfrur-auth-token";

function decodeBase64Url(text) {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

export function decodeJwt(token) {
  try {
    return JSON.parse(decodeBase64Url(String(token).split(".")[1]));
  } catch {
    return {};
  }
}

function parseSession(raw) {
  try {
    let text = decodeURIComponent(raw);
    if (text.startsWith("base64-")) text = decodeBase64Url(text.slice(7));
    const session = JSON.parse(text);
    if (!session?.access_token) return null;
    const claims = decodeJwt(session.access_token);
    return {
      token: session.access_token,
      userId: session.user?.id || claims.sub,
      username: session.user?.user_metadata?.username || claims.user_metadata?.username || null,
      expiresAt: (session.expires_at || claims.exp || 0) * 1000,
      isPro: Boolean(claims.is_pro),
    };
  } catch {
    return null;
  }
}

// {token, userId, username, expiresAt, isPro} ou null si le joueur n'est pas connecté.
// @supabase/ssr écrit soit un cookie unique, soit des morceaux numérotés (.0, .1, …) ; pendant
// une mise à jour les deux formes peuvent coexister : la session qui expire le plus tard l'emporte.
export function readSession() {
  let single = null;
  const chunks = [];
  for (const entry of document.cookie.split(";")) {
    const i = entry.indexOf("=");
    if (i < 0) continue;
    const name = entry.slice(0, i).trim();
    const value = entry.slice(i + 1).trim();
    if (name === COOKIE) single = value;
    else if (name.startsWith(`${COOKIE}.`)) {
      const n = Number(name.slice(COOKIE.length + 1));
      if (Number.isInteger(n)) chunks.push([n, value]);
    }
  }
  const candidates = [chunks.length ? chunks.sort((a, b) => a[0] - b[0]).map((c) => c[1]).join("") : null, single]
    .filter(Boolean)
    .map(parseSession)
    .filter((s) => s?.userId);
  return candidates.sort((a, b) => b.expiresAt - a.expiresAt)[0] || null;
}

// Une requête au site suffit à faire renouveler les cookies par son middleware quand le token
// expire bientôt. Un seul appel à la fois, partagé par toutes les requêtes qui en ont besoin.
let refreshing = null;
function refreshCookies() {
  refreshing ||= fetch("/api/wikibidous", {credentials: "include"})
    .catch(() => {})
    .finally(() => (refreshing = null));
  return refreshing;
}

// Session valide au moins 2 minutes. force : renouvellement demandé après un refus du serveur
// (token expiré, ou horloge du poste décalée par rapport au serveur).
export async function ensureSession({force = false} = {}) {
  let s = readSession();
  if (s && !force && s.expiresAt - Date.now() > 120000) return s;
  await refreshCookies();
  s = readSession();
  if (!s) throw new Error("Vous n'êtes pas connecté à WikiMasters.");
  if (s.expiresAt <= Date.now()) throw new Error("Session expirée : rechargez la page WikiMasters.");
  return s;
}
