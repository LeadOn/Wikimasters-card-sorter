// Ma collection filtrée par la Toolbox (features/collection-view.js). CollectionFilters : critères
// cumulables (doublons, sans image, GIF) et prix de vente (jamais vendues, vendues entre X et Y ₩) ;
// CollectionCards : la liste, affinée par mots-clés (inclus ou exclus), rareté et thème. Un clic sur
// une carte la coche ; chaque carte se met aux enchères ou se défausse sur place, et les cartes
// cochées ensemble, toujours après confirmation. Barre de la page Collection (un clic sur le nom
// d'une carte ouvre la fenêtre du site : onOpen) et onglet « Prix ».
import {useState, useEffect, useMemo, useRef} from "preact/hooks";
import {useStore} from "../lib/store";
import {KINDS, cardsState, loadCards, viewGroups, filterGroups, matchKeywords, parseKeyword, normText, copiesByCard, keepOnePerCard, discardGroups, sellGroups, copyFor, afterSell, LOCKED} from "../features/collection-view";
import {pricing, summaryOf, priceVersion, loadPrices, hasFreshPrice} from "../state/prices";
import {CardTile, Icon, Notice, Paged, Progress, Rarity, fmt, plural} from "./components";
import {toast, errorMessage} from "./feedback";
import {askSell, askSellMany} from "./SellDialog";
import {confirmDiscardMany} from "./discard";
import {RARITIES, RARITY_LABEL, freeCopy, soldIn} from "../../../../core";
import {themeMemo} from "../state/themes";
import {L} from "../../shared/i18n";

const keyOf = (g) => `${g.card_id}|${g.rarity}`;
// Thème d'une carte, calculé une seule fois : les listes sont recalculées à chaque prix reçu
const themes = themeMemo();
const themeOf = (card) => themes(card.id, card);

// Tranches de prix proposées pour « Vendues entre … » (WikiBidous, bornes incluses ; les prix
// moyens sont arrondis à l'unité)
const RANGES = [
  {min: null, max: 5, label: "≤ 5 ₩"},
  {min: 6, max: 10, label: "6–10 ₩"},
  {min: 11, max: 25, label: "11–25 ₩"},
  {min: 26, max: 50, label: "26–50 ₩"},
  {min: 51, max: 100, label: "51–100 ₩"},
  {min: 101, max: null, label: "> 100 ₩"},
];

const Count = ({n}) => (n == null ? null : <span class="n">{fmt(n)}</span>);

// Borne saisie : "" → null (pas de borne), entier positif ou nul, sinon undefined (saisie ignorée)
const toPrice = (text) => {
  if (!text.trim()) return null;
  const n = Number(text);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
};
const asText = (n) => (n == null ? "" : String(n));

// Champ d'une borne de prix : suit la valeur du filtre, sauf pendant la saisie
function PriceInput({value, onValue, label, placeholder}) {
  const [text, setText] = useState(asText(value));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setText(asText(value));
  }, [value]);
  return (
    <input
      type="number"
      min="0"
      step="1"
      placeholder={placeholder}
      aria-label={label}
      value={text}
      onInput={(e) => {
        setText(e.currentTarget.value);
        const n = toPrice(e.currentTarget.value);
        if (n !== undefined) onValue(n);
      }}
      onFocus={() => (editing.current = true)}
      onBlur={() => {
        editing.current = false;
        setText(asText(value));
      }}
    />
  );
}

