// Requêtes réseau prudentes : délai maximal, réessais avec délai croissant pour les lectures,
// respect des 429 (Retry-After), et jamais de réessai automatique d'une écriture non idempotente.
export class HttpError extends Error {
  constructor(message, {status = 0, code = null, data = null} = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

// Le site demande une vérification anti-robot : le joueur doit la faire lui-même sur le site.
export class HumanCheckError extends HttpError {
  constructor(data) {
    super("WikiMasters demande une vérification anti-robot : faites-la sur le site (ouvrez un paquet ou une page à la main), puis réessayez.", {
      status: 403,
      code: "human_verification_required",
      data,
    });
  }
}

export const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Annulé", "AbortError"));
    });
  });

const backoff = (attempt) => Math.min(30000, 1500 * 2 ** (attempt - 1)) * (0.75 + Math.random() * 0.5);

// Nombre maximal de tâches simultanées
export function createLimiter(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || !queue.length) return;
    active++;
    const {fn, resolve, reject} = queue.shift();
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => {
        active--;
        next();
      });
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({fn, resolve, reject});
      next();
    });
}

function describe(status, data) {
  const detail = typeof data === "object" && data ? data.error || data.message || data.code : null;
  if (status === 401 || status === 403) return detail || "Accès refusé : reconnectez-vous à WikiMasters.";
  if (status === 429) return "Trop de requêtes : le site demande de ralentir. Réessayez dans un moment.";
  if (status >= 500) return detail ? `Erreur du serveur WikiMasters (${detail})` : `Le serveur WikiMasters ne répond pas (${status}).`;
  return detail || `Erreur ${status}`;
}

// retries : nombre total de tentatives (par défaut 6 pour une lecture, 1 pour une écriture)
export async function request(url, {method = "GET", headers = {}, body, timeout = 45000, retries, credentials = "include", signal} = {}) {
  const attempts = retries ?? (method === "GET" ? 6 : 1);
  for (let attempt = 1; ; attempt++) {
    if (signal?.aborted) throw new DOMException("Annulé", "AbortError");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    const onAbort = () => ctrl.abort();
    signal?.addEventListener("abort", onAbort);
    let res;
    let text;
    try {
      res = await fetch(url, {
        method,
        headers,
        credentials,
        body: body == null ? undefined : typeof body === "string" ? body : JSON.stringify(body),
        signal: ctrl.signal,
      });
      text = await res.text();
    } catch (e) {
      if (signal?.aborted) throw new DOMException("Annulé", "AbortError");
      if (attempt >= attempts) throw new HttpError("Le site ne répond pas (réseau ou délai dépassé).", {status: 0});
      await sleep(backoff(attempt), signal);
      continue;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (res.ok) return data;
    if (data && typeof data === "object" && (data.code === "human_verification_required" || data.human_verification_required))
      throw new HumanCheckError(data);
    const retryable = res.status === 408 || res.status === 425 || res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= attempts) throw new HttpError(describe(res.status, data), {status: res.status, code: data?.code, data});
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(retryAfter > 0 ? Math.min(120, retryAfter) * 1000 : backoff(attempt), signal);
  }
}
