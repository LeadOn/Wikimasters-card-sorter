// Vues de ma collection par la Toolbox (features/collection-view.js) : toutes les cartes, doublons,
// sans image, GIF, jamais vendues. Filtres par rareté, thème et texte ; chaque carte se met aux
// enchères ou se défausse sur place, et les cartes cochées ensemble, toujours après confirmation.
// Barre de la page Collection (un clic sur une carte ouvre la fenêtre du site : onOpen) et onglet
// « Prix » (vue « Jamais vendues »).
import {useState, useEffect, useMemo, useRef} from "preact/hooks";
import {useStore} from "../lib/store";
import {VIEWS, cardsState, loadCards, viewGroups, groupsOf, copiesByCard, keepOnePerCard, discardGroups, sellGroups, copyFor, afterSell, LOCKED} from "../features/collection-view";
import {priceOf, priceVersion, loadPrices, hasFreshPrice} from "../state/prices";
import {CardRow, Icon, Notice, Paged, Progress, fmt, plural} from "./components";
import {toast, errorMessage} from "./feedback";
import {askSell, askSellMany} from "./SellDialog";
import {confirmDiscardMany} from "./discard";
import {RARITIES, RARITY_LABEL, categorize, freeCopy} from "../../../../core";

const keyOf = (g) => `${g.card_id}|${g.rarity}`;
// Thème d'une carte, calculé une seule fois : les listes sont recalculées à chaque prix reçu
const themes = new Map();
const themeOf = (card) => themes.get(card.id) ?? themes.set(card.id, categorize(card)[0]).get(card.id);

const EMPTY = {
  all: "Votre collection est vide.",
  doubles: "Aucune carte en plusieurs exemplaires.",
  none: "Toutes vos cartes ont une image.",
  gif: "Aucune carte de votre collection n'a d'image GIF.",
};

// Choix de la vue sur la page Collection, avec le nombre de cartes de chacune une fois la
// collection lue. null : la grille du site.
export function ViewSeg({value, onChange}) {
  const s = useStore(cardsState);
  const {v} = useStore(priceVersion);
  const views = s.copies ? viewGroups(s.copies, v) : null;
  return (
    <div class="seg" role="group" aria-label="Afficher">
      {[{id: null, label: "Grille du site"}, ...VIEWS].map((o) => (
        <button key={o.id || "site"} class={value === o.id ? "on" : ""} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
          {o.id && views ? ` · ${fmt(groupsOf(views, o.id, s.anyRarity).length)}` : ""}
        </button>
      ))}
    </div>
  );
}

