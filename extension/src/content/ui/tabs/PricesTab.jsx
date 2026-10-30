// Onglet « Prix » : prix du marché, valeur de ma collection, classement des plus chères et
// collection filtrée par vente (jamais vendues, vendues entre X et Y ₩ : à mettre aux enchères ou
// à défausser).
import {useState, useEffect, useMemo, useRef} from "preact/hooks";
import {useStore} from "../../lib/store";
import {loadMyCollection} from "../../state/collection";
import {priceOf, priceStatus, priceOptions, priceVersion, loadPrices, hasFreshPrice} from "../../state/prices";
import {CardRow, Money, Paged, Progress, Notice, fmt, plural} from "../components";
import {CollectionFilters, CollectionCards} from "../CollectionCards";
import {DEFAULT_FILTER} from "../../features/collection-view";
import {toast, errorMessage} from "../feedback";
import {RARITIES, RARITY_LABEL, RECENT_SALES} from "../../../../../core";
import {themeMemo} from "../../state/themes";
import {L} from "../../../shared/i18n";

export function PricesTab() {
  useStore(priceVersion);
  const [copies, setCopies] = useState(null);
  const [error, setError] = useState(null);
  const [rarities, setRarities] = useState([...RARITIES]);
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [bulk, setBulk] = useState(null);
  const [theme, setTheme] = useState(null);
  const [view, setView] = useState("top"); // "top" : les plus chères ; "filter" : collection filtrée
  const [filter, setFilter] = useState({...DEFAULT_FILTER, sale: "never"});
  const abort = useRef(null);

  useEffect(() => {
    loadMyCollection()
      .then(setCopies)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  // Exemplaires regroupés par carte, rareté et version (une shiny a son propre prix)
  const unique = useMemo(() => {
    if (!copies) return [];
    const m = new Map();
    for (const c of copies) {
      const key = `${c.card_id}|${c.rarity}|${c.is_shiny ? 1 : 0}`;
      const prev = m.get(key);
      m.set(key, prev ? {...prev, count: prev.count + c.count} : {...c});
    }
    return [...m.values()];
  }, [copies]);

  const valued = unique.map((c) => ({...c, price: priceOf(c.card_id, c.rarity, {shiny: c.is_shiny})}));
  const total = valued.reduce((n, c) => n + (c.price || 0) * c.count, 0);
  const pricedCopies = valued.filter((c) => c.price != null).reduce((n, c) => n + c.count, 0);
  // Vendus, mais trop peu de fois pour un prix fiable : hors de la valeur et du classement
  const fewCopies = valued.filter((c) => priceStatus(c.card_id, c.rarity, {shiny: c.is_shiny}) === "few").reduce((n, c) => n + c.count, 0);
  const allCopies = valued.reduce((n, c) => n + c.count, 0);
  const byRarity = RARITIES.map((r) => {
    const list = valued.filter((c) => c.rarity === r);
    return {r, copies: list.reduce((n, c) => n + c.count, 0), priced: list.filter((c) => c.price != null).length, value: list.reduce((n, c) => n + (c.price || 0) * c.count, 0)};
  });
  // Thème de chaque carte, calculé une seule fois (le classement est recalculé à chaque prix reçu)
  const themeCache = useMemo(() => themeMemo(), [copies]);
  const themeOf = (card) => themeCache(card.id, card);
  const ranking = useMemo(
    () =>
      valued
        .filter((c) => c.price != null)
        .map((c) => ({...c, theme: themeOf(c.card)}))
        .sort((a, b) => b.price - a.price),
    [copies, priceVersion.get().v],
  );
  const themes = [...new Set(ranking.map((c) => c.theme))].sort();

  const startBulk = async () => {
    const items = unique.filter((c) => rarities.includes(c.rarity) && (!onlyMissing || !hasFreshPrice(c.card_id))).map((c) => ({id: c.card_id, rarity: c.rarity}));
    if (!items.length) return toast(L("Tous les prix de ces raretés sont déjà à jour.", "All prices for these rarities are already up to date."), {type: "ok"});
    abort.current = new AbortController();
    setBulk({done: 0, total: new Set(items.map((x) => x.id)).size});
    try {
      await loadPrices(items, {force: !onlyMissing, signal: abort.current.signal, onProgress: (done, t) => setBulk({done, total: t})});
      toast(L("Prix chargés.", "Prices loaded."), {type: "ok"});
    } catch (e) {
      toast(errorMessage(e), {type: "error"});
    } finally {
      setBulk(null);
    }
  };

  const count = (r) => unique.filter((c) => c.rarity === r).length;
  const todo = unique.filter((c) => rarities.includes(c.rarity) && (!onlyMissing || !hasFreshPrice(c.card_id))).length;

  return (
    <div class="stack">
      <div class="page-head">
        <div>
          <h2>{L("Prix", "Prices")}</h2>
          <p>
            {L(
              `Prix du marché de chaque exemplaire dans sa rareté : médiane des ${RECENT_SALES} dernières ventes, hors shiny (une carte shiny a son propre prix). Un prix n'est retenu qu'à partir de ${plural(priceOptions().minSales, "vente")}${priceOptions().skipFirst ? `, sans compter ${priceOptions().skipFirst > 1 ? `les ${priceOptions().skipFirst} premières` : "la première"} de chaque carte` : ""} (onglet Réglages). Les prix sont gardés en cache et affichés sur les cartes du site.`,
              `Market price of each copy in its rarity: median of the last ${RECENT_SALES} sales, excluding shiny ones (a shiny card has its own price). A price is only used from ${plural(priceOptions().minSales, "sale")}${priceOptions().skipFirst ? `, not counting ${priceOptions().skipFirst > 1 ? `the first ${priceOptions().skipFirst}` : "the first one"} of each card` : ""} (Settings tab). Prices are cached and shown on the site's cards.`,
            )}
          </p>
        </div>
      </div>
      {error && <Notice type="error">{error}</Notice>}
      {!copies && !error && <Progress label={L("Lecture de votre collection", "Reading your collection")} done={0} />}
      {copies && (
        <>
          <div class="grid-stats">
            <div class="stat"><div class="k">{L("Valeur estimée", "Estimated value")}</div><div class="v"><Money v={total} /></div></div>
            <div class="stat"><div class="k">{L("Exemplaires avec un prix", "Copies with a price")}</div><div class="v">{fmt(pricedCopies)} / {fmt(allCopies)}</div></div>
            {fewCopies > 0 && (
              <div class="stat" title={L("Vendus trop peu de fois pour un prix fiable : ils ne comptent pas dans la valeur estimée", "Sold too few times for a reliable price: not counted in the estimated value")}>
                <div class="k">{L("Prix incertain", "Uncertain price")}</div>
                <div class="v">{fmt(fewCopies)}</div>
              </div>
            )}
            {byRarity.filter((b) => b.copies).slice(0, 4).map((b) => (
              <div class="stat" key={b.r}><div class="k">{RARITY_LABEL[b.r]}</div><div class="v"><Money v={b.value} /></div></div>
            ))}
          </div>

          <div class="box stack">
            <h3>{L("Charger les prix", "Load prices")}</h3>
            <p class="help">{L("Les ventes sont lues par lots de cartes : toute la collection se charge en quelques minutes.", "Sales are read in batches of cards: the whole collection loads in a few minutes.")}</p>
            <div class="chips">
              {RARITIES.map((r) => (
                <button key={r} class={`chip${rarities.includes(r) ? " on" : ""}`} onClick={() => setRarities(rarities.includes(r) ? rarities.filter((x) => x !== r) : [...rarities, r])}>
                  {RARITY_LABEL[r]} · {fmt(count(r))}
                </button>
              ))}
            </div>
            <label class="check">
              <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.currentTarget.checked)} /> {L("Seulement les cartes sans prix récent", "Only cards without a recent price")}
            </label>
            <div class="row">
              {!bulk ? (
                <button class="btn primary" disabled={!todo} onClick={startBulk}>{L(`Charger ${plural(todo, "prix", "prix")}`, `Load ${plural(todo, "price")}`)}</button>
              ) : (
                <button class="btn danger" onClick={() => abort.current?.abort()}>{L("Arrêter", "Stop")}</button>
              )}
            </div>
            {bulk && <Progress done={bulk.done} total={bulk.total} label={L("Chargement des prix", "Loading prices")} />}
          </div>

          <div class="box stack">
            <div class="row">
              <h3 style={{flex: 1}}>{view === "filter" ? L("Filtrer ma collection", "Filter my collection") : L("Mes cartes les plus chères", "My most valuable cards")}</h3>
              <div class="seg" role="tablist">
                <button role="tab" aria-selected={view === "top"} class={view === "top" ? "on" : ""} onClick={() => setView("top")}>
                  {L("Les plus chères", "Most valuable")}
                </button>
                <button role="tab" aria-selected={view === "filter"} class={view === "filter" ? "on" : ""} onClick={() => setView("filter")}>
                  {L("Filtrer", "Filter")}
                </button>
              </div>
            </div>
            {view === "filter" ? (
              <>
                <CollectionFilters filter={filter} onChange={(patch) => setFilter((f) => ({...f, ...patch}))} />
                <CollectionCards filter={filter} />
              </>
            ) : (
              <>
                <div class="chips">
                  {themes.map((t) => (
                    <button key={t} class={`chip${theme === t ? " on" : ""}`} onClick={() => setTheme(theme === t ? null : t)}>
                      {t}
                    </button>
                  ))}
                </div>
                <Paged
                  items={theme ? ranking.filter((c) => c.theme === theme) : ranking}
                  pageSize={30}
                  empty={L("Aucun prix chargé pour l'instant.", "No prices loaded yet.")}
                  render={(c) => (
                    <CardRow
                      key={`${c.card_id}|${c.rarity}|${c.is_shiny ? 1 : 0}`}
                      card={c.card}
                      rarity={c.rarity}
                      theme={c.theme}
                      price={c.price}
                      badges={[c.count > 1 && {label: `×${c.count}`, type: "ok"}, c.is_shiny && {label: "shiny", type: "warn", icon: "shine"}]}
                    />
                  )}
                />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
