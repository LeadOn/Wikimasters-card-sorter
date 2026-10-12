// Onglet « Prix » : prix moyens de vente, valeur de ma collection, classement des plus chères.
import {useState, useEffect, useMemo, useRef} from "preact/hooks";
import {useStore} from "../../lib/store";
import {loadMyCollection} from "../../state/collection";
import {priceOf, priceVersion, loadPrices, hasFreshPrice} from "../../state/prices";
import {CardRow, Paged, Progress, Notice, fmt, plural} from "../components";
import {toast, errorMessage} from "../feedback";
import {RARITIES, RARITY_LABEL, categorize} from "../../../../../core";

export function PricesTab() {
  useStore(priceVersion);
  const [copies, setCopies] = useState(null);
  const [error, setError] = useState(null);
  const [rarities, setRarities] = useState([...RARITIES]);
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [bulk, setBulk] = useState(null);
  const [theme, setTheme] = useState(null);
  const abort = useRef(null);

  useEffect(() => {
    loadMyCollection()
      .then(setCopies)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  const unique = useMemo(() => {
    if (!copies) return [];
    const m = new Map();
    for (const c of copies) {
      const key = `${c.card_id}|${c.rarity}`;
      const prev = m.get(key);
      m.set(key, prev ? {...prev, count: prev.count + c.count} : {...c});
    }
    return [...m.values()];
  }, [copies]);

  const valued = unique.map((c) => ({...c, price: priceOf(c.card_id, c.rarity)}));
  const total = valued.reduce((n, c) => n + (c.price || 0) * c.count, 0);
  const pricedCopies = valued.filter((c) => c.price != null).reduce((n, c) => n + c.count, 0);
  const allCopies = valued.reduce((n, c) => n + c.count, 0);
  const byRarity = RARITIES.map((r) => {
    const list = valued.filter((c) => c.rarity === r);
    return {r, copies: list.reduce((n, c) => n + c.count, 0), priced: list.filter((c) => c.price != null).length, value: list.reduce((n, c) => n + (c.price || 0) * c.count, 0)};
  });
  const ranking = useMemo(
    () =>
      valued
        .filter((c) => c.price != null)
        .map((c) => ({...c, theme: categorize(c.card)[0]}))
        .sort((a, b) => b.price - a.price),
    [copies, priceVersion.get().v],
  );
  const themes = [...new Set(ranking.map((c) => c.theme))].sort();

  const startBulk = async () => {
    const items = unique.filter((c) => rarities.includes(c.rarity) && (!onlyMissing || !hasFreshPrice(c.card_id))).map((c) => ({id: c.card_id, rarity: c.rarity}));
    if (!items.length) return toast("Tous les prix de ces raretés sont déjà à jour.", {type: "ok"});
    abort.current = new AbortController();
    setBulk({done: 0, total: new Set(items.map((x) => x.id)).size});
    try {
      await loadPrices(items, {force: !onlyMissing, signal: abort.current.signal, onProgress: (done, t) => setBulk({done, total: t})});
      toast("Prix chargés.", {type: "ok"});
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
          <h2>Prix</h2>
          <p>Prix moyen de vente sur le marché, pour la rareté de chaque exemplaire. Les prix sont gardés en cache 48 h et affichés sur les cartes du site.</p>
        </div>
      </div>
      {error && <Notice type="error">{error}</Notice>}
      {!copies && !error && <Progress label="Lecture de votre collection" done={0} />}
      {copies && (
        <>
          <div class="grid-stats">
            <div class="stat"><div class="k">Valeur estimée</div><div class="v">{fmt(total)} ₩</div></div>
            <div class="stat"><div class="k">Exemplaires avec un prix</div><div class="v">{fmt(pricedCopies)} / {fmt(allCopies)}</div></div>
            {byRarity.filter((b) => b.copies).slice(0, 4).map((b) => (
              <div class="stat" key={b.r}><div class="k">{RARITY_LABEL[b.r]}</div><div class="v">{fmt(b.value)} ₩</div></div>
            ))}
          </div>

          <div class="box stack">
            <h3>Charger les prix</h3>
            <p class="help">Les ventes sont lues par lots de cartes : toute la collection se charge en quelques minutes.</p>
            <div class="chips">
              {RARITIES.map((r) => (
                <button key={r} class={`chip${rarities.includes(r) ? " on" : ""}`} onClick={() => setRarities(rarities.includes(r) ? rarities.filter((x) => x !== r) : [...rarities, r])}>
                  {RARITY_LABEL[r]} · {fmt(count(r))}
                </button>
              ))}
            </div>
            <label class="check">
              <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.currentTarget.checked)} /> Seulement les cartes sans prix récent
            </label>
            <div class="row">
              {!bulk ? (
                <button class="btn primary" disabled={!todo} onClick={startBulk}>Charger {plural(todo, "prix", "prix")}</button>
              ) : (
                <button class="btn danger" onClick={() => abort.current?.abort()}>Arrêter</button>
              )}
            </div>
            {bulk && <Progress done={bulk.done} total={bulk.total} label="Chargement des prix" />}
          </div>

          <div class="box stack">
            <div class="row">
              <h3 style={{flex: 1}}>Mes cartes les plus chères</h3>
            </div>
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
              empty="Aucun prix chargé pour l'instant."
              render={(c) => <CardRow key={`${c.card_id}|${c.rarity}`} card={c.card} rarity={c.rarity} theme={c.theme} price={c.price} badges={[c.count > 1 && {label: `×${c.count}`, type: "ok"}]} />}
            />
          </div>
        </>
      )}
    </div>
  );
}
