// Onglet « Succès » : progression de chaque succès et réclamation des récompenses disponibles,
// en un clic ou d'elle-même (option autoClaimAchievements).
import {useState, useEffect} from "preact/hooks";
import {useStore} from "../../lib/store";
import {achievementsState, loadAchievements, claimAll, claimable} from "../../features/achievements";
import {settings, isOn} from "../../state/settings";
import {Icon, Money, Notice, Progress, fmt, plural, timeAgo} from "../components";
import {toast, errorMessage} from "../feedback";
import {L, LOCALE} from "../../../shared/i18n";

const FILTERS = [
  {id: "all", label: L("Tous", "All")},
  {id: "claimable", label: L("À réclamer", "To claim")},
  {id: "locked", label: L("En cours", "In progress")},
  {id: "claimed", label: L("Réclamés", "Claimed")},
];

function Status({a}) {
  if (a.status === "claimable") return <span class="chip me">{L("À réclamer", "To claim")}</span>;
  if (a.status === "claimed")
    return (
      <span class="chip" title={L(`Réclamé le ${new Date(a.claimedAt).toLocaleDateString(LOCALE)}`, `Claimed on ${new Date(a.claimedAt).toLocaleDateString(LOCALE)}`)}>
        <Icon name="check" size={12} /> {L("Réclamé", "Claimed")}
      </span>
    );
  if (!a.progress) return <span class="small muted">—</span>;
  return (
    <div style={{minWidth: "120px"}}>
      <Progress done={Math.min(a.progress.current, a.progress.target)} total={a.progress.target} label={L(`${Math.floor((100 * Math.min(a.progress.current, a.progress.target)) / a.progress.target)} %`, `${Math.floor((100 * Math.min(a.progress.current, a.progress.target)) / a.progress.target)}%`)} />
    </div>
  );
}

export const claimedMessage = ({claimed, total}) =>
  claimed.length === 1
    ? L(`Succès « ${claimed[0].title} » réclamé : +${fmt(total)} WikiBidous.`, `Achievement "${claimed[0].title}" claimed: +${fmt(total)} WikiBidous.`)
    : L(`${plural(claimed.length, "succès réclamé", "succès réclamés")} : +${fmt(total)} WikiBidous.`, `${plural(claimed.length, "achievement")} claimed: +${fmt(total)} WikiBidous.`);

export function AchievementsTab() {
  const s = useStore(achievementsState);
  useStore(settings);
  const [filter, setFilter] = useState("all");
  useEffect(() => {
    loadAchievements().catch(() => {});
  }, []);

  const list = s.list || [];
  const ready = claimable(list);
  const count = (status) => list.filter((a) => a.status === status).length;
  const shown = filter === "all" ? list : list.filter((a) => a.status === filter);
  const earned = list.filter((a) => a.status === "claimed").reduce((n, a) => n + a.reward, 0);

  const claim = async () => {
    try {
      const r = await claimAll();
      toast(r.claimed.length ? claimedMessage(r) : L("Aucune récompense à réclamer.", "No rewards to claim."), {type: r.claimed.length ? "ok" : "info"});
    } catch (e) {
      toast(`${e.claimed?.length ? `${claimedMessage({claimed: e.claimed, total: e.claimed.reduce((n, c) => n + c.amount, 0)})} ` : ""}${errorMessage(e)}`, {type: "error", duration: 10000});
    }
  };

  return (
    <div class="stack">
      <div class="page-head">
        <div>
          <h2>{L("Succès", "Achievements")}</h2>
          <p>{L("Vos succès, leur progression et leurs récompenses. Un succès débloqué rapporte des WikiBidous une fois réclamé.", "Your achievements, their progress and their rewards. An unlocked achievement earns WikiBidous once claimed.")}</p>
        </div>
        <span class="spacer" />
        <button class="btn sm ghost" disabled={s.loading} onClick={() => loadAchievements().catch((e) => toast(errorMessage(e), {type: "error"}))}>
          <Icon name="refresh" size={14} /> {L("Actualiser", "Refresh")}
        </button>
      </div>
      {s.error && <Notice type="error">{s.error}</Notice>}
      {!s.list && s.loading && <Progress label={L("Lecture de vos succès", "Reading your achievements")} done={0} />}
      {s.list && (
        <>
          <div class="grid-stats">
            <div class="stat"><div class="k">{L("Débloqués", "Unlocked")}</div><div class="v">{fmt(list.length - count("locked"))} / {fmt(list.length)}</div></div>
            <div class="stat"><div class="k">{L("À réclamer", "To claim")}</div><div class="v">{fmt(ready.length)}</div></div>
            <div class="stat"><div class="k">{L("Récompenses à réclamer", "Rewards to claim")}</div><div class="v"><Money v={ready.reduce((n, a) => n + a.reward, 0)} /></div></div>
            <div class="stat"><div class="k">{L("Récompenses reçues", "Rewards received")}</div><div class="v"><Money v={earned} /></div></div>
          </div>

          <div class="box stack">
            <div class="row">
              <h3 style={{flex: 1}}>{L("Récompenses", "Rewards")}</h3>
              <button class="btn primary" disabled={!ready.length || s.claiming} onClick={claim}>
                {s.claiming ? L("Réclamation…", "Claiming…") : ready.length ? L(`Tout réclamer (${fmt(ready.length)})`, `Claim all (${fmt(ready.length)})`) : L("Rien à réclamer", "Nothing to claim")}
              </button>
            </div>
            <p class="help">
              {isOn("autoClaimAchievements")
                ? L(
                    "Réclamation automatique activée : les récompenses sont réclamées dès qu'un succès est débloqué (au chargement d'une page, toutes les 15 minutes, après un paquet ou un échange).",
                    "Automatic claiming is on: rewards are claimed as soon as an achievement is unlocked (on page load, every 15 minutes, after a pack or a trade).",
                  )
                : L(
                    "« Tout réclamer » réclame d'un clic toutes les récompenses disponibles. L'option Réclamer les succès automatiquement (Réglages) le fait sans clic.",
                    "“Claim all” claims every available reward in one click. The “Claim achievements automatically” option (Settings) does it without a click.",
                  )}
              {s.at ? L(` Lu ${timeAgo(s.at)}.`, ` Updated ${timeAgo(s.at)}.`) : ""}
            </p>
          </div>

          <div class="box stack">
            <div class="seg" role="group" aria-label={L("Filtrer les succès", "Filter achievements")}>
              {FILTERS.map((f) => (
                <button key={f.id} class={filter === f.id ? "on" : ""} onClick={() => setFilter(f.id)}>
                  {f.label} <span class="n">{fmt(f.id === "all" ? list.length : count(f.id))}</span>
                </button>
              ))}
            </div>
            {shown.length ? (
              <table class="list">
                <thead>
                  <tr>
                    <th>{L("Succès", "Achievement")}</th>
                    <th>{L("État", "Status")}</th>
                    <th class="num">{L("Récompense", "Reward")}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <div>{a.title}</div>
                        <div class="small muted">{a.description}</div>
                      </td>
                      <td><Status a={a} /></td>
                      <td class="num"><Money v={a.reward} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div class="empty">{L("Aucun succès dans cette liste.", "No achievements in this list.")}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
