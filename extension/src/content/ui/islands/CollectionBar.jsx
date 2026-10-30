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
import {DOUBLON} from "../../../../../core";
import {isTheme} from "../../state/themes";
import {L} from "../../../shared/i18n";

const openTab = (tab) => emit("open-panel", {tab});

function Plan({plan}) {
  const doublons = plan.doublonAdds.length + plan.doublonDels.length;
  if (!plan.insertCount && !plan.deleteCount)
    return (
      <div class="row">
        <Notice type="ok">{L("Tout est déjà trié : aucune nouvelle carte, doublons à jour.", "Everything is already sorted: no new cards, duplicates up to date.")}</Notice>
        <button class="btn sm ghost" onClick={() => sortState.set({plan: null})}>{L("Fermer", "Close")}</button>
      </div>
    );
  return (
    <div class="stack" style={{gap: "8px"}}>
      <div class="row">
        <strong>{L(plural(plan.scopedCount, "carte à classer", "cartes à classer"), `${fmt(plan.scopedCount)} ${plan.scopedCount === 1 ? "card" : "cards"} to sort`)}</strong>
        <span class="muted small">
          {L(plural(plan.insertCount, "étiquette à ajouter", "étiquettes à ajouter"), `${fmt(plan.insertCount)} ${plan.insertCount === 1 ? "tag" : "tags"} to add`)}
          {doublons ? L(` · Doublon : +${plan.doublonAdds.length}`, ` · Doublon: +${plan.doublonAdds.length}`) + (plan.doublonDels.length ? ` / −${plan.doublonDels.length}` : "") : ""}
        </span>
      </div>
      {plan.counts.length > 0 && (
        <div class="chips">
          {plan.counts.map((c) =>
            isTheme(c.name) ? (
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
          {plan.cards.length > 6 ? L(`… et ${fmt(plan.cards.length - 6)} autres`, `… and ${fmt(plan.cards.length - 6)} more`) : ""}
        </p>
      )}
      <div class="row">
        <button
          class="btn sm primary"
          onClick={() =>
            applySort(plan)
              .then((r) =>
                toast(
                  L(
                    `${plural(r.sorted, "carte triée", "cartes triées")}${r.failed ? `, ${r.failed} échec(s)` : ""}.`,
                    `${fmt(r.sorted)} ${r.sorted === 1 ? "card" : "cards"} sorted${r.failed ? `, ${r.failed} failed` : ""}.`,
                  ),
                  {type: r.failed ? "error" : "ok"},
                ),
              )
              .catch(() => {})
          }
        >
          {L("Appliquer", "Apply")}
        </button>
        <button class="btn sm" onClick={() => openTab("sort")}>{L("Voir le détail", "View details")}</button>
        <button class="btn sm ghost" onClick={() => sortState.set({plan: null})}>{L("Annuler", "Cancel")}</button>
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
      <Icon name="close" size={14} /> {L("Revenir à la grille du site", "Back to the site grid")}
    </button>
  ) : (
    <span class="filter-hint">{L("Choisissez un filtre : toute votre collection s'affiche ici, à la place de la grille du site.", "Pick a filter: your whole collection shows here, in place of the site grid.")}</span>
  );
  return (
    <>
      <CollectionFilters filter={filter} active={filter.open} onChange={setCollectionView} aside={aside} />
      {filter.open && filter.kinds.includes("none") && isOn("missingImages") && (
        <p class="small muted">{L("Une carte qui ne montre que le logo du site : aucune image, même sur Wikimedia.", "A card showing only the site logo: no image, not even on Wikimedia.")}</p>
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
          <div class="island-sub">{s.lastRun ? L(`Dernier tri ${timeAgo(s.lastRun.at)}`, `Last sorted ${timeAgo(s.lastRun.at)}`) : L("Aucun tri pour l'instant", "Not sorted yet")}</div>
        </div>
        <div class="island-actions">
          <button class="btn sm primary" disabled={s.running} onClick={() => planSort({newOnly: true}).catch(() => {})}>
            {L("Trier les nouvelles cartes", "Sort new cards")}
          </button>
          <button class="btn sm" onClick={() => openTab("prices")}>{L("Prix et valeur", "Prices and value")}</button>
          <button class="btn sm ghost" onClick={() => openTab("sort")} title={L("Ouvrir la Toolbox", "Open the Toolbox")} aria-label={L("Ouvrir la Toolbox", "Open the Toolbox")}>
            <Icon name="more" size={14} />
          </button>
        </div>
      </div>
      {s.running && <Progress done={s.progress?.done || 0} total={s.progress?.total} label={s.step || L("En cours…", "In progress…")} />}
      {s.error && !s.running && <Notice type="error">{s.error}</Notice>}
      {plan && !s.running && <Plan plan={plan} />}
      {s.plan && !s.plan.newOnly && !s.running && (
        <div class="row small muted">
          {L("Un aperçu du retri complet attend dans la Toolbox.", "A full re-sort preview is waiting in the Toolbox.")}
          <button class="btn sm" onClick={() => openTab("sort")}>{L("Ouvrir", "Open")}</button>
        </div>
      )}
      {s.result && !s.plan && !s.running && (
        <div class="row">
          <Notice type="ok">
            {L(
              `Tri terminé : ${plural(s.result.inserted, "étiquette ajoutée", "étiquettes ajoutées")}${s.result.deleted ? `, ${fmt(s.result.deleted)} retirée(s)` : ""}. Le site les affichera après actualisation.`,
              `Sort complete: ${fmt(s.result.inserted)} ${s.result.inserted === 1 ? "tag" : "tags"} added${s.result.deleted ? `, ${fmt(s.result.deleted)} removed` : ""}. The site will show them after a refresh.`,
            )}
          </Notice>
          <button class="btn sm" onClick={() => location.reload()}>{L("Actualiser", "Refresh")}</button>
          <button class="btn sm ghost" onClick={() => sortState.set({result: null})}>{L("Fermer", "Close")}</button>
        </div>
      )}
      <CollectionViews onOpen={onOpen} />
    </section>
  );
}
