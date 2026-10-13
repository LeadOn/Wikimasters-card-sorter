// Requêtes réseau prudentes : délai maximal, réessais avec délai croissant pour les lectures,
// respect des 429 (Retry-After), et jamais de réessai automatique d'une écriture non idempotente.
export class HttpError extends Error {
  // code : code d'erreur du serveur (PostgREST, site), ou "timeout" / "network" / "bad_response"
  // uncertain : écriture restée sans réponse, peut-être prise en compte par le serveur
  constructor(message, {status = 0, code = null, data = null, uncertain = false} = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.data = data;
    this.uncertain = uncertain;
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
    this.name = "HumanCheckError";
  }
}

export const abortError = () => new DOMException("Annulé", "AbortError");

export const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, {once: true});
  });

export const backoff = (attempt) => Math.min(30000, 1500 * 2 ** (attempt - 1)) * (0.75 + Math.random() * 0.5);

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

// fn(item) pour chaque élément, `concurrency` à la fois. À la première erreur, plus aucune tâche
// n'est lancée et l'erreur est renvoyée une fois les tâches en cours terminées (rien ne continue
// en arrière-plan après l'échec).
export async function runAll(items, fn, {concurrency = 4, signal} = {}) {
  const queue = [...items];
  let error = null;
  const worker = async () => {
    while (queue.length && !error && !signal?.aborted) {
      const item = queue.shift();
      try {
        await fn(item);
      } catch (e) {
        error ||= e;
      }
    }
  };
  await Promise.all(Array.from({length: Math.min(concurrency, queue.length)}, worker));
  if (error) throw error;
  if (signal?.aborted) throw abortError();
}

function describe(status, data) {
  const detail = typeof data === "object" && data ? data.error || data.message || data.code : null;
  if (status === 401 || status === 403) return detail || "Accès refusé : reconnectez-vous à WikiMasters.";
  if (status === 429) return "Trop de requêtes : le site demande de ralentir. Réessayez dans un moment.";
  if (status >= 500) return detail ? `Erreur du serveur WikiMasters (${detail})` : `Le serveur WikiMasters ne répond pas (${status}).`;
  return detail || `Erreur ${status}`;
}

const isHumanCheck = (data) => data && typeof data === "object" && (data.code === "human_verification_required" || data.human_verification_required === true);

// retries : nombre total de tentatives (par défaut 6 pour une lecture, 1 pour une écriture ; une
// écriture idempotente — suppression par filtre, ajout ignorant les doublons — peut en demander plus).
// Toutes les réponses attendues sont du JSON : une page HTML (vérification Cloudflare, maintenance)
// reçue à la place est une erreur, pas des données.
export async function request(url, {method = "GET", headers = {}, body, timeout = 45000, retries, credentials = "include", signal, retryDelay = backoff} = {}) {
  const write = method !== "GET";
  const attempts = retries ?? (write ? 1 : 6);
  for (let attempt = 1; ; attempt++) {
    if (signal?.aborted) throw abortError();
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, timeout);
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
    } catch {
      if (signal?.aborted) throw abortError();
      if (attempt >= attempts) {
        const code = timedOut ? "timeout" : "network";
        if (write)
          throw new HttpError(
            attempts === 1
              ? "Pas de réponse du site : l'action a peut-être été prise en compte. Vérifiez sur WikiMasters avant de réessayer."
              : "Pas de réponse du site : l'opération est restée inachevée, vous pouvez la relancer.",
            {status: 0, code, uncertain: true},
          );
        throw new HttpError(timedOut ? "Le site met trop de temps à répondre." : "Le site ne répond pas (connexion interrompue ?).", {status: 0, code});
      }
      await sleep(retryDelay(attempt), signal);
      continue;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
    let data = null;
    let json = true;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
        json = false;
      }
    }
    if (isHumanCheck(data) && !res.ok) throw new HumanCheckError(data);
    if (res.ok && json) return data;
    const unexpected = res.ok; // 2xx mais pas du JSON
    const retryable = unexpected || res.status === 408 || res.status === 425 || res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= attempts) {
      if (unexpected)
        throw new HttpError("Réponse inattendue du site (page de vérification ou de maintenance ?). Rechargez la page WikiMasters puis réessayez.", {
          status: res.status,
          code: "bad_response",
          uncertain: write,
        });
      throw new HttpError(describe(res.status, data), {status: res.status, code: data?.code ?? null, data});
    }
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(retryAfter > 0 ? Math.min(120, retryAfter) * 1000 : retryDelay(attempt), signal);
  }
}
