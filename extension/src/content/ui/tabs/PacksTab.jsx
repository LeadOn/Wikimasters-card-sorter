// Onglet « Paquets » : statistiques de tirage, « Tout ouvrir », dernier récapitulatif.
import {useStore} from "../../lib/store";
import {pullStats, resetPullStats, packsStatus, openAllState} from "../../features/packs";
import {PackRecapView} from "../PackRecap";
import {emit} from "../../lib/bus";
import {Notice, Rarity, fmt, plural, timeAgo} from "../components";
import {confirmAction} from "../feedback";
import {RARITIES, RARITY_LABEL} from "../../../../../core";

export function PacksTab() {
  const stats = useStore(pullStats);
  const status = useStore(packsStatus);
  const openAll = useStore(openAllState);
  const max = Math.max(1, ...RARITIES.map((r) => stats.byRarity[r] || 0));

  return (
    <div class="stack">
      <div class="page-head">
        <div>
          <h2>Paquets</h2>
          <p>Statistiques de vos tirages et ouverture groupée. L'ouverture ne se fait jamais toute seule : seulement quand vous cliquez.</p>
        </div>
      </div>
      <div class="grid-2">
        <div class="box stack">
          <h3>Tout ouvrir</h3>
          <p class="help">
            Ouvre d'un coup tous les paquets disponibles, sans animation, puis affiche le récapitulatif. S'arrête à la première erreur, ou si le site demande une vérification anti-robot (à faire vous-même sur la page Paquets).
          </p>
          <div class="row">
            <button class="btn primary" disabled={openAll.running} onClick={() => emit("confirm-open-all", {})}>
              {openAll.running ? `Ouverture… (${openAll.opened})` : "Tout ouvrir"}
            </button>
            <span class="small muted">{status.remaining != null ? `${plural(status.remaining, "paquet disponible", "paquets disponibles")} (${timeAgo(status.at)})` : "Ouvrez la page Paquets pour voir le nombre disponible."}</span>
          </div>
          {openAll.error && <Notice type="warn">{openAll.error}</Notice>}
        </div>
        <div class="box stack">
          <div class="row">
            <h3 style={{flex: 1}}>Statistiques de tirage</h3>
            <button
              class="btn sm ghost"
              onClick={async () => (await confirmAction({title: "Réinitialiser les statistiques ?", confirm: "Réinitialiser", danger: true})) && resetPullStats()}
            >
              Réinitialiser
            </button>
          </div>
          <p class="small muted">Depuis le {new Date(stats.since).toLocaleDateString("fr-FR")} · {plural(stats.packs, "paquet")} · {plural(stats.cards, "carte")}</p>
          <table class="list">
            <tbody>
              {RARITIES.map((r) => {
                const n = stats.byRarity[r] || 0;
                return (
                  <tr key={r}>
                    <td style={{width: "130px"}}>
                      <Rarity r={r} /> <span class="small">{RARITY_LABEL[r]}</span>
                    </td>
                    <td><div class="bar" style={{width: `${(100 * n) / max}%`, background: `var(--r-${r})`}} /></td>
                    <td class="num" style={{width: "60px"}}>{fmt(n)}</td>
                    <td class="num muted" style={{width: "60px"}}>{stats.cards ? `${((100 * n) / stats.cards).toFixed(1)} %` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <PackRecapView />
    </div>
  );
}
