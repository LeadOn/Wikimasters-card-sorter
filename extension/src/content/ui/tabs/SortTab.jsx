// Onglet « Tri » : trier les nouvelles cartes, doublons, retri complet.
import {useState} from "preact/hooks";
import {useStore} from "../../lib/store";
import {sortState, planSort, applySort} from "../../features/sorter";
import {activeProfiles} from "../../state/profiles";
import {Progress, Notice, ThemeChip, fmt, plural, timeAgo} from "../components";
import {confirmAction, toast, errorMessage} from "../feedback";
import {DOUBLON} from "../../../../../core";
import {isTheme} from "../../state/themes";
import {L} from "../../../shared/i18n";

function TagCounts({counts}) {
  const max = Math.max(1, ...counts.map((c) => c.count));
  return (
    <table class="list">
      <tbody>
        {counts.map(({name, count}) => (
          <tr key={name}>
            <td style={{width: "45%"}}>{isTheme(name) ? <ThemeChip theme={name} /> : <span class={`chip ${name === DOUBLON ? "danger" : "accent"}`}>{name}</span>}</td>
            <td>
              <div class="bar" style={{width: `${(100 * count) / max}%`}} />
            </td>
            <td class="num" style={{width: "70px"}}>{fmt(count)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const retiredList = (retired) => retired.map((t) => `${t.name} (${plural(t.count, L("carte", "card"))})`).join(", ");

function PlanView({plan}) {
  const [filter, setFilter] = useState("");
  const q = filter.trim().toLowerCase();
  const cards = q ? plan.cards.filter((c) => `${c.title} ${c.tags.join(" ")}`.toLowerCase().includes(q)) : plan.cards;
  const nothing = !plan.insertCount && !plan.deleteCount && !plan.extraTagIds.length && !plan.renamed?.length;
  return (
    <div class="stack">
      <div class="grid-stats">
        <div class="stat"><div class="k">{plan.newOnly ? L("Cartes non triées", "Unsorted cards") : L("Cartes classées", "Cards sorted")}</div><div class="v">{fmt(plan.scopedCount)}</div></div>
        <div class="stat"><div class="k">{L("Étiquettes à ajouter", "Tags to add")}</div><div class="v">{fmt(plan.insertCount)}</div></div>
        <div class="stat"><div class="k">{L("Étiquettes à retirer", "Tags to remove")}</div><div class="v">{fmt(plan.deleteCount)}</div></div>
        <div class="stat"><div class="k">{L("Collection", "Collection")}</div><div class="v">{fmt(plan.total)}</div></div>
      </div>
      {nothing && <Notice type="ok">{L("Tout est déjà à jour : rien à écrire.", "Everything is up to date: nothing to write.")}</Notice>}
      {plan.upserts.create.length > 0 && (
        <Notice>{L("Étiquettes créées : ", "Tags created: ")}{plan.upserts.create.map((t) => t.name).join(", ")}.</Notice>
      )}
      {plan.renamed?.length > 0 && <Notice>{L("Étiquettes renommées (thèmes renommés dans les réglages) : ", "Tags renamed (themes renamed in settings): ")}{plan.renamed.map((r) => `${r.from} → ${r.to}`).join(", ")}.</Notice>}
      {plan.retired?.length > 0 &&
        (plan.newOnly ? (
          <Notice>
            {L(
              `Étiquettes de thèmes supprimés, laissées en place : ${retiredList(plan.retired)}. Leurs cartes comptent comme triées ; le retri complet les reclasse et retire ces étiquettes.`,
              `Tags of deleted themes, left in place: ${retiredList(plan.retired)}. Their cards count as sorted; a full re-sort re-sorts them and removes these tags.`,
            )}
          </Notice>
        ) : (
          <Notice type="warn">{L(`Étiquettes de thèmes supprimés, retirées puis supprimées : ${retiredList(plan.retired)}. Leurs cartes reçoivent un thème de votre liste.`, `Tags of deleted themes, removed then deleted: ${retiredList(plan.retired)}. Their cards get a theme from your list.`)}</Notice>
        ))}
      {plan.unmanaged.length > 0 && <p class="small muted">{L("Vos étiquettes personnelles ne seront pas touchées : ", "Your personal tags will not be touched: ")}{plan.unmanaged.join(", ")}.</p>}
      {(plan.doublonAdds.length > 0 || plan.doublonDels.length > 0) && (
        <div class="box">
          <h3>{L("Doublons", "Duplicates")}</h3>
          {plan.doublonAdds.length > 0 && <p class="small">+ {plan.doublonAdds.join(", ")}</p>}
          {plan.doublonDels.length > 0 && <p class="small muted">− {plan.doublonDels.join(", ")}</p>}
        </div>
      )}
      {plan.counts.length > 0 && (
        <div class="box">
          <h3>{L("Répartition", "Breakdown")}</h3>
          <TagCounts counts={plan.counts} />
        </div>
      )}
      {plan.cards.length > 0 && (
        <div class="box stack">
          <div class="row">
            <h3 style={{flex: 1}}>{L("Détail par carte", "Per-card details")}</h3>
            <input type="search" placeholder={L("Filtrer…", "Filter…")} style={{maxWidth: "240px"}} value={filter} onInput={(e) => setFilter(e.currentTarget.value)} />
          </div>
          <table class="list">
            <thead>
              <tr><th>{L("Carte", "Card")}</th><th>{L("Étiquettes", "Tags")}</th></tr>
            </thead>
            <tbody>
              {cards.slice(0, 300).map((c) => (
                <tr key={c.id}>
                  <td>
                    <div style={{fontWeight: 600}}>{c.title}</div>
                    <div class="small muted">{c.category}</div>
                  </td>
                  <td>
                    <div class="chips">
                      {c.tags.map((t) => (isTheme(t) ? <ThemeChip key={t} theme={t} /> : <span key={t} class={`chip ${t === DOUBLON ? "danger" : "accent"}`}>{t}</span>))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {cards.length > 300 && <p class="small muted">{L(`… et ${fmt(cards.length - 300)} autres.`, `… and ${fmt(cards.length - 300)} more.`)}</p>}
        </div>
      )}
    </div>
  );
}

export function SortTab() {
  const s = useStore(sortState);
  const profiles = activeProfiles();

  const preview = async (newOnly) => {
    try {
      await planSort({newOnly});
    } catch (e) {
      toast(errorMessage(e), {type: "error"});
    }
  };

  const apply = async () => {
    const plan = s.plan;
    if (!plan.newOnly) {
      const ok = await confirmAction({
        title: L("Appliquer le retri complet ?", "Apply the full re-sort?"),
        body: L(
          `Toute la collection est resynchronisée : ${fmt(plan.insertCount)} étiquette(s) ajoutée(s), ${fmt(plan.deleteCount)} retirée(s). Les corrections faites à la main sur une étiquette gérée (thème, « Pour : … », Doublon) seront écrasées.${
            plan.retired?.length ? ` Étiquettes de thèmes supprimés, supprimées : ${retiredList(plan.retired)}.` : ""
          } Vos étiquettes personnelles ne sont jamais touchées.`,
          `The whole collection is resynced: ${fmt(plan.insertCount)} tag(s) added, ${fmt(plan.deleteCount)} removed. Manual fixes to a managed tag (theme, "Pour : …", Doublon) will be overwritten.${
            plan.retired?.length ? ` Tags of deleted themes, deleted: ${retiredList(plan.retired)}.` : ""
          } Your personal tags are never touched.`,
        ),
        confirm: L("Appliquer", "Apply"),
        danger: true,
      });
      if (!ok) return;
    }
    try {
      const r = await applySort(plan);
      toast(
        L(
          `Tri terminé : ${plan.newOnly ? plural(r.sorted, "carte triée", "cartes triées") : "collection resynchronisée"}${r.failed ? `, ${r.failed} échec(s)` : ""}.`,
          `Sort complete: ${plan.newOnly ? plural(r.sorted, "card sorted", "cards sorted") : "collection resynced"}${r.failed ? `, ${r.failed} failure(s)` : ""}.`,
        ),
        {type: r.failed ? "error" : "ok"});
    } catch (e) {
      toast(errorMessage(e), {type: "error"});
    }
  };

  return (
    <div class="stack">
      <div class="page-head">
        <div>
          <h2>{L("Tri automatique", "Automatic sort")}</h2>
          <p>{L("Un thème par carte, les étiquettes « Pour : … » de vos profils d'intérêts et l'étiquette Doublon. Vos étiquettes personnelles ne sont jamais modifiées.", 'One theme per card, the "Pour : …" tags of your interest profiles and the Doublon tag. Your personal tags are never changed.')}</p>
        </div>
      </div>

      <div class="grid-2">
        <div class="box stack">
          <div>
            <h3>{L("Trier mes nouvelles cartes", "Sort my new cards")}</h3>
            <p class="help">{L("Classe les cartes qui n'ont encore aucun thème et met à jour les doublons. Les cartes déjà triées, et vos corrections, ne sont pas modifiées.", "Sorts the cards that have no theme yet and updates duplicates. Cards already sorted, and your fixes, are left unchanged.")}</p>
          </div>
          <div class="row">
            <button class="btn primary" disabled={s.running} onClick={() => preview(true)}>{L("Aperçu du tri", "Preview sort")}</button>
          </div>
        </div>
        <div class="box stack">
          <div>
            <h3>{L("Retri complet", "Full re-sort")}</h3>
            <p class="help">{L("Resynchronise toute la collection sur le moteur actuel, par exemple après avoir modifié vos profils ou mis à jour l'extension. Les étiquettes gérées qui ne correspondent plus sont retirées.", "Resyncs the whole collection with the current engine, for example after editing your profiles or updating the extension. Managed tags that no longer match are removed.")}</p>
          </div>
          <div class="row">
            <button class="btn" disabled={s.running} onClick={() => preview(false)}>{L("Aperçu du retri complet", "Preview full re-sort")}</button>
          </div>
        </div>
      </div>

      <p class="small muted">
        {L("Profils appliqués : ", "Profiles applied: ")}
        {profiles.length ? profiles.map((p) => p.name).join(", ") : L("aucun (ajoutez-en dans l'onglet Profils)", "none (add some in the Profiles tab)")}
        {s.lastRun && L(` · Dernier tri ${timeAgo(s.lastRun.at)} (${plural(s.lastRun.sorted, "carte")})`, ` · Last sort ${timeAgo(s.lastRun.at)} (${plural(s.lastRun.sorted, "card")})`)}
      </p>

      {s.running && (
        <div class="box">
          <Progress done={s.progress?.done || 0} total={s.progress?.total} label={s.step || L("En cours…", "In progress…")} />
          <p class="small muted" style={{marginTop: "8px"}}>{L("La base de WikiMasters est lente : comptez une à deux minutes.", "The WikiMasters database is slow: allow one to two minutes.")}</p>
        </div>
      )}
      {s.error && !s.running && <Notice type="error">{s.error}</Notice>}
      {s.result && !s.plan && (
        <Notice type="ok">
          {L(
            `Terminé : ${fmt(s.result.inserted)} étiquette(s) ajoutée(s), ${fmt(s.result.deleted)} retirée(s)${s.result.failed ? `, ${s.result.failed} échec(s)` : ""}.`,
            `Done: ${fmt(s.result.inserted)} tag(s) added, ${fmt(s.result.deleted)} removed${s.result.failed ? `, ${s.result.failed} failure(s)` : ""}.`,
          )}
        </Notice>
      )}
      {s.plan && !s.running && (
        <div class="stack">
          <div class="row">
            <h3 class="section-title" style={{flex: 1}}>{s.plan.newOnly ? L("Aperçu : nouvelles cartes", "Preview: new cards") : L("Aperçu : retri complet", "Preview: full re-sort")}</h3>
            <button class="btn ghost" onClick={() => sortState.set({plan: null})}>{L("Annuler", "Cancel")}</button>
            <button
              class={`btn ${s.plan.newOnly ? "primary" : "danger"}`}
              disabled={!s.plan.insertCount && !s.plan.deleteCount && !s.plan.upserts.recolor.length && !s.plan.upserts.create.length && !s.plan.extraTagIds.length && !s.plan.renamed?.length}
              onClick={apply}
            >
              {L("Appliquer", "Apply")}
            </button>
          </div>
          <PlanView plan={s.plan} />
        </div>
      )}
    </div>
  );
}
