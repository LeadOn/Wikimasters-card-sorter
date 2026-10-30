// Succès : liste et progression, réclamation des récompenses disponibles (succès débloqués pas
// encore réclamés). Un clic sur « Tout réclamer », ou d'elle-même avec l'option
// autoClaimAchievements (désactivée par défaut) : au chargement, toutes les 15 minutes et après
// un paquet ou un échange.
import {site} from "../api/site";
import {rest} from "../api/supabase";
import {createStore} from "../lib/store";
import {ensureSession, readSession} from "../lib/session";
import {withLock} from "../lib/locks";
import {on, emit} from "../lib/bus";
import {isOn} from "../state/settings";

export const achievementsState = createStore({list: null, loading: false, claiming: false, error: null, at: 0});

// Liste affichée : définitions (`achievements`), mes déblocages (`user_achievements`) et la
// progression renvoyée par la synchronisation du site. status : claimable, locked, claimed.
// Ordre : à réclamer, puis en cours (les plus avancés d'abord), puis réclamés (les plus récents d'abord).
const RANK = {claimable: 0, locked: 1, claimed: 2};
const ratio = (p) => (p?.target ? p.current / p.target : 0);
export function mergeAchievements(defs, mine, progress = []) {
  const unlocked = new Map((mine || []).map((u) => [u.achievement_id, u]));
  const byCode = new Map((progress || []).map((p) => [p.code, p]));
  return (defs || [])
    .map((d) => {
      const u = unlocked.get(d.id);
      return {
        id: d.id,
        code: d.code,
        title: d.title,
        description: d.description,
        reward: d.wikibidous_reward || 0,
        unlockedAt: u?.unlocked_at || null,
        claimedAt: u?.claimed_at || null,
        progress: u ? null : byCode.get(d.code) || null,
        status: !u ? "locked" : u.claimed_at ? "claimed" : "claimable",
      };
    })
    .sort((a, b) => RANK[a.status] - RANK[b.status] || ratio(b.progress) - ratio(a.progress) || String(b.claimedAt).localeCompare(String(a.claimedAt)) || a.title.localeCompare(b.title));
}

export const claimable = (list) => (list || []).filter((a) => a.status === "claimable");

// sync : synchronisation du site (`POST /api/achievements/check`, comme sa page Succès à chaque
// visite) : débloque les succès atteints et donne la progression des autres
export async function loadAchievements({sync = true} = {}) {
  achievementsState.set({loading: true, error: null});
  try {
    const session = await ensureSession();
    const check = sync ? await site.achievementsCheck().catch(() => null) : null;
    const [defs, mine] = await Promise.all([rest("achievements?select=*&order=id"), rest(`user_achievements?select=*&user_id=eq.${session.userId}&order=achievement_id`)]);
    const progress = check?.progress || achievementsState.get().list?.flatMap((a) => (a.progress ? [{code: a.code, ...a.progress}] : [])) || [];
    achievementsState.set({list: mergeAchievements(defs, mine, progress), at: Date.now()});
  } catch (e) {
    achievementsState.set({error: e.message});
    throw e;
  } finally {
    achievementsState.set({loading: false});
  }
  return achievementsState.get().list;
}

// Succès réclamé : marqué sur place (la liste garde son ordre jusqu'à la prochaine lecture)
const markClaimed = (id, claimedAt) =>
  achievementsState.set((s) => ({...s, list: s.list.map((a) => (a.id === id ? {...a, status: "claimed", claimedAt: claimedAt || new Date().toISOString()} : a))}));

// Réclame les récompenses disponibles, une à une, sous le verrou `achievements` (un seul onglet à la
// fois). La réclamation est idempotente (le site répond already_claimed) ; à la première erreur, la
// suite est abandonnée et la liste relue. Renvoie {claimed: [{title, amount}], total}.
export function claimAll() {
  return withLock("achievements", async () => {
    achievementsState.set({claiming: true, error: null});
    const claimed = [];
    try {
      for (const a of claimable(achievementsState.get().list)) {
        const res = await site.claimAchievement(a.id);
        markClaimed(a.id, res?.claimed_at);
        if (!res?.already_claimed) claimed.push({title: a.title, amount: res?.amount ?? a.reward});
      }
    } catch (e) {
      achievementsState.set({error: e.message});
      loadAchievements({sync: false}).catch(() => {});
      throw Object.assign(e, {claimed});
    } finally {
      achievementsState.set({claiming: false});
      // Solde affiché par le site
      if (claimed.length) window.dispatchEvent(new CustomEvent("wikimasters:wikibidous-balance-refresh"));
    }
    return {claimed, total: claimed.reduce((n, c) => n + c.amount, 0)};
  });
}

// --- Réclamation automatique (option)
const AUTO_EVERY = 15 * 60000;
let lastAuto = 0;
let pending = null;
async function autoClaim() {
  if (!isOn("autoClaimAchievements") || !readSession() || document.visibilityState !== "visible" || achievementsState.get().claiming) return;
  lastAuto = Date.now();
  try {
    if (!claimable(await loadAchievements()).length) return;
    const r = await claimAll();
    if (r.claimed.length) emit("achievements-claimed", r);
  } catch (e) {
    console.warn("[WikiMasters Toolbox] réclamation des succès", e);
  }
}
// Après un événement qui peut débloquer un succès : une passe 5 s plus tard, au plus une par minute
function soon() {
  clearTimeout(pending);
  pending = setTimeout(() => Date.now() - lastAuto > 60000 && autoClaim(), 5000);
}

export function startAchievements() {
  on("pack-opened", ({method}) => method === "POST" && soon());
  on("trades", ({method}) => method !== "GET" && soon());
  setTimeout(autoClaim, 8000);
  setInterval(() => Date.now() - lastAuto >= AUTO_EVERY && autoClaim(), 60000);
}
