// Onglet « Tri » : trier les nouvelles cartes, doublons, retri complet.
import {useState} from "preact/hooks";
import {useStore} from "../../lib/store";
import {sortState, planSort, applySort} from "../../features/sorter";
import {activeProfiles} from "../../state/profiles";
import {Progress, Notice, ThemeChip, fmt, plural, timeAgo} from "../components";
import {confirmAction, toast, errorMessage} from "../feedback";
import {isThemeTag, DOUBLON} from "../../../../../core";

function TagCounts({counts}) {
  const max = Math.max(1, ...counts.map((c) => c.count));
  return (
    <table class="list">
      <tbody>
        {counts.map(({name, count}) => (
          <tr key={name}>
            <td style={{width: "45%"}}>{isThemeTag(name) ? <ThemeChip theme={name} /> : <span class={`chip ${name === DOUBLON ? "danger" : "accent"}`}>{name}</span>}</td>
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

function PlanView({plan}) {
  const [filter, setFilter] = useState("");
  const q = filter.trim().toLowerCase();
  const cards = q ? plan.cards.filter((c) => `${c.title} ${c.tags.join(" ")}`.toLowerCase().includes(q)) : plan.cards;
  const nothing = !plan.insertCount && !plan.deleteCount;
  return (
    <div class="stack">
      <div class="grid-stats">
        <div class="stat"><div class="k">{plan.newOnly ? "Cartes non triées" : "Cartes classées"}</div><div class="v">{fmt(plan.scopedCount)}</div></div>
        <div class="stat"><div class="k">Étiquettes à ajouter</div><div class="v">{fmt(plan.insertCount)}</div></div>
        <div class="stat"><div class="k">Étiquettes à retirer</div><div class="v">{fmt(plan.deleteCount)}</div></div>
        <div class="stat"><div class="k">Collection</div><div class="v">{fmt(plan.total)}</div></div>
      </div>
      {nothing && <Notice type="ok">Tout est déjà à jour : rien à écrire.</Notice>}
      {plan.upserts.create.length > 0 && (
        <Notice>Étiquettes créées : {plan.upserts.create.map((t) => t.name).join(", ")}.</Notice>
      )}
      {plan.unmanaged.length > 0 && <p class="small muted">Vos étiquettes personnelles ne seront pas touchées : {plan.unmanaged.join(", ")}.</p>}
      {(plan.doublonAdds.length > 0 || plan.doublonDels.length > 0) && (
        <div class="box">
          <h3>Doublons</h3>
          {plan.doublonAdds.length > 0 && <p class="small">+ {plan.doublonAdds.join(", ")}</p>}
          {plan.doublonDels.length > 0 && <p class="small muted">− {plan.doublonDels.join(", ")}</p>}
        </div>
      )}
      {plan.counts.length > 0 && (
        <div class="box">
          <h3>Répartition</h3>
          <TagCounts counts={plan.counts} />
        </div>
      )}
      {plan.cards.length > 0 && (
        <div class="box stack">
          <div class="row">
            <h3 style={{flex: 1}}>Détail par carte</h3>
            <input type="search" placeholder="Filtrer…" style={{maxWidth: "240px"}} value={filter} onInput={(e) => setFilter(e.currentTarget.value)} />
          </div>
          <table class="list">
            <thead>
              <tr><th>Carte</th><th>Étiquettes</th></tr>
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
                      {c.tags.map((t) => (isThemeTag(t) ? <ThemeChip key={t} theme={t} /> : <span key={t} class={`chip ${t === DOUBLON ? "danger" : "accent"}`}>{t}</span>))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {cards.length > 300 && <p class="small muted">… et {fmt(cards.length - 300)} autres.</p>}
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
        title: "Appliquer le retri complet ?",
        body: `Toute la collection est resynchronisée : ${fmt(plan.insertCount)} étiquette(s) ajoutée(s), ${fmt(plan.deleteCount)} retirée(s). Les corrections faites à la main sur une étiquette gérée (thème, « Pour : … », Doublon) seront écrasées. Vos étiquettes personnelles ne sont jamais touchées.`,
        confirm: "Appliquer",
        danger: true,
      });
      if (!ok) return;
    }
    try {
      const r = await applySort(plan);
      toast(`Tri terminé : ${plan.newOnly ? plural(r.sorted, "carte triée", "cartes triées") : "collection resynchronisée"}${r.failed ? `, ${r.failed} échec(s)` : ""}.`, {type: r.failed ? "error" : "ok"});
    } catch (e) {
      toast(errorMessage(e), {type: "error"});
    }
  };

  return (
    <div class="stack">
      <div class="page-head">
        <div>
          <h2>Tri automatique</h2>
          <p>Un thème par carte, les étiquettes « Pour : … » de vos profils d'intérêts et l'étiquette Doublon. Vos étiquettes personnelles ne sont jamais modifiées.</p>
        </div>
      </div>

      <div class="grid-2">
        <div class="box stack">
          <div>
            <h3>Trier mes nouvelles cartes</h3>
            <p class="help">Classe les cartes qui n'ont encore aucun thème et met à jour les doublons. Les cartes déjà triées, et vos corrections, ne sont pas modifiées.</p>
          </div>
          <div class="row">
            <button class="btn primary" disabled={s.running} onClick={() => preview(true)}>Aperçu du tri</button>
          </div>
        </div>
        <div class="box stack">
          <div>
            <h3>Retri complet</h3>
            <p class="help">Resynchronise toute la collection sur le moteur actuel, par exemple après avoir modifié vos profils ou mis à jour l'extension. Les étiquettes gérées qui ne correspondent plus sont retirées.</p>
          </div>
          <div class="row">
            <button class="btn" disabled={s.running} onClick={() => preview(false)}>Aperçu du retri complet</button>
          </div>
        </div>
      </div>

      <p class="small muted">
        Profils appliqués : {profiles.length ? profiles.map((p) => p.name).join(", ") : "aucun (ajoutez-en dans l'onglet Profils)"}
        {s.lastRun && ` · Dernier tri ${timeAgo(s.lastRun.at)} (${plural(s.lastRun.sorted, "carte")})`}
      </p>

      {s.running && (
        <div class="box">
          <Progress done={s.progress?.done || 0} total={s.progress?.total} label={s.step || "En cours…"} />
          <p class="small muted" style={{marginTop: "8px"}}>La base de WikiMasters est lente : comptez une à deux minutes.</p>
        </div>
      )}
      {s.error && !s.running && <Notice type="error">{s.error}</Notice>}
      {s.result && !s.plan && (
        <Notice type="ok">
          Terminé : {fmt(s.result.inserted)} étiquette(s) ajoutée(s), {fmt(s.result.deleted)} retirée(s){s.result.failed ? `, ${s.result.failed} échec(s)` : ""}.
        </Notice>
      )}
      {s.plan && !s.running && (
        <div class="stack">
          <div class="row">
            <h3 class="section-title" style={{flex: 1}}>{s.plan.newOnly ? "Aperçu : nouvelles cartes" : "Aperçu : retri complet"}</h3>
            <button class="btn ghost" onClick={() => sortState.set({plan: null})}>Annuler</button>
            <button
              class={`btn ${s.plan.newOnly ? "primary" : "danger"}`}
              disabled={!s.plan.insertCount && !s.plan.deleteCount && !s.plan.upserts.recolor.length && !s.plan.upserts.create.length && !s.plan.extraTagIds.length}
              onClick={apply}
            >
              Appliquer
            </button>
          </div>
          <PlanView plan={s.plan} />
        </div>
      )}
    </div>
  );
}
