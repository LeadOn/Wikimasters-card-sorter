// Taux de drop par rareté, sur l'écran « Ouvrir un paquet ».
// Deux sources : mes tirages comptés par l'extension, ou la répartition de toute ma collection
// (proche des taux de drop, la plupart des cartes venant des paquets) en attendant assez de tirages.
// Barres aux couleurs de rareté du site ; la rareté est aussi portée par son libellé.
import {useState} from "preact/hooks";
import {useStore} from "../lib/store";
import {pullStats, collectionRarity} from "../features/packs";
import {RARITIES, RARITY_LABEL} from "../../../../core";
import {fmt} from "./components";
import {mountIsland} from "./islands/mount";

// En dessous de ce nombre de cartes tirées, la collection donne une meilleure estimation
const MIN_PULLED = 50;

const pct = (n, total) => {
  if (!total) return "—";
  if (!n) return "0 %";
  const p = (100 * n) / total;
  return `${p.toLocaleString("fr-FR", {maximumFractionDigits: p < 1 ? 2 : 1, minimumFractionDigits: p < 1 && p > 0 ? 2 : 1})} %`;
};

export function DropRatesView() {
  const stats = useStore(pullStats);
  const coll = useStore(collectionRarity);
  const [choice, setChoice] = useState(null);
  const source = choice || (stats.cards >= MIN_PULLED || !coll.total ? "pulls" : "collection");
  const counts = source === "pulls" ? stats.byRarity : coll.counts;
  const total = RARITIES.reduce((n, r) => n + (Number(counts[r]) || 0), 0);
  const max = Math.max(1, ...RARITIES.map((r) => Number(counts[r]) || 0));
  const caption =
    source === "pulls"
      ? stats.cards
        ? `${fmt(stats.packs)} paquet${stats.packs > 1 ? "s" : ""} · ${fmt(stats.cards)} cartes depuis le ${new Date(stats.since).toLocaleDateString("fr-FR")}`
        : "Ouvre un paquet : les tirages seront comptés ici."
      : `Toute ta collection (${fmt(total)} cartes), proche des taux de drop`;

  return (
    <section class="rates" aria-label="Taux de drop par rareté">
      <header class="rates-head">
        <span class="rates-title">Taux de drop</span>
        <div class="seg" role="tablist">
          <button role="tab" aria-selected={source === "pulls"} class={source === "pulls" ? "on" : ""} onClick={() => setChoice("pulls")}>
            Mes paquets
          </button>
          <button role="tab" aria-selected={source === "collection"} class={source === "collection" ? "on" : ""} disabled={!coll.total} onClick={() => setChoice("collection")}>
            Ma collection
          </button>
        </div>
      </header>
      {total ? (
        <ul class="rates-list">
          {RARITIES.map((r) => {
            const n = Number(counts[r]) || 0;
            return (
              <li key={r} class="rates-row" style={{"--rc": `var(--r-${r})`}} title={`${RARITY_LABEL[r]} : ${fmt(n)} carte${n > 1 ? "s" : ""} sur ${fmt(total)} (${pct(n, total)})`}>
                <span class={`rarity ${r}`}>{r}</span>
                <span class="rates-name">{RARITY_LABEL[r]}</span>
                <span class="rates-track">
                  <span class="rates-bar" style={{width: n ? `max(4px, ${(100 * n) / max}%)` : "0"}} />
                </span>
                <span class="rates-pct">{pct(n, total)}</span>
                <span class="rates-n">{fmt(n)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p class="rates-empty">{source === "pulls" ? "Aucun tirage compté pour l'instant." : "Répartition indisponible."}</p>
      )}
      <p class="rates-caption">{caption}</p>
    </section>
  );
}

export function mountDropRates(host) {
  mountIsland(host, DropRatesView)({});
}
