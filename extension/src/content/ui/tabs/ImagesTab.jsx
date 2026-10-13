// Onglet « Images » : les cartes de ma collection sans image, et celles dont l'image est un GIF.
import {useState, useEffect, useMemo} from "preact/hooks";
import {useStore} from "../../lib/store";
import {imageState, loadImageGroups} from "../../features/card-images";
import {isOn} from "../../state/settings";
import {Progress, Notice, fmt} from "../components";
import {ImageFilterSeg, ImageCards} from "../ImageCards";
import {RARITIES, RARITY_LABEL} from "../../../../../core";

export function ImagesTab() {
  const s = useStore(imageState);
  const [filter, setFilter] = useState("none");
  const [rarities, setRarities] = useState([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    loadImageGroups();
  }, []);

  const group = s.groups?.[filter] || [];
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return group.filter((c) => (!rarities.length || rarities.includes(c.rarity)) && (!q || `${c.card.wikipedia_title} ${c.card.category || ""}`.toLowerCase().includes(q)));
  }, [group, rarities, query]);
  const hidden = s.groups ? s.groups.none.filter((c) => c.card.hide_image).length : 0;
  const count = (r) => group.filter((c) => c.rarity === r).length;

  return (
    <div class="stack">
      <div class="page-head">
        <div>
          <h2>Images</h2>
          <p>Les cartes de toute votre collection qui n'ont pas d'image, et celles dont l'image est un GIF. Sur la page Collection, la barre Toolbox offre le même filtre.</p>
        </div>
      </div>
      {s.error && <Notice type="error">{s.error}</Notice>}
      {!s.groups && s.loading && <Progress label="Lecture de votre collection" done={s.progress} />}
      {s.groups && (
        <>
          <div class="grid-stats">
            <div class="stat"><div class="k">Sans image</div><div class="v">{fmt(s.groups.none.length)}</div></div>
            <div class="stat"><div class="k">dont masquées par le site</div><div class="v">{fmt(hidden)}</div></div>
            <div class="stat"><div class="k">GIF</div><div class="v">{fmt(s.groups.gif.length)}</div></div>
          </div>

          <div class="box stack">
            <div class="row">
              <ImageFilterSeg value={filter} onChange={setFilter} groups={s.groups} />
              <input type="search" placeholder="Titre ou description…" style={{maxWidth: "240px", marginLeft: "auto"}} value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
            </div>
            <div class="chips">
              {RARITIES.filter((r) => count(r) || rarities.includes(r)).map((r) => (
                <button key={r} class={`chip${rarities.includes(r) ? " on" : ""}`} onClick={() => setRarities(rarities.includes(r) ? rarities.filter((x) => x !== r) : [...rarities, r])}>
                  {RARITY_LABEL[r]} · {fmt(count(r))}
                </button>
              ))}
            </div>
            {filter === "none" ? (
              <p class="help">
                Le site n'a pas d'image pour ces cartes, ou l'a masquée (image signalée).{" "}
                {isOn("missingImages")
                  ? "Les vignettes montrent l'image trouvée sur Wikimedia par l'option Images manquantes ; une initiale signale un article qu'aucune image n'illustre, sur Wikipédia comme sur Wikidata. Une image masquée par le site n'est jamais remplacée."
                  : "Activez Images manquantes dans les réglages pour leur chercher une image sur Wikimedia."}
              </p>
            ) : (
              <p class="help">Image au format GIF, le plus souvent animée (quelques logos anciens sont des GIF fixes).</p>
            )}
            <ImageCards items={items} filter={filter} empty={group.length ? "Aucune carte ne correspond à ces filtres." : undefined} />
          </div>
        </>
      )}
    </div>
  );
}
