// Récapitulatif du dernier paquet : bloc intégré à la page Paquets (et à l'onglet Paquets de la
// Toolbox), jamais une fenêtre. Les prix arrivent pendant la révélation des cartes ; tant qu'ils
// ne sont pas là, un indicateur de chargement les remplace.
import {useStore} from "../lib/store";
import {recapState, dismissRecap} from "../features/packs";
import {planSort} from "../features/sorter";
import {priceOf, priceStatus, priceVersion} from "../state/prices";
import {isOn} from "../state/settings";
import {Rarity, ThemeChip, fmt, plural} from "./components";
import {toast, errorMessage} from "./feedback";
import {emit} from "../lib/bus";
import {categorize, isThemeTag, DOUBLON} from "../../../../core";
import {mountIsland} from "./islands/mount";

function Price({card, loading}) {
  const status = priceStatus(card.id, card.rarity);
  if (status === "ok") return <span class="recap-price">{fmt(priceOf(card.id, card.rarity))} ₩</span>;
  if (loading || status === "unknown") return <span class="spinner" aria-label="Chargement du prix" />;
  if (status === "error") return <span class="recap-price none" title="Le serveur n'a pas répondu ; nouvel essai dans quelques minutes">?</span>;
  return <span class="recap-price none" title="Cette carte n'a jamais été vendue dans cette rareté">aucune vente</span>;
}

// Étiquettes posées par le tri automatique (ou thème calculé si l'option est désactivée)
function SortTags({card, sort, index}) {
  if (!sort) return <ThemeChip theme={categorize(card)[0]} />;
  if (sort.status === "running")
    return (
      <span class="chip">
        <span class="spinner" style={{width: "10px", height: "10px", borderWidth: "2px"}} /> tri…
      </span>
    );
  if (sort.status === "error") return <ThemeChip theme={categorize(card)[0]} />;
  const r = sort.byIndex?.[index];
  if (!r || r.status === "unknown") return <span class="chip warn" title="Exemplaire introuvable : utilisez le tri manuel">non trié</span>;
  if (r.status === "already") return <span class="chip" title="Cet exemplaire avait déjà un thème : il n'a pas été modifié">déjà triée</span>;
  return (
    <>
      {r.tags.map((t) =>
        isThemeTag(t) ? <ThemeChip key={t} theme={t} /> : t === DOUBLON ? null : <span key={t} class="chip accent">{t}</span>,
      )}
    </>
  );
}

export function PackRecapView({onClose, compact = false}) {
  const recap = useStore(recapState);
  useStore(priceVersion);
  if (!recap.cards.length) return null;
  const loading = recap.pricesLoading;
  const prices = recap.cards.map((c) => priceOf(c.id, c.rarity));
  const total = prices.reduce((n, p) => n + (p || 0), 0);
  const unpriced = prices.filter((p) => p == null).length;
  const failed = recap.cards.filter((c) => priceStatus(c.id, c.rarity) === "error").length;
  const fresh = recap.cards.filter((c) => c.isNew === true).length;
  const known = recap.cards.some((c) => c.isNew != null);

  return (
    <section class="recap" aria-label="Récapitulatif du paquet">
      <header class="recap-head">
        <div class="logo recap-logo">WM</div>
        <div style={{flex: 1, minWidth: 0}}>
          <div class="recap-title">{recap.packs > 1 ? `${recap.packs} paquets ouverts` : "Récapitulatif du paquet"}</div>
          <div class="recap-sub">
            {plural(recap.cards.length, "carte")}
            {known && ` · ${plural(fresh, "nouvelle", "nouvelles")}`}
          </div>
        </div>
        <div class="recap-total">
          <span class="k">Valeur</span>
          {loading && unpriced ? <span class="spinner" aria-label="Chargement des prix" /> : unpriced === prices.length ? <span class="v none">—</span> : <span class="v">{fmt(total)} ₩</span>}
        </div>
        {onClose && (
          <button class="icon-btn" aria-label="Masquer le récapitulatif" onClick={onClose}>
            ×
          </button>
        )}
      </header>
      <ul class={`recap-list${compact ? " compact" : ""}`}>
        {recap.cards.map((c, i) => (
          <li key={`${c.id}-${i}`} class="recap-row" style={{"--rc": `var(--r-${c.rarity || "C"})`}}>
            {c.image_url && !c.hide_image ? <img class="recap-thumb" src={c.image_url} alt="" loading="lazy" referrerpolicy="no-referrer" /> : <div class="recap-thumb" />}
            <div class="recap-card">
              <div class="recap-name" title={c.wikipedia_title}>{c.wikipedia_title}</div>
              <div class="recap-meta">
                <Rarity r={c.rarity} />
                {c.isNew === true && <span class="chip ok">Nouvelle</span>}
                {c.isNew === false && <span class="chip danger">Doublon</span>}
                {c.is_shiny && <span class="chip warn">✨ Shiny</span>}
                <SortTags card={c} sort={recap.sort} index={i} />
              </div>
            </div>
            <Price card={c} loading={loading} />
          </li>
        ))}
      </ul>
      <footer class="recap-foot">
        <span class="small muted">
          {loading
            ? "Récupération des prix moyens du marché…"
            : failed
              ? `${plural(failed, "prix indisponible", "prix indisponibles")} (serveur WikiMasters), nouvel essai dans quelques minutes.`
              : unpriced
                ? `${plural(unpriced, "carte jamais vendue", "cartes jamais vendues")} dans sa rareté.`
                : "Prix moyens des 200 dernières ventes, par rareté."}
        </span>
        {recap.sort?.status === "done" && <span class="chip ok">✓ Cartes triées</span>}
        {recap.sort?.status === "error" && <span class="chip danger" title={recap.sort.error}>Tri automatique impossible</span>}
        {(!recap.sort || recap.sort.status === "error") && isOn("sortAfterPack") && known && fresh > 0 && (
          <button
            class="btn sm primary"
            onClick={() => {
              emit("open-panel", {tab: "sort"});
              planSort({newOnly: true}).catch((e) => toast(errorMessage(e), {type: "error"}));
            }}
          >
            Trier les nouvelles cartes
          </button>
        )}
      </footer>
    </section>
  );
}

// Bloc autonome inséré dans la page du site, isolé dans son propre Shadow DOM
export function mountPackRecap(host) {
  mountIsland(host, PackRecapView)({onClose: dismissRecap});
}
