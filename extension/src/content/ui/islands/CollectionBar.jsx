// Barre de la Toolbox sur la page Collection : trier les nouvelles cartes sur place (aperçu puis
// application, sur clic), filtrer toute la collection (doublons, sans image, GIF, jamais vendues ou
// vendues entre X et Y ₩ : cartes à cocher, mettre aux enchères ou défausser), raccourci vers les
// prix. Partage l'état du tri avec l'onglet « Tri » du panneau.
import {useStore} from "../../lib/store";
import {emit} from "../../lib/bus";
import {sortState, planSort, applySort} from "../../features/sorter";
import {collectionView, setCollectionView} from "../../features/collection-view";
import {isOn} from "../../state/settings";
import {Icon, Mark, Progress, Notice, ThemeChip, fmt, plural, timeAgo} from "../components";
import {CollectionFilters, CollectionCards} from "../CollectionCards";
import {toast} from "../feedback";
import {isThemeTag, DOUBLON} from "../../../../../core";

const openTab = (tab) => emit("open-panel", {tab});

function Plan({plan}) {
  const doublons = plan.doublonAdds.length + plan.doublonDels.length;
  if (!plan.insertCount && !plan.deleteCount)
    return (
      <div class="row">
        <Notice type="ok">Tout est déjà trié : aucune nouvelle carte, doublons à jour.</Notice>
        <button class="btn sm ghost" onClick={() => sortState.set({plan: null})}>Fermer</button>
      </div>
    );
  return (
    <div class="stack" style={{gap: "8px"}}>
      <div class="row">
        <strong>{plural(plan.scopedCount, "carte à classer", "cartes à classer")}</strong>
        <span class="muted small">
          {plural(plan.insertCount, "étiquette à ajouter", "étiquettes à ajouter")}
          {doublons ? ` · Doublon : +${plan.doublonAdds.length}${plan.doublonDels.length ? ` / −${plan.doublonDels.length}` : ""}` : ""}
        </span>
      </div>
      {plan.counts.length > 0 && (
        <div class="chips">
          {plan.counts.map((c) =>
            isThemeTag(c.name) ? (
              <ThemeChip key={c.name} theme={c.name} />
            ) : (
              <span key={c.name} class={`chip ${c.name === DOUBLON ? "danger" : "accent"}`}>
                {c.name}
              </span>
            ),
          )}
        </div>
      )}
      {plan.cards.length > 0 && (
        <p class="small muted">
          {plan.cards
            .slice(0, 6)
            .map((c) => c.title)
            .join(", ")}
          {plan.cards.length > 6 ? `… et ${fmt(plan.cards.length - 6)} autres` : ""}
        </p>
      )}
      <div class="row">
        <button
          class="btn sm primary"
          onClick={() =>
            applySort(plan)
              .then((r) => toast(`${plural(r.sorted, "carte triée", "cartes triées")}${r.failed ? `, ${r.failed} échec(s)` : ""}.`, {type: r.failed ? "error" : "ok"}))
              .catch(() => {})
          }
        >
          Appliquer
        </button>
        <button class="btn sm" onClick={() => openTab("sort")}>Voir le détail</button>
        <button class="btn sm ghost" onClick={() => sortState.set({plan: null})}>Annuler</button>
      </div>
    </div>
  );
}

// Filtres de toute la collection (le site n'en montre que 50 cartes par page) : dès qu'un filtre est
// choisi, la liste remplace la grille du site, masquée par site-dom.js. onOpen : ouvre une carte
// dans la fenêtre du site.
function CollectionViews({onOpen}) {
  const filter = useStore(collectionView);
  const aside = filter.open ? (
    <button class="btn sm ghost" onClick={() => setCollectionView(null)}>
      <Icon name="close" size={14} /> Revenir à la grille du site
    </button>
  ) : (
    <span class="filter-hint">Choisissez un filtre : toute votre collection s'affiche ici, à la place de la grille du site.</span>
  );
  return (
    <>
      <CollectionFilters filter={filter} active={filter.open} onChange={setCollectionView} aside={aside} />
      {filter.open && filter.kinds.includes("none") && isOn("missingImages") && (
        <p class="small muted">Une vignette ne montrant qu'une initiale : aucune image, même sur Wikimedia.</p>
      )}
      {filter.open && <CollectionCards filter={filter} onOpen={onOpen} mini />}
    </>
  );
}

export function CollectionBar({onOpen}) {
  const s = useStore(sortState);
  const plan = s.plan?.newOnly ? s.plan : null;
  return (
    <section class="island" aria-label="WikiMasters Toolbox">
      <div class="island-head">
        <Mark size={22} />
        <div>
          <div class="island-title">Toolbox</div>
          <div class="island-sub">{s.lastRun ? `Dernier tri ${timeAgo(s.lastRun.at)}` : "Aucun tri pour l'instant"}</div>
        </div>
        <div class="island-actions">
          <button class="btn sm primary" disabled={s.running} onClick={() => planSort({newOnly: true}).catch(() => {})}>
            Trier les nouvelles cartes
          </button>
          <button class="btn sm" onClick={() => openTab("prices")}>Prix et valeur</button>
          <button class="btn sm ghost" onClick={() => openTab("sort")} title="Ouvrir la Toolbox" aria-label="Ouvrir la Toolbox">
            <Icon name="more" size={14} />
          </button>
        </div>
      </div>
      {s.running && <Progress done={s.progress?.done || 0} total={s.progress?.total} label={s.step || "En cours…"} />}
      {s.error && !s.running && <Notice type="error">{s.error}</Notice>}
      {plan && !s.running && <Plan plan={plan} />}
      {s.plan && !s.plan.newOnly && !s.running && (
        <div class="row small muted">
          Un aperçu du retri complet attend dans la Toolbox.
          <button class="btn sm" onClick={() => openTab("sort")}>Ouvrir</button>
        </div>
      )}
      {s.result && !s.plan && !s.running && (
        <div class="row">
          <Notice type="ok">
            Tri terminé : {plural(s.result.inserted, "étiquette ajoutée", "étiquettes ajoutées")}
            {s.result.deleted ? `, ${fmt(s.result.deleted)} retirée(s)` : ""}. Le site les affichera après actualisation.
          </Notice>
          <button class="btn sm" onClick={() => location.reload()}>Actualiser</button>
          <button class="btn sm ghost" onClick={() => sortState.set({result: null})}>Fermer</button>
        </div>
      )}
      <CollectionViews onOpen={onOpen} />
    </section>
  );
}