// Filtres de la liste, une ligne par dimension. active : faux tant que la liste n'est pas affichée
// (aucun choix n'apparaît sélectionné) ; aside : élément placé au bout de la première ligne.
// Les nombres (une fois la collection lue) tiennent compte des lignes du dessus : ceux des ventes
// comptent parmi les cartes choisies dans « Cartes ».
export function CollectionFilters({filter, onChange, active = true, aside}) {
  const s = useStore(cardsState);
  const {v} = useStore(priceVersion);
  const views = s.copies ? viewGroups(s.copies, v) : null;
  const kinds = active ? filter.kinds : [];
  const sale = active ? filter.sale : undefined;
  const isRange = (r) => r.min === filter.min && r.max === filter.max;
  const custom = !RANGES.some(isRange);
  const saleCount = (f) => (views ? filterGroups(views, {kinds, anyRarity: filter.anyRarity, ...f}).length : null);
  const toggle = (k) => onChange({kinds: kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k]});

  return (
    <div class="filters">
      <div class="filter-row">
        <span class="filter-k">{L("Cartes", "Cards")}</span>
        <div class="chips" role="group" aria-label={L("Cartes (critères cumulables)", "Cards (filters can be combined)")}>
          <button class={`chip${active && !kinds.length ? " on" : ""}`} aria-pressed={active && !kinds.length} onClick={() => onChange({kinds: []})}>
            {L("Toutes", "All")} <Count n={views?.all.length} />
          </button>
          {KINDS.map((k) => {
            const on = kinds.includes(k.id);
            return (
              <button key={k.id} class={`chip${on ? " on" : ""}`} aria-pressed={on} onClick={() => toggle(k.id)}>
                {on && <Icon name="check" size={12} />}
                {k.label} <Count n={views?.[k.id].length} />
              </button>
            );
          })}
        </div>
        {aside && <div class="filter-aside">{aside}</div>}
      </div>
      <div class="filter-row">
        <span class="filter-k">{L("Ventes", "Sales")}</span>
        <div class="seg" role="group" aria-label={L("Ventes", "Sales")}>
          <button class={sale === null ? "on" : ""} aria-pressed={sale === null} onClick={() => onChange({sale: null})}>
            {L("Tous les prix", "Any price")}
          </button>
          <button class={sale === "never" ? "on" : ""} aria-pressed={sale === "never"} onClick={() => onChange({sale: "never"})}>
            {L("Jamais vendues", "Never sold")} <Count n={saleCount({sale: "never"})} />
          </button>
          <button class={sale === "range" ? "on" : ""} aria-pressed={sale === "range"} onClick={() => onChange({sale: "range"})}>
            {L("Vendues entre…", "Sold between…")}
          </button>
        </div>
        {sale === "never" && (
          <select class="mini-select" aria-label={L("Portée", "Scope")} value={filter.anyRarity ? "any" : "own"} onChange={(e) => onChange({anyRarity: e.currentTarget.value === "any"})}>
            <option value="any">{L("dans aucune rareté", "in any rarity")}</option>
            <option value="own">{L("dans la rareté de mon exemplaire", "in my copy's rarity")}</option>
          </select>
        )}
      </div>
      {sale === "range" && (
        <div class="filter-row">
          <span class="filter-k" aria-hidden="true" />
          <div class={`chip price-range${custom ? " on" : ""}`} role="group" aria-label={L("Prix du marché, bornes incluses", "Market price, bounds included")}>
            <span>{L("de", "from")}</span>
            <PriceInput value={filter.min} onValue={(min) => onChange({min})} label={L("Prix minimum, en WikiBidous", "Minimum price, in WikiBidous")} placeholder="min" />
            <span>{L("à", "to")}</span>
            <PriceInput value={filter.max} onValue={(max) => onChange({max})} label={L("Prix maximum, en WikiBidous", "Maximum price, in WikiBidous")} placeholder="max" />
            <span>₩</span>
          </div>
          <div class="chips" role="group" aria-label={L("Tranches de prix", "Price ranges")}>
            {RANGES.map((r) => (
              <button key={r.label} class={`chip${isRange(r) ? " on" : ""}`} aria-pressed={isRange(r)} onClick={() => onChange({min: r.min, max: r.max})}>
                {r.label} <Count n={saleCount({sale: "range", min: r.min, max: r.max})} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// filter : voir DEFAULT_FILTER (features/collection-view.js)
export function CollectionCards({filter, onOpen, mini = false}) {
  const s = useStore(cardsState);
  const {v} = useStore(priceVersion);
  const [theme, setTheme] = useState("");
  const [rarities, setRarities] = useState([]);
  const [query, setQuery] = useState(""); // mot en cours de saisie, appliqué sans attendre
  const [words, setWords] = useState([]); // mots-clés ajoutés : [{text, out}]
  const [allWords, setAllWords] = useState(false); // mots inclus : tous (sinon au moins un)
  const [picked, setPicked] = useState(() => new Set()); // clés carte|rareté cochées
  const [running, setRunning] = useState(null); // {label, done, total} : chargement des prix ou défausse
  const [opening, setOpening] = useState(null); // carte en cours d'ouverture dans la fenêtre du site
  const abort = useRef(null);
  const {kinds, sale, min, max, anyRarity} = filter;
  const keepOne = kinds.includes("doubles");
  const filterKey = `${kinds.join()}|${sale}|${min}|${max}|${anyRarity}`;
  // Collection relue à l'affichage (en cache quelques minutes, relue après un paquet ou une action)
  useEffect(() => {
    loadCards();
  }, []);
  // La sélection est propre à chaque filtre
  useEffect(() => setPicked(new Set()), [filterKey]);

  const views = useMemo(() => viewGroups(s.copies, v), [s.copies, v]);
  const base = useMemo(() => filterGroups(views, filter), [views, filterKey]);
  const owned = useMemo(() => copiesByCard(s.copies || []), [s.copies]);

  // Affiner : texte et raretés, puis thème (la liste des thèmes suit les autres filtres)
  const live = parseKeyword(query);
  const sameWord = (a, b) => normText(a.text) === normText(b.text);
  const active = live ? [...words.filter((w) => !sameWord(w, live)), live] : words;
  const wordsKey = `${allWords}|${active.map((w) => `${w.out ? "-" : "+"}${normText(w.text)}`).join("|")}`;
  const byQuery = useMemo(() => base.filter(matchKeywords(active, {all: allWords})), [base, wordsKey]);
  const included = words.filter((w) => !w.out).length;
  // Ajoute le mot saisi (out : l'exclure, quel que soit le « - » saisi)
  const addWord = (out) => {
    if (!live) return;
    const word = out === undefined ? live : {...live, out};
    setWords((ws) => [...ws.filter((w) => !sameWord(w, word)), word]);
    setQuery("");
  };
  const removeWord = (word) => setWords((ws) => ws.filter((w) => w !== word));
  const flipWord = (word) => setWords((ws) => ws.map((w) => (w === word ? {...w, out: !w.out} : w)));
  const filtered = useMemo(() => (rarities.length ? byQuery.filter((g) => rarities.includes(g.rarity)) : byQuery), [byQuery, rarities]);
  const themeCounts = useMemo(() => {
    const m = new Map();
    for (const g of filtered) m.set(themeOf(g.card), (m.get(themeOf(g.card)) || 0) + 1);
    return [...m].sort((a, b) => a[0].localeCompare(b[0], "fr"));
  }, [filtered]);
  // Même tableau tant que rien ne change : cocher une carte ne ramène pas la liste à sa première page
  const shown = useMemo(() => (theme && themeCounts.some(([t]) => t === theme) ? filtered.filter((g) => themeOf(g.card) === theme) : filtered), [filtered, theme, themeCounts]);
  const rarityCount = (r) => byQuery.filter((g) => g.rarity === r).length;

  const choosable = shown.filter((g) => freeCopy(g.rows));
  const chosen = choosable.filter((g) => picked.has(keyOf(g)));
  // Filtre par prix : cartes des autres critères dont le prix n'est pas chargé ou plus récent
  const candidates = useMemo(() => (sale ? filterGroups(views, {kinds}) : []), [views, filterKey]);
  const unchecked = useMemo(() => candidates.filter((g) => !hasFreshPrice(g.card_id)), [candidates]);
  const uncheckedCards = new Set(unchecked.map((g) => g.card_id)).size;
  const unknownCount = unchecked.filter((g) => !views.prices.get(g.card_id)).length;
  const busy = Boolean(running);

  const toggle = (g) =>
    setPicked((p) => {
      const next = new Set(p);
      if (!next.delete(keyOf(g))) next.add(keyOf(g));
      return next;
    });

  const loadMissing = async () => {
    abort.current = new AbortController();
    const label = L("Chargement des prix", "Loading prices");
    setRunning({label, done: 0, total: uncheckedCards});
    try {
      await loadPrices(
        unchecked.map((g) => ({id: g.card_id, rarity: g.rarity})),
        {signal: abort.current.signal, onProgress: (done, total) => setRunning({label, done, total})},
      );
    } catch (e) {
      toast(errorMessage(e), {type: "error"});
    } finally {
      setRunning(null);
    }
  };

  // Filtre « Doublons » : un exemplaire de chaque carte est toujours gardé
  const withoutLast = (targets) => {
    if (!keepOne) return targets;
    const {groups, skipped} = keepOnePerCard(targets, s.copies || []);
    if (skipped) toast(L(`${plural(skipped, "carte cochée écartée", "cartes cochées écartées")} : vous en gardez toujours un exemplaire.`, `${plural(skipped, "selected card", "selected cards")} skipped: you always keep one copy.`));
    return groups;
  };

  const discard = async (selection) => {
    const targets = withoutLast(selection);
    if (!targets.length) return;
    // Plusieurs raretés d'une même carte peuvent être cochées : « seul exemplaire » si rien n'en reste
    const removed = new Map();
    for (const g of targets) removed.set(g.card_id, (removed.get(g.card_id) || 0) + 1);
    const items = targets.map((g) => ({card: g.card, rarity: g.rarity, shiny: freeCopy(g.rows)?.is_shiny, only: owned.get(g.card_id) <= removed.get(g.card_id)}));
    if (!(await confirmDiscardMany(items))) return;
    abort.current = new AbortController();
    const total = targets.length;
    const label = L("Défausse", "Discarding");
    setRunning({label, done: 0, total});
    try {
      const n = await discardGroups(targets, {keepOne, signal: abort.current.signal, onProgress: (done) => setRunning({label, done, total})});
      toast(
        total === 1 && n === 1
          ? L(`${targets[0].card.wikipedia_title} défaussée : +1 WikiBidou.`, `${targets[0].card.wikipedia_title} discarded: +1 WikiBidou.`)
          : L(
              `${plural(n, "carte défaussée", "cartes défaussées")}${n < total ? ", puis arrêt" : ""} : +${fmt(n)} ${n > 1 ? "WikiBidous" : "WikiBidou"}.`,
              `${plural(n, "card discarded", "cards discarded")}${n < total ? ", then stopped" : ""}: +${fmt(n)} ${n === 1 ? "WikiBidou" : "WikiBidous"}.`,
            ),
        {type: "ok"},
      );
    } catch (e) {
      const before = e.done ? L(`${plural(e.done, "carte défaussée", "cartes défaussées")}, puis arrêt : `, `${plural(e.done, "card discarded", "cards discarded")}, then stopped: `) : "";
      toast(before + errorMessage(e), {type: "error", duration: 10000});
    } finally {
      setRunning(null);
      setPicked(new Set());
    }
  };

  const sellOne = async (g) => {
    const copy = copyFor(g, {keepOne});
    if (!copy) return toast(keepOne ? L("Vous gardez toujours un exemplaire de chaque carte.", "You always keep one copy of each card.") : LOCKED, {type: "error"});
    const result = await askSell({
      card: g.card,
      userCardId: copy.id,
      rarity: g.rarity,
      shiny: copy.is_shiny,
      badges: [g.count > 1 && {label: `×${g.count}`, type: "ok"}],
      note: sale === "never" ? L("Cette carte n'a jamais été vendue : aucun prix de référence. L'exemplaire est mis en réserve pendant l'enchère.", "This card has never been sold: no reference price. The copy is held back during the auction.") : undefined,
    });
    afterSell(copy.id, result);
  };

  const sellMany = async (selection) => {
    const targets = withoutLast(selection);
    if (!targets.length) return;
    const sell = (items, params, options) => sellGroups(items, {...params, keepOne}, options);
    if (await askSellMany({items: targets, sell})) setPicked(new Set());
  };

  const open = async (g) => {
    setOpening(keyOf(g));
    try {
      await onOpen({title: g.card.wikipedia_title, rarity: g.rarity});
    } catch (e) {
      toast(errorMessage(e), {type: "error", duration: 8000});
    } finally {
      setOpening(null);
    }
  };

  if (s.error) return <Notice type="error">{s.error}</Notice>;
  if (!s.copies) return <Progress label={L("Lecture de votre collection", "Reading your collection")} done={s.progress} />;

  const empty = !views.all.length
    ? L("Votre collection est vide.", "Your collection is empty.")
    : candidates.length && unknownCount === candidates.length
      ? L("Aucun prix chargé pour l'instant : chargez les prix pour filtrer vos cartes par vente.", "No prices loaded yet: load prices to filter your cards by sale.")
      : L("Aucune carte ne correspond à ces filtres.", "No cards match these filters.");

  return (
    <div class="stack">
      <div class="filter-row">
        <span class="filter-k">{L("Mots-clés", "Keywords")}</span>
        <div class="kw-box">
          {words.map((w) => (
            <span key={normText(w.text)} class={`chip kw${w.out ? " out" : ""}`}>
              <button type="button" class="kw-t" title={w.out ? L("Exclu : cliquer pour l'inclure", "Excluded: click to include") : L("Inclus : cliquer pour l'exclure", "Included: click to exclude")} onClick={() => flipWord(w)}>
                <span class="kw-sign">{w.out ? "−" : "+"}</span>
                {w.text}
              </button>
              <button type="button" class="kw-x" aria-label={L(`Retirer « ${w.text} »`, `Remove "${w.text}"`)} onClick={() => removeWord(w)}>
                <Icon name="close" size={12} />
              </button>
            </span>
          ))}
          <input
            type="search"
            placeholder={words.length ? L("Autre mot…", "Another word…") : L("Un mot du titre ou de la description, puis Entrée (-mot pour l'exclure)", "A word from the title or description, then Enter (-word to exclude it)")}
            aria-label={L("Mot-clé du titre ou de la description", "Keyword from the title or description")}
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addWord();
              } else if (e.key === "Backspace" && !query && words.length) {
                removeWord(words[words.length - 1]);
              }
            }}
          />
        </div>
        <button class="btn sm" disabled={!live} onClick={() => addWord(false)}>
          <Icon name="plus" size={14} /> {L("Inclure", "Include")}
        </button>
        <button class="btn sm" disabled={!live} onClick={() => addWord(true)}>
          {L("Exclure", "Exclude")}
        </button>
        {included > 1 && (
          <div class="seg" role="group" aria-label={L("Mots inclus", "Included words")}>
            <button class={allWords ? "" : "on"} aria-pressed={!allWords} onClick={() => setAllWords(false)}>
              {L("Un des mots", "Any word")}
            </button>
            <button class={allWords ? "on" : ""} aria-pressed={allWords} onClick={() => setAllWords(true)}>
              {L("Tous les mots", "All words")}
            </button>
          </div>
        )}
      </div>
      <div class="filter-row">
        <span class="filter-k">{L("Affiner", "Refine")}</span>
        <div class="chips" role="group" aria-label={L("Raretés", "Rarities")}>
          {RARITIES.filter((r) => rarityCount(r) || rarities.includes(r)).map((r) => (
            <button
              key={r}
              class={`chip${rarities.includes(r) ? " on" : ""}`}
              aria-pressed={rarities.includes(r)}
              title={RARITY_LABEL[r]}
              onClick={() => setRarities(rarities.includes(r) ? rarities.filter((x) => x !== r) : [...rarities, r])}
            >
              <Rarity r={r} /> <Count n={rarityCount(r)} />
            </button>
          ))}
        </div>
        {themeCounts.length > 1 && (
          <select class={`mini-select${theme ? " on" : ""}`} aria-label={L("Thème", "Theme")} value={theme} onChange={(e) => setTheme(e.currentTarget.value)}>
            <option value="">{L("Tous les thèmes", "All themes")}</option>
            {themeCounts.map(([t, n]) => (
              <option key={t} value={t}>
                {t} · {fmt(n)}
              </option>
            ))}
          </select>
        )}
        <span class="filter-aside small muted">{plural(shown.length, L("carte", "card"))}</span>
      </div>
      {uncheckedCards > 0 && !running && (
        <div class="row">
          <Notice type={unknownCount ? "warn" : "info"}>
            {unknownCount
              ? L(
                  `${plural(unknownCount, "carte n'a", "cartes n'ont")} encore aucun prix chargé : ${unknownCount > 1 ? "elles ne figurent" : "elle ne figure"} pas dans la liste.`,
                  `${plural(unknownCount, "card has", "cards have")} no price loaded yet: ${unknownCount === 1 ? "it is" : "they are"} not in the list.`,
                )
              : L("Certains prix ne sont plus récents : une carte a pu se vendre depuis.", "Some prices are out of date: a card may have sold since.")}
          </Notice>
          <button class="btn sm" onClick={loadMissing}>
            {L(`Charger ${plural(uncheckedCards, "prix", "prix")}`, `Load ${plural(uncheckedCards, "price")}`)}
          </button>
        </div>
      )}
      {keepOne && <p class="help small">{L("Doublons : vous gardez toujours un exemplaire de chaque carte, le dernier n'est jamais vendu ni défaussé.", "Duplicates: you always keep one copy of each card; the last one is never sold or discarded.")}</p>}
      {choosable.length > 0 && (
        <div class="row">
          <label class="check">
            <input
              type="checkbox"
              checked={chosen.length === choosable.length}
              ref={(el) => el && (el.indeterminate = chosen.length > 0 && chosen.length < choosable.length)}
              disabled={busy}
              onChange={() => setPicked(new Set(chosen.length === choosable.length ? [] : choosable.map(keyOf)))}
            />
            {L(`Tout (${fmt(choosable.length)})`, `All (${fmt(choosable.length)})`)}
          </label>
          <span class="small muted pick-hint">
            {chosen.length
              ? L(plural(chosen.length, "carte cochée", "cartes cochées"), plural(chosen.length, "card selected", "cards selected"))
              : onOpen
                ? L("Cliquez sur une carte pour la cocher, sur son nom pour l'ouvrir sur le site", "Click a card to select it, or its name to open it on the site")
                : L("Cliquez sur une carte pour la cocher", "Click a card to select it")}
          </span>
          <button class="btn sm" disabled={!chosen.length || busy} onClick={() => sellMany(chosen)}>
            <Icon name="market" size={14} /> {L("Mettre aux enchères", "Put up for auction")}
          </button>
          <button class="btn sm" disabled={!chosen.length || busy} onClick={() => discard(chosen)}>
            <Icon name="discard" size={14} /> {L("Défausser", "Discard")}{chosen.length ? ` (+${fmt(chosen.length)} ₩)` : ""}
          </button>
        </div>
      )}
      {running && (
        <div class="row">
          <div style={{flex: 1}}>
            <Progress label={running.label} done={running.done} total={running.total} />
          </div>
          <button class="btn sm danger" onClick={() => abort.current?.abort()}>
            {L("Arrêter", "Stop")}
          </button>
        </div>
      )}
      <Paged
        items={shown}
        pageSize={mini ? 24 : 30}
        class="tiles"
        empty={empty}
        render={(g) => {
          const key = keyOf(g);
          const free = freeCopy(g.rows);
          const soldInRarities = sale === "never" ? RARITIES.filter((r) => soldIn(summaryOf(g.card_id), r)) : [];
          return (
            <CardTile
              key={key}
              card={g.card}
              rarity={g.rarity}
              theme={themeOf(g.card)}
              {...(sale === "never" ? {} : pricing(g.card_id, g.rarity, {shiny: free?.is_shiny}))}
              selected={Boolean(free) && picked.has(key)}
              onClick={free && !busy ? () => toggle(g) : undefined}
              onTitle={onOpen && (() => !opening && open(g))}
              badges={[
                opening === key && {label: L("Ouverture…", "Opening…"), type: "accent"},
                g.count > 1 && {label: `×${g.count}`, type: "ok"},
                keepOne && owned.get(g.card_id) > g.count && {label: L(`${owned.get(g.card_id)} au total`, `${owned.get(g.card_id)} in total`)},
                soldInRarities.length > 0 && {label: L(`vendue en ${soldInRarities.join(", ")}`, `sold in ${soldInRarities.join(", ")}`)},
                kinds.includes("none") && g.card.hide_image && {label: L("masquée par le site", "hidden by the site"), type: "warn"},
                free?.is_shiny && {label: "shiny", type: "warn", icon: "shine"},
                !free && {label: L("favori", "favorite"), type: "warn", icon: "star"},
              ]}
              action={
                <span class="row" style={{gap: "2px"}}>
                  <button class="btn sm" disabled={busy || !free} title={free ? L("Mettre aux enchères", "Put up for auction") : LOCKED} onClick={() => sellOne(g)}>
                    {L("Vendre", "Sell")}
                  </button>
                  <button class="btn sm ghost" disabled={busy || !free} title={free ? L("Défausser contre 1 WikiBidou", "Discard for 1 WikiBidou") : LOCKED} aria-label={L("Défausser", "Discard")} onClick={() => discard([g])}>
                    <Icon name="discard" size={14} />
                  </button>
                </span>
              }
            />
          );
        }}
      />
    </div>
  );
}
