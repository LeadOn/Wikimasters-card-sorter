// Session du joueur, lue dans les cookies du site (@supabase/ssr) : aucun token à copier.
const COOKIE = "sb-cyrxjeppjqsxxjayfrur-auth-token";

function decodeBase64Url(text) {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

function decodeJwt(token) {
  try {
    return JSON.parse(decodeBase64Url(token.split(".")[1]));
  } catch {
    return {};
  }
}

// {token, userId, username, expiresAt, isPro} ou null si le joueur n'est pas connecté
export function readSession() {
  const parts = [];
  for (const entry of document.cookie.split(";")) {
    const i = entry.indexOf("=");
    const name = entry.slice(0, i).trim();
    if (name === COOKIE) parts.push([0, entry.slice(i + 1)]);
    else if (name.startsWith(`${COOKIE}.`)) parts.push([Number(name.slice(COOKIE.length + 1)), entry.slice(i + 1)]);
  }
  if (!parts.length) return null;
  try {
    let raw = decodeURIComponent(parts.sort((a, b) => a[0] - b[0]).map((p) => p[1]).join(""));
    if (raw.startsWith("base64-")) raw = decodeBase64Url(raw.slice(7));
    const session = JSON.parse(raw);
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

// Session valide au moins 2 minutes. Une requête au site suffit à faire renouveler les cookies
// par son middleware quand le token est sur le point d'expirer.
export async function ensureSession() {
  let s = readSession();
  if (s && s.expiresAt - Date.now() > 120000) return s;
  try {
    await fetch("/api/wikibidous", {credentials: "include"});
  } catch {}
  s = readSession();
  if (!s) throw new Error("Vous n'êtes pas connecté à WikiMasters.");
  if (s.expiresAt <= Date.now()) throw new Error("Session expirée : rechargez la page WikiMasters.");
  return s;
}
