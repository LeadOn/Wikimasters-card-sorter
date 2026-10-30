// Onglet « Succès » : progression de chaque succès et réclamation des récompenses disponibles,
// en un clic ou d'elle-même (option autoClaimAchievements).
import {useState, useEffect} from "preact/hooks";
import {useStore} from "../../lib/store";
import {achievementsState, loadAchievements, claimAll, claimable} from "../../features/achievements";
import {settings, isOn} from "../../state/settings";
import {Icon, Money, Notice, Progress, fmt, plural, timeAgo} from "../components";
import {toast, errorMessage} from "../feedback";

const FILTERS = [
  {id: "all", label: "Tous"},
  {id: "claimable", label: "À réclamer"},
  {id: "locked", label: "En cours"},
  {id: "claimed", label: "Réclamés"},
];

function Status({a}) {
  if (a.status === "claimable") return <span class="chip me">À réclamer</span>;
  if (a.status === "claimed")
    return (
      <span class="chip" title={`Réclamé le ${new Date(a.claimedAt).toLocaleDateString("fr-FR")}`}>
        <Icon name="check" size={12} /> Réclamé
      </span>
    );
  if (!a.progress) return <span class="small muted">—</span>;
  return (
    <div style={{minWidth: "120px"}}>
      <Progress done={Math.min(a.progress.current, a.progress.target)} total={a.progress.target} label={`${Math.floor((100 * Math.min(a.progress.current, a.progress.target)) / a.progress.target)} %`} />
    </div>
  );
}

export const claimedMessage = ({claimed, total}) =>
  claimed.length === 1 ? `Succès « ${claimed[0].title} » réclamé : +${fmt(total)} WikiBidous.` : `${plural(claimed.length, "succès réclamé", "succès réclamés")} : +${fmt(total)} WikiBidous.`;

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
      toast(r.claimed.length ? claimedMessage(r) : "Aucune récompense à réclamer.", {type: r.claimed.length ? "ok" : "info"});
    } catch (e) {
      toast(`${e.claimed?.length ? `${claimedMessage({claimed: e.claimed, total: e.claimed.reduce((n, c) => n + c.amount, 0)})} ` : ""}${errorMessage(e)}`, {type: "error", duration: 10000});
    }
  };

  return (
    <div class="stack">
      <div class="page-head">
        <div>
          <h2>Succès</h2>
          <p>Vos succès, leur progression et leurs récompenses. Un succès débloqué rapporte des WikiBidous une fois réclamé.</p>
        </div>
        <span class="spacer" />
        <button class="btn sm ghost" disabled={s.loading} onClick={() => loadAchievements().catch((e) => toast(errorMessage(e), {type: "error"}))}>
          <Icon name="refresh" size={14} /> Actualiser
        </button>
      </div>
      {s.error && <Notice type="error">{s.error}</Notice>}
      {!s.list && s.loading && <Progress label="Lecture de vos succès" done={0} />}
      {s.list && (
        <>
          <div class="grid-stats">
            <div class="stat"><div class="k">Débloqués</div><div class="v">{fmt(list.length - count("locked"))} / {fmt(list.length)}</div></div>
            <div class="stat"><div class="k">À réclamer</div><div class="v">{fmt(ready.length)}</div></div>
            <div class="stat"><div class="k">Récompenses à réclamer</div><div class="v"><Money v={ready.reduce((n, a) => n + a.reward, 0)} /></div></div>
            <div class="stat"><div class="k">Récompenses reçues</div><div class="v"><Money v={earned} /></div></div>
          </div>

          <div class="box stack">
            <div class="row">
              <h3 style={{flex: 1}}>Récompenses</h3>
              <button class="btn primary" disabled={!ready.length || s.claiming} onClick={claim}>
                {s.claiming ? "Réclamation…" : ready.length ? `Tout réclamer (${fmt(ready.length)})` : "Rien à réclamer"}
              </button>
            </div>
            <p class="help">
              {isOn("autoClaimAchievements")
                ? "Réclamation automatique activée : les récompenses sont réclamées dès qu'un succès est débloqué (au chargement d'une page, toutes les 15 minutes, après un paquet ou un échange)."
                : "« Tout réclamer » réclame d'un clic toutes les récompenses disponibles. L'option Réclamer les succès automatiquement (Réglages) le fait sans clic."}
              {s.at ? ` Lu ${timeAgo(s.at)}.` : ""}
            </p>
          </div>

          <div class="box stack">
            <div class="seg" role="group" aria-label="Filtrer les succès">
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
                    <th>Succès</th>
                    <th>État</th>
                    <th class="num">Récompense</th>
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
              <div class="empty">Aucun succès dans cette liste.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