export function CollectionCards({view, onOpen, mini = false}) {
  const s = useStore(cardsState);
  const {v} = useStore(priceVersion);
  const [theme, setTheme] = useState(null);
  const [rarities, setRarities] = useState([]);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(() => new Set()); // clés carte|rareté cochées
  const [running, setRunning] = useState(null); // {label, done, total} : chargement des prix ou défausse
  const [opening, setOpening] = useState(null); // carte en cours d'ouverture dans la fenêtre du site
  const abort = useRef(null);
  const keepOne = view === "doubles";
  // Collection relue à l'affichage (en cache quelques minutes, relue après un paquet ou une action)
  useEffect(() => {
    loadCards();
  }, []);
  // La sélection est propre à chaque vue
  useEffect(() => setPicked(new Set()), [view]);

  const views = useMemo(() => viewGroups(s.copies, v), [s.copies, v]);
  const base = groupsOf(views, view, s.anyRarity);
  const owned = useMemo(() => copiesByCard(s.copies || []), [s.copies]);

  // Filtres : texte et raretés, puis thème (les pastilles de thème suivent les autres filtres)
  const q = query.trim().toLowerCase();
  const matchesQuery = (g) => !q || `${g.card.wikipedia_title} ${g.card.category || ""}`.toLowerCase().includes(q);
  const byQuery = useMemo(() => base.filter(matchesQuery), [base, q]);
  const filtered = useMemo(() => (rarities.length ? byQuery.filter((g) => rarities.includes(g.rarity)) : byQuery), [byQuery, rarities]);
  const themeList = useMemo(() => [...new Set(filtered.map((g) => themeOf(g.card)))].sort(), [filtered]);
  // Même tableau tant que rien ne change : cocher une carte ne ramène pas la liste à sa première page
  const shown = useMemo(() => (theme && themeList.includes(theme) ? filtered.filter((g) => themeOf(g.card) === theme) : filtered), [filtered, theme, themeList]);
  const rarityCount = (r) => byQuery.filter((g) => g.rarity === r).length;

  const choosable = shown.filter((g) => freeCopy(g.rows));
  const chosen = choosable.filter((g) => picked.has(keyOf(g)));
  const unchecked = view === "unsold" ? views.all.filter((g) => !hasFreshPrice(g.card_id)) : [];
  const uncheckedCards = new Set(unchecked.map((g) => g.card_id)).size;
  const busy = Boolean(running);

  const toggle = (g) =>
    setPicked((p) => {
      const next = new Set(p);
      if (!next.delete(keyOf(g))) next.add(keyOf(g));
      return next;
    });

  const loadMissing = async () => {
    abort.current = new AbortController();
    const label = "Chargement des prix";
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

  // Vue « Doublons » : un exemplaire de chaque carte est toujours gardé
  const withoutLast = (targets) => {
    if (!keepOne) return targets;
    const {groups, skipped} = keepOnePerCard(targets, s.copies || []);
    if (skipped) toast(`${plural(skipped, "carte cochée écartée", "cartes cochées écartées")} : vous en gardez toujours un exemplaire.`);
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
    setRunning({label: "Défausse", done: 0, total});
    try {
      const n = await discardGroups(targets, {keepOne, signal: abort.current.signal, onProgress: (done) => setRunning({label: "Défausse", done, total})});
      toast(
        total === 1 && n === 1
          ? `${targets[0].card.wikipedia_title} défaussée : +1 WikiBidou.`
          : `${plural(n, "carte défaussée", "cartes défaussées")}${n < total ? ", puis arrêt" : ""} : +${fmt(n)} ${n > 1 ? "WikiBidous" : "WikiBidou"}.`,
        {type: "ok"},
      );
    } catch (e) {
      const before = e.done ? `${plural(e.done, "carte défaussée", "cartes défaussées")}, puis arrêt : ` : "";
      toast(before + errorMessage(e), {type: "error", duration: 10000});
    } finally {
      setRunning(null);
      setPicked(new Set());
    }
  };

  const sellOne = async (g) => {
    const copy = copyFor(g, {keepOne});
    if (!copy) return toast(keepOne ? "Vous gardez toujours un exemplaire de chaque carte." : LOCKED, {type: "error"});
    const sale = await askSell({
      card: g.card,
      userCardId: copy.id,
      rarity: g.rarity,
      badges: [g.count > 1 && {label: `×${g.count}`, type: "ok"}],
      note: view === "unsold" ? "Cette carte n'a jamais été vendue : aucun prix de référence. L'exemplaire est mis en réserve pendant l'enchère." : undefined,
    });
    afterSell(copy.id, sale);
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
  if (!s.copies) return <Progress label="Lecture de votre collection" done={s.progress} />;

  return (
    <div class="stack">
      {view === "unsold" && (
        <>
          <p class="help">Aucune vente conclue sur le marché, d'après les prix chargés.</p>
          <div class="chips">
            <button class={`chip${s.anyRarity ? " on" : ""}`} onClick={() => cardsState.set({anyRarity: true})}>
              Dans aucune rareté · {fmt(views.never.length)}
            </button>
            <button class={`chip${s.anyRarity ? "" : " on"}`} onClick={() => cardsState.set({anyRarity: false})}>
              Dans sa rareté · {fmt(views.inRarity.length)}
            </button>
          </div>
          {uncheckedCards > 0 && !running && (
            <div class="row">
              <Notice type={views.unknown ? "warn" : "info"}>
                {views.unknown
                  ? `${plural(views.unknown, "carte n'a", "cartes n'ont")} encore aucun prix chargé : elles ne figurent pas dans la liste.`
                  : "Certains prix ne sont plus récents : une carte a pu se vendre depuis."}
              </Notice>
              <button class="btn sm" onClick={loadMissing}>
                Charger {plural(uncheckedCards, "prix", "prix")}
              </button>
            </div>
          )}
        </>
      )}
      {view === "doubles" && <p class="help">Cartes que vous possédez en plusieurs exemplaires, toutes raretés confondues. Vous en gardez toujours un : le dernier n'est jamais vendu ni défaussé.</p>}
      <div class="row">
        <div class="chips" style={{flex: 1}}>
          {RARITIES.filter((r) => rarityCount(r) || rarities.includes(r)).map((r) => (
            <button key={r} class={`chip${rarities.includes(r) ? " on" : ""}`} onClick={() => setRarities(rarities.includes(r) ? rarities.filter((x) => x !== r) : [...rarities, r])}>
              {RARITY_LABEL[r]} · {fmt(rarityCount(r))}
            </button>
          ))}
        </div>
        <input type="search" placeholder="Titre ou description…" style={{maxWidth: "220px"}} value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
      </div>
      {themeList.length > 1 && (
        <div class="chips">
          {themeList.map((t) => (
            <button key={t} class={`chip${theme === t ? " on" : ""}`} onClick={() => setTheme(theme === t ? null : t)}>
              {t}
            </button>
          ))}
        </div>
      )}
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
            Tout ({fmt(choosable.length)})
          </label>
          <span class="small muted" style={{flex: 1}}>
            {chosen.length ? plural(chosen.length, "carte cochée", "cartes cochées") : onOpen ? "Cochez des cartes ; un clic sur une carte l'ouvre sur le site" : "Aucune carte cochée"}
          </span>
          <button class="btn sm" disabled={!chosen.length || busy} onClick={() => sellMany(chosen)}>
            <Icon name="market" size={14} /> Mettre aux enchères
          </button>
          <button class="btn sm" disabled={!chosen.length || busy} onClick={() => discard(chosen)}>
            <Icon name="discard" size={14} /> Défausser{chosen.length ? ` (+${fmt(chosen.length)} ₩)` : ""}
          </button>
        </div>
      )}
      {running && (
        <div class="row">
          <div style={{flex: 1}}>
            <Progress label={running.label} done={running.done} total={running.total} />
          </div>
          <button class="btn sm danger" onClick={() => abort.current?.abort()}>
            Arrêter
          </button>
        </div>
      )}
      <Paged
        items={shown}
        pageSize={mini ? 24 : 30}
        class={mini ? "mini" : ""}
        empty={
          base.length
            ? "Aucune carte ne correspond à ces filtres."
            : view !== "unsold"
              ? EMPTY[view]
              : views.unknown === views.all.length
                ? "Aucun prix chargé pour l'instant : chargez les prix pour trouver vos cartes jamais vendues."
                : "Toutes vos cartes dont le prix est chargé se sont déjà vendues."
        }
        render={(g) => {
          const key = keyOf(g);
          const free = freeCopy(g.rows);
          const soldIn = view === "unsold" ? RARITIES.filter((r) => priceOf(g.card_id, r) != null) : [];
          const title = g.card.wikipedia_title;
          return (
            <CardRow
              key={key}
              card={g.card}
              rarity={g.rarity}
              theme={themeOf(g.card)}
              price={view === "unsold" ? null : priceOf(g.card_id, g.rarity)}
              selected={Boolean(free) && picked.has(key)}
              wiki={!onOpen}
              onClick={onOpen ? () => !opening && open(g) : free && !busy ? () => toggle(g) : undefined}
              check={{checked: Boolean(free) && picked.has(key), disabled: !free || busy, label: free ? `Cocher ${title}` : LOCKED, onChange: () => toggle(g)}}
              badges={[
                opening === key && {label: "Ouverture…", type: "accent"},
                g.count > 1 && {label: `×${g.count}`, type: "ok"},
                keepOne && owned.get(g.card_id) > g.count && {label: `${owned.get(g.card_id)} au total`},
                soldIn.length > 0 && {label: `vendue en ${soldIn.join(", ")}`},
                view === "none" && g.card.hide_image && {label: "masquée par le site", type: "warn"},
                free?.is_shiny && {label: "shiny", type: "warn", icon: "shine"},
                !free && {label: "favori", type: "warn", icon: "star"},
              ]}
              action={
                <span class="row" style={{gap: "2px"}}>
                  <button class="btn sm" disabled={busy || !free} title={free ? "Mettre aux enchères" : LOCKED} onClick={() => sellOne(g)}>
                    Vendre
                  </button>
                  <button class="btn sm ghost" disabled={busy || !free} title={free ? "Défausser contre 1 WikiBidou" : LOCKED} aria-label="Défausser" onClick={() => discard([g])}>
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
