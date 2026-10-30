// Page « Stonks » : mes achats et ventes au marché par jour, semaine ou mois, et la plus-value de
// l'achat-revente. Affichée dans la page du site, à la place de son contenu (features/stonks.js).
// Historique seulement : aucune action d'achat ou de vente ici.
import {useEffect, useMemo, useState} from "preact/hooks";
import {useStore, createStore} from "../../lib/store";
import {persistentStore} from "../../lib/storage";
import {readSession} from "../../lib/session";
import {stonksState, loadStonks} from "../../features/stonks";
import {priceVersion, pricing, priceOf, priceStatus} from "../../state/prices";
import {CardArt, Gain, Icon, Mark, Money, Notice, Progress, Rarity, fmt, plural, signOf, timeAgo} from "../components";
import {byPeriod, tradeStats, resalesOnly} from "../../../../../core";
import {L, LANG, LOCALE} from "../../../shared/i18n";

// window : nombre de périodes affichées dans le graphique
const UNITS = [
  {id: "day", label: L("Jour", "Day"), window: 30},
  {id: "week", label: L("Semaine", "Week"), window: 16},
  {id: "month", label: L("Mois", "Month"), window: 12},
];
const FILTERS = [
  {id: "all", label: L("Tout", "All")},
  {id: "buy", label: L("Achats", "Purchases")},
  {id: "sell", label: L("Ventes", "Sales")},
];
// Mesure du graphique : plus-value réalisée (reventes seulement) ou flux net (ventes − achats)
const METRICS = [
  {
    id: "profit",
    label: L("Plus-value", "Profit"),
    title: L("Plus-value réalisée", "Realized profit"),
    empty: L("Aucune revente sur ces périodes : la plus-value apparaît dès qu'une carte achetée est revendue.", "No resales in these periods: profit shows up as soon as a bought card is resold."),
  },
  {id: "net", label: L("Flux net", "Net flow"), title: L("Flux net", "Net flow"), empty: L("Aucun achat ni vente sur ces périodes.", "No purchases or sales in these periods.")},
];
// Opérations prises en compte : tout l'historique, ou seulement les cartes achetées puis revendues
const SCOPES = [
  {id: "all", label: L("Tout", "All"), title: L("Tous vos achats et ventes, cartes en stock comprises", "All your purchases and sales, including cards still in stock")},
  {id: "resale", label: L("Achat-revente", "Resales"), title: L("Seulement les cartes achetées au marché puis revendues", "Only cards bought on the market and then resold")},
];
// Réglages de la page, gardés d'une visite à l'autre ; la période choisie, le temps de la visite
const view = persistentStore("stonks-view", {unit: "day", metric: "profit", scope: "all", filter: "all", sort: "date"});
const picked = createStore({selected: null});

// --- Formats
const dateFmt = (opts) => new Intl.DateTimeFormat(LOCALE, opts);
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const sameYear = (d) => d.getFullYear() === new Date().getFullYear();

const pct = (n) => L(`${n} %`, `${n}%`);
const percent = (x) => (x == null ? "—" : `${signOf(x)}${pct(Math.abs(x * 100).toLocaleString(LOCALE, {maximumFractionDigits: 1}))}`);

// Durée de détention : « 3 h », « 2 j 4 h », « 12 j »
function held(ms) {
  if (ms == null) return "—";
  const h = Math.round(ms / 3600000);
  if (h < 1) return `${Math.max(1, Math.round(ms / 60000))} min`;
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return d < 7 && h % 24 ? L(`${d} j ${h % 24} h`, `${d} d ${h % 24} h`) : L(`${d} j`, `${d} d`);
}

// Nom d'une période : « Mercredi 15 octobre », « Semaine du 12 au 18 octobre », « Octobre 2026 »
function periodName(p, unit) {
  const start = new Date(p.start);
  const year = sameYear(start) ? {} : {year: "numeric"};
  if (unit === "day") return capital(dateFmt({weekday: "long", day: "numeric", month: "long", ...year}).format(start));
  if (unit === "month") return capital(dateFmt({month: "long", year: "numeric"}).format(start));
  const last = new Date(p.end - 1);
  // « Week of October 12 – 18 », « Week of September 29 – October 5 »
  if (LANG === "en") return `Week of ${dateFmt({day: "numeric", month: "long", ...year}).formatRange(start, last)}`;
  const from = start.getMonth() === last.getMonth() ? String(start.getDate()) : dateFmt({day: "numeric", month: "long"}).format(start);
  return `Semaine du ${from} au ${dateFmt({day: "numeric", month: "long", ...year}).format(last)}`;
}

// Période en cours ou précédente : « Aujourd'hui », « Hier », « Cette semaine »…
function periodHint(p, periods, unit) {
  const now = Date.now();
  if (now >= p.start && now < p.end) return {day: L("Aujourd'hui", "Today"), week: L("Cette semaine", "This week"), month: L("Ce mois-ci", "This month")}[unit];
  const i = periods.indexOf(p);
  const current = periods[periods.length - 1];
  if (now >= current.start && now < current.end && i === periods.length - 2) return {day: L("Hier", "Yesterday"), week: L("La semaine dernière", "Last week"), month: L("Le mois dernier", "Last month")}[unit];
  return null;
}

// Libellé court sous le graphique
function tick(p, unit) {
  const d = new Date(p.start);
  if (unit === "month") return dateFmt(d.getMonth() === 0 ? {month: "short", year: "2-digit"} : {month: "short"}).format(d);
  return dateFmt({day: "numeric", month: "short"}).format(d);
}

// Heure d'une opération : l'heure seule dans la vue par jour, la date sinon
const when = (at, unit) => (unit === "day" ? dateFmt({hour: "2-digit", minute: "2-digit"}) : dateFmt({weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"})).format(new Date(at));

// Graduations rondes de l'axe : 0 compris, 3 à 5 intervalles
function scale(min, max) {
  if (min === 0 && max === 0) return {top: 1, bottom: 0, ticks: [0]};
  const raw = (max - min) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const top = Math.ceil(max / step) * step;
  const bottom = Math.floor(min / step) * step;
  const ticks = [];
  for (let t = bottom; t <= top + step / 2; t += step) ticks.push(Math.round(t));
  return {top, bottom, ticks};
}
const compact = (v) => `${signOf(v)}${new Intl.NumberFormat(LOCALE, {notation: "compact", maximumFractionDigits: 1}).format(Math.abs(v))}`;

// --- Graphique : plus-value réalisée ou flux net par période (une barre par période, au-dessus ou
// en dessous de zéro). Une période à zéro mais avec des opérations a un repère sur la ligne de zéro.
// Clic (ou Entrée) sur une période : elle devient la période affichée.
function PnlChart({periods, unit, metric, selected, onSelect}) {
  const [hover, setHover] = useState(null);
  const values = periods.map((p) => p.stats[metric.id]);
  const {top, bottom, ticks} = scale(Math.min(0, ...values), Math.max(0, ...values));
  const span = top - bottom;
  const y = (v) => ((top - v) / span) * 100;
  const every = Math.max(1, Math.ceil(periods.length / 8));
  const tip = hover != null ? periods[hover] : null;
  const x = hover != null ? ((hover + 0.5) / periods.length) * 100 : 0;
  return (
    <div class="pnl">
      <div class="pnl-plot">
        {ticks.map((t) => (
          <div key={t} class={`pnl-grid${t === 0 ? " zero" : ""}`} style={{top: `${y(t)}%`}}>
            <span>{t === 0 ? "0" : compact(t)}</span>
          </div>
        ))}
        <div class="pnl-cols" style={{gridTemplateColumns: `repeat(${periods.length}, minmax(0, 1fr))`}} onMouseLeave={() => setHover(null)}>
          {periods.map((p, i) => {
            const v = p.stats[metric.id];
            const bar = v > 0 ? {top: `${y(v)}%`, height: `${y(0) - y(v)}%`} : {top: `${y(0)}%`, height: `${y(v) - y(0)}%`};
            return (
              <button
                key={p.key}
                type="button"
                class={`pnl-col${p.key === selected ? " on" : ""}`}
                aria-pressed={p.key === selected}
                aria-label={L(
                  `${periodName(p, unit)} : ${metric.title.toLowerCase()} ${signOf(v)}${fmt(Math.abs(v))} ₩, ${plural(p.stats.sells, "vente")}, ${plural(p.stats.buys, "achat")}`,
                  `${periodName(p, unit)}: ${metric.title.toLowerCase()} ${signOf(v)}${fmt(Math.abs(v))} ₩, ${plural(p.stats.sells, "sale")}, ${plural(p.stats.buys, "purchase")}`,
                )}
                onClick={() => onSelect(p.key)}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              >
                {v !== 0 ? <span class={`pnl-bar ${v > 0 ? "up" : "down"}`} style={bar} /> : p.ops.length > 0 && <span class="pnl-mark" style={{top: `${y(0)}%`}} />}
              </button>
            );
          })}
        </div>
        {values.every((v) => v === 0) && <div class="pnl-empty">{metric.empty}</div>}
        {tip && (
          <div class={`pnl-tip${hover < periods.length / 4 ? " left" : hover > (periods.length * 3) / 4 ? " right" : ""}`} style={{left: `${x}%`}} role="status">
            <Gain v={tip.stats[metric.id]} class="pnl-tip-v" />
            <span class="pnl-tip-k">{periodName(tip, unit)}</span>
            <span class="pnl-tip-k">
              {L(plural(tip.stats.sells, "vente"), plural(tip.stats.sells, "sale"))} · {L(plural(tip.stats.buys, "achat"), plural(tip.stats.buys, "purchase"))}
              {tip.stats.resold ? ` · ${L(plural(tip.stats.resold, "revente"), plural(tip.stats.resold, "resale"))}` : ""}
            </span>
          </div>
        )}
      </div>
      <div class="pnl-x" style={{gridTemplateColumns: `repeat(${periods.length}, minmax(0, 1fr))`}} aria-hidden="true">
        {periods.map((p, i) => {
          const n = periods.length - 1 - i;
          // Une graduation sur deux (alt) disparaît sur un écran étroit
          return (
            <span key={p.key} class={`${p.key === selected ? "on" : ""}${n % (2 * every) === every ? " alt" : ""}`}>
              {n % every === 0 ? tick(p, unit) : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}

const Stat = ({k, children, sub}) => (
  <div class="stat">
    <div class="k">{k}</div>
    <div class="v">{children}</div>
    {sub && <div class="stat-sub">{sub}</div>}
  </div>
);

function Stats({s, resale}) {
  if (resale)
    return (
      <div class="grid-stats stonks-stats">
        <Stat k={L("Plus-value réalisée", "Realized profit")} sub={s.resold ? L(`${percent(s.roi)} sur ${plural(s.resold, "revente")}`, `${percent(s.roi)} on ${plural(s.resold, "resale")}`) : L("aucune revente", "no resales")}>
          <Gain v={s.profit} />
        </Stat>
        <Stat k={L("Prix de vente", "Sale price")} sub={L(plural(s.resold, "revente"), plural(s.resold, "resale"))}>
          <Money v={s.revenue} />
        </Stat>
        <Stat k={L("Prix d'achat", "Purchase price")} sub={L("des cartes revendues", "of resold cards")}>
          <Money v={s.cost} />
        </Stat>
        <Stat
          k={L("Reventes gagnantes", "Winning resales")}
          sub={s.resold ? L(`${fmt(s.wins)} sur ${fmt(s.resold)}${s.losses ? ` · ${plural(s.losses, "à perte", "à perte")}` : ""}`, `${fmt(s.wins)} of ${fmt(s.resold)}${s.losses ? ` · ${fmt(s.losses)} at a loss` : ""}`) : "—"}
        >
          {s.winRate == null ? "—" : pct(Math.round(s.winRate * 100))}
        </Stat>
        <Stat k={L("Détention moyenne", "Average holding time")} sub={L("de l'achat à la revente", "from purchase to resale")}>
          {held(s.avgHeldMs)}
        </Stat>
      </div>
    );
  return (
    <div class="grid-stats stonks-stats">
      <Stat k={L("Plus-value réalisée", "Realized profit")} sub={s.resold ? L(`${percent(s.roi)} sur ${plural(s.resold, "revente")}`, `${percent(s.roi)} on ${plural(s.resold, "resale")}`) : L("aucune revente", "no resales")}>
        <Gain v={s.profit} />
      </Stat>
      <Stat
        k={L("Ventes", "Sales")}
        sub={L(
          `${plural(s.sells, "vente")}${s.pulled ? ` · dont ${fmt(s.pulledRevenue)} ₩ de cartes non achetées` : ""}`,
          `${plural(s.sells, "sale")}${s.pulled ? ` · incl. ${fmt(s.pulledRevenue)} ₩ from cards not bought` : ""}`,
        )}
      >
        <Money v={s.revenue} />
      </Stat>
      <Stat k={L("Achats", "Purchases")} sub={L(plural(s.buys, "achat"), plural(s.buys, "purchase"))}>
        <Money v={s.spent} />
      </Stat>
      <Stat k={L("Flux net", "Net flow")} sub={L("ventes − achats", "sales − purchases")}>
        <Gain v={s.net} />
      </Stat>
      <Stat
        k={L("Reventes gagnantes", "Winning resales")}
        sub={s.resold ? L(`${fmt(s.wins)} sur ${fmt(s.resold)} · détention moyenne ${held(s.avgHeldMs)}`, `${fmt(s.wins)} of ${fmt(s.resold)} · average holding ${held(s.avgHeldMs)}`) : "—"}
      >
        {s.winRate == null ? "—" : pct(Math.round(s.winRate * 100))}
      </Stat>
    </div>
  );
}

// Carte d'une ligne : vignette, titre (lien vers l'article), rareté, shiny
function CardCell({card, rarity, shiny}) {
  const title = card?.wikipedia_title || L("Carte inconnue", "Unknown card");
  const href = card?.wikipedia_url || (card?.wikipedia_title ? `https://fr.wikipedia.org/wiki/${encodeURIComponent(card.wikipedia_title.replace(/ /g, "_"))}` : null);
  return (
    <div class="op-card" style={{"--rc": `var(--r-${rarity || "C"})`}}>
      <CardArt card={card} rarity={rarity} class="op-thumb" />
      <div class="op-title">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" title={title}>
            {title}
          </a>
        ) : (
          <span>{title}</span>
        )}
        <span class="op-meta">
          <Rarity r={rarity} />
          {shiny && (
            <span class="chip">
              <Icon name="shine" size={12} /> shiny
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

const NOT_BOUGHT = L("Carte tirée d'un paquet, reçue par échange ou achetée avant l'historique : pas de prix d'achat.", "Card pulled from a pack, received in a trade or bought before the history starts: no purchase price.");

// Lignes affichées d'un tableau : les premières, puis davantage à la demande (remis à zéro quand la liste change)
const PAGE = 50;
function useMore(deps) {
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), deps);
  return [shown, () => setShown(shown + PAGE * 2)];
}
const More = ({shown, total, onMore}) =>
  shown < total ? (
    <div class="row" style={{justifyContent: "center"}}>
      <button class="btn sm" onClick={onMore}>
        {L(`Afficher plus (${fmt(total - shown)} restantes)`, `Show more (${fmt(total - shown)} left)`)}
      </button>
    </div>
  ) : null;

const SortSeg = ({sort}) => (
  <div class="seg" role="group" aria-label={L("Ordre", "Order")}>
    <button class={sort === "date" ? "on" : ""} aria-pressed={sort === "date"} onClick={() => view.set({sort: "date"})}>
      {L("Récentes", "Recent")}
    </button>
    <button class={sort === "profit" ? "on" : ""} aria-pressed={sort === "profit"} onClick={() => view.set({sort: "profit"})}>
      {L("Plus-value", "Profit")}
    </button>
  </div>
);

function Operations({ops, period, unit, cards, byId}) {
  const v = useStore(view);
  const shown = ops.filter((op) => v.filter === "all" || op.side === v.filter);
  const sorted = [...shown].sort((a, b) => (v.sort === "profit" ? (b.profit ?? -Infinity) - (a.profit ?? -Infinity) || b.at - a.at : b.at - a.at));
  const count = (side) => ops.filter((op) => side === "all" || op.side === side).length;
  const [shownRows, more] = useMore([period, v.filter, v.sort]);
  return (
    <section class="box stack" aria-label={L("Opérations de la période", "Transactions in the period")}>
      <div class="row">
        <h3 style={{flex: 1}}>{L("Opérations", "Transactions")}</h3>
        <div class="seg" role="group" aria-label={L("Type d'opération", "Transaction type")}>
          {FILTERS.map((f) => (
            <button key={f.id} class={v.filter === f.id ? "on" : ""} aria-pressed={v.filter === f.id} onClick={() => view.set({filter: f.id})}>
              {f.label} <span class="n">{fmt(count(f.id))}</span>
            </button>
          ))}
        </div>
        <SortSeg sort={v.sort} />
      </div>
      {sorted.length ? (
        <div class="table-scroll">
          <table class="list ops">
            <thead>
              <tr>
                <th>{unit === "day" ? L("Heure", "Time") : L("Date", "Date")}</th>
                <th>{L("Carte", "Card")}</th>
                <th>{L("Opération", "Transaction")}</th>
                <th class="num">{L("Prix", "Price")}</th>
                <th class="num">{L("Prix d'achat", "Purchase price")}</th>
                <th class="num">{L("Plus-value", "Profit")}</th>
                <th class="num">{L("Détention", "Held")}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, shownRows).map((op) => {
                const sale = op.side === "buy" && op.soldId ? byId.get(op.soldId) : null;
                return (
                  <tr key={op.id}>
                    <td class="num muted" data-k={unit === "day" ? L("Heure", "Time") : L("Date", "Date")}>{when(op.at, unit)}</td>
                    <td class="op-main">
                      <CardCell card={cards.get(op.cardId)} rarity={op.rarity} shiny={op.shiny} />
                    </td>
                    <td data-k={L("Opération", "Transaction")}>
                      <span class={`chip side ${op.side}`}>{op.side === "buy" ? L("Achat", "Purchase") : op.cost != null ? L("Revente", "Resale") : L("Vente", "Sale")}</span>
                    </td>
                    <td class="num" data-k={L("Prix", "Price")}>
                      <Money v={op.price} />
                    </td>
                    <td class="num" data-k={L("Prix d'achat", "Purchase price")}>
                      {op.side === "sell" ? (
                        op.cost != null ? (
                          <Money v={op.cost} />
                        ) : (
                          <span class="muted" title={NOT_BOUGHT}>
                            {L("non achetée", "not bought")}
                          </span>
                        )
                      ) : null}
                    </td>
                    <td class="num" data-k={L("Plus-value", "Profit")}>
                      {op.side === "sell" ? (
                        op.cost != null ? (
                          <span class="stack-num">
                            <Gain v={op.profit} />
                            <span class="muted small">{percent(op.cost ? op.profit / op.cost : null)}</span>
                          </span>
                        ) : (
                          <span class="muted">—</span>
                        )
                      ) : sale ? (
                        <span class="stack-num" title={L(`Revendue ${dateFmt({day: "numeric", month: "long", hour: "2-digit", minute: "2-digit"}).format(new Date(sale.at))}`, `Resold ${dateFmt({day: "numeric", month: "long", hour: "2-digit", minute: "2-digit"}).format(new Date(sale.at))}`)}>
                          <span class="muted small">{L("revendue", "resold")}</span>
                          <Gain v={sale.profit} />
                        </span>
                      ) : (
                        <span class="muted small">{L("en stock", "in stock")}</span>
                      )}
                    </td>
                    <td class="num muted" data-k={L("Détention", "Held")}>{op.side === "sell" ? held(op.heldMs) : sale ? held(sale.heldMs) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <More shown={shownRows} total={sorted.length} onMore={more} />
        </div>
      ) : (
        <div class="empty">{ops.length ? L("Aucune opération de ce type sur la période.", "No transactions of this type in this period.") : L("Aucun achat ni vente sur la période.", "No purchases or sales in this period.")}</div>
      )}
    </section>
  );
}

// Achat-revente : une ligne par carte achetée puis revendue, à la date de la vente
function Resales({ops, period, unit, cards}) {
  const v = useStore(view);
  const sorted = [...ops].sort((a, b) => (v.sort === "profit" ? b.profit - a.profit || b.at - a.at : b.at - a.at));
  const [shownRows, more] = useMore([period, v.sort]);
  return (
    <section class="box stack" aria-label={L("Reventes de la période", "Resales in the period")}>
      <div class="row">
        <h3 style={{flex: 1}}>{L("Reventes", "Resales")}</h3>
        <SortSeg sort={v.sort} />
      </div>
      {sorted.length ? (
        <div class="table-scroll">
          <table class="list ops">
            <thead>
              <tr>
                <th>{unit === "day" ? L("Vendue à", "Sold at") : L("Vendue le", "Sold on")}</th>
                <th>{L("Carte", "Card")}</th>
                <th>{L("Achetée le", "Bought on")}</th>
                <th class="num">{L("Prix d'achat", "Purchase price")}</th>
                <th class="num">{L("Prix de vente", "Sale price")}</th>
                <th class="num">{L("Plus-value", "Profit")}</th>
                <th class="num">{L("Détention", "Held")}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, shownRows).map((op) => (
                <tr key={op.id}>
                  <td class="num muted" data-k={unit === "day" ? L("Vendue à", "Sold at") : L("Vendue le", "Sold on")}>{when(op.at, unit)}</td>
                  <td class="op-main">
                    <CardCell card={cards.get(op.cardId)} rarity={op.rarity} shiny={op.shiny} />
                  </td>
                  <td class="num muted" data-k={L("Achetée le", "Bought on")}>{when(op.boughtAt, "week")}</td>
                  <td class="num" data-k={L("Prix d'achat", "Purchase price")}>
                    <Money v={op.cost} />
                  </td>
                  <td class="num" data-k={L("Prix de vente", "Sale price")}>
                    <Money v={op.price} />
                  </td>
                  <td class="num" data-k={L("Plus-value", "Profit")}>
                    <span class="stack-num">
                      <Gain v={op.profit} />
                      <span class="muted small">{percent(op.cost ? op.profit / op.cost : null)}</span>
                    </span>
                  </td>
                  <td class="num muted" data-k={L("Détention", "Held")}>{held(op.heldMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <More shown={shownRows} total={sorted.length} onMore={more} />
        </div>
      ) : (
        <div class="empty">{L("Aucune revente sur la période.", "No resales in this period.")}</div>
      )}
    </section>
  );
}

// Achats pas encore revendus, toujours dans ma collection, au prix du marché actuel
function Positions({open, error, cards}) {
  useStore(priceVersion);
  const [shownRows, more] = useMore([open]);
  if (!open)
    return (
      <section class="box stack">
        <h3>{L("Cartes achetées en stock", "Bought cards in stock")}</h3>
        {open === false ? <Notice type="error">{L("Votre collection n'a pas pu être lue : ", "Your collection could not be read: ")}{error}</Notice> : <Progress done={0} label={L("Lecture de votre collection…", "Reading your collection…")} />}
      </section>
    );
  const rows = open.map((op) => {
    const p = pricing(op.cardId, op.rarity, {shiny: op.shiny});
    const value = priceOf(op.cardId, op.rarity, {shiny: op.shiny});
    return {op, p, latent: value == null ? null : value - op.price};
  });
  const cost = rows.reduce((n, r) => n + r.op.price, 0);
  const valued = rows.filter((r) => r.latent != null);
  const latent = valued.length ? valued.reduce((n, r) => n + r.latent, 0) : null;
  const reading = rows.some((r) => priceStatus(r.op.cardId, r.op.rarity, {shiny: r.op.shiny}) === "unknown");
  return (
    <section class="box stack" aria-label={L("Cartes achetées en stock", "Bought cards in stock")}>
      <div class="row">
        <h3 style={{flex: 1}}>{L("Cartes achetées en stock", "Bought cards in stock")}</h3>
        {rows.length > 0 && (
          <span class="small muted">
            {L(plural(rows.length, "carte"), plural(rows.length, "card"))}
            {L(" · payées ", " · paid ")}
            <Money v={cost} />
            {L(" · plus-value latente ", " · unrealized profit ")}
            <Gain v={latent} />
            {reading
              ? L(" · prix du marché en cours de lecture…", " · reading market prices…")
              : valued.length < rows.length
                ? L(` (${fmt(rows.length - valued.length)} sans prix fiable)`, ` (${fmt(rows.length - valued.length)} without a reliable price)`)
                : ""}
          </span>
        )}
      </div>
      {rows.length ? (
        <div class="table-scroll">
          <table class="list ops">
            <thead>
              <tr>
                <th>{L("Achetée", "Bought")}</th>
                <th>{L("Carte", "Card")}</th>
                <th class="num">{L("Prix d'achat", "Purchase price")}</th>
                <th class="num">{L("Prix du marché", "Market price")}</th>
                <th class="num">{L("Plus-value latente", "Unrealized profit")}</th>
                <th class="num">{L("Depuis", "Held for")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, shownRows).map(({op, p, latent: l}) => (
                <tr key={op.id}>
                  <td class="num muted" data-k={L("Achetée", "Bought")}>{when(op.at, "week")}</td>
                  <td class="op-main">
                    <CardCell card={cards.get(op.cardId)} rarity={op.rarity} shiny={op.shiny} />
                  </td>
                  <td class="num" data-k={L("Prix d'achat", "Purchase price")}>
                    <Money v={op.price} />
                  </td>
                  <td class="num" data-k={L("Prix du marché", "Market price")}>{p.price != null ? <Money v={p.price} approx={Boolean(p.uncertain)} title={p.uncertain} /> : <span class="muted">—</span>}</td>
                  <td class="num" data-k={L("Plus-value latente", "Unrealized profit")}>
                    <Gain v={l} />
                  </td>
                  <td class="num muted" data-k={L("Depuis", "Held for")}>{held(Date.now() - op.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <More shown={shownRows} total={rows.length} onMore={more} />
        </div>
      ) : (
        <div class="empty">{L("Toutes les cartes achetées ont été revendues (ou ont quitté votre collection).", "All bought cards have been resold (or have left your collection).")}</div>
      )}
      <p class="small muted">
        {L(
          "Plus-value latente : prix du marché actuel (médiane des dernières ventes, fiable seulement) moins le prix payé.",
          "Unrealized profit: current market price (median of recent sales, reliable only) minus the price paid.",
        )}
      </p>
    </section>
  );
}

export function StonksPage() {
  const s = useStore(stonksState);
  const v = useStore(view);
  const {selected} = useStore(picked);
  const session = readSession();
  useEffect(() => {
    loadStonks();
  }, []);
  // Calculs gardés tant que l'historique et la période ne changent pas (avant tout retour anticipé : règle des hooks)
  const unit = UNITS.find((u) => u.id === v.unit) || UNITS[0];
  const resale = v.scope === "resale";
  // Achat-revente : le graphique montre la plus-value (le flux net d'une revente est sa plus-value)
  const metric = (!resale && METRICS.find((m) => m.id === v.metric)) || METRICS[0];
  const ops = useMemo(() => (s.ops && resale ? resalesOnly(s.ops) : s.ops || []), [s.ops, resale]);
  const periods = useMemo(() => byPeriod(ops, unit.id), [ops, unit.id]);
  const byId = useMemo(() => new Map((s.ops || []).map((op) => [op.id, op])), [s.ops]);
  const total = useMemo(() => tradeStats(ops), [ops]);

  const head = (
    <header class="stonks-head">
      <Mark size={30} />
      <div style={{flex: 1, minWidth: 0}}>
        <div class="eyebrow">WikiMasters Toolbox</div>
        <h1>Stonks</h1>
      </div>
      <div class="seg stonks-units" role="group" aria-label={L("Opérations prises en compte", "Transactions included")}>
        {SCOPES.map((o) => (
          <button key={o.id} class={v.scope === o.id ? "on" : ""} aria-pressed={v.scope === o.id} title={o.title} onClick={() => (view.set({scope: o.id}), picked.set({selected: null}))}>
            {o.label}
          </button>
        ))}
      </div>
      <div class="seg stonks-units" role="group" aria-label={L("Période", "Period")}>
        {UNITS.map((u) => (
          <button key={u.id} class={v.unit === u.id ? "on" : ""} aria-pressed={v.unit === u.id} onClick={() => (view.set({unit: u.id}), picked.set({selected: null}))}>
            {u.label}
          </button>
        ))}
      </div>
      <button class="btn sm" disabled={s.loading || !session} onClick={() => loadStonks({force: true})} title={s.at ? L(`Mis à jour ${timeAgo(s.at)}`, `Updated ${timeAgo(s.at)}`) : undefined}>
        <Icon name="refresh" size={14} /> {L("Actualiser", "Refresh")}
      </button>
    </header>
  );

  if (!session)
    return (
      <div class="stonks">
        {head}
        <div class="empty">{L("Connectez-vous à WikiMasters pour voir votre historique.", "Sign in to WikiMasters to see your history.")}</div>
      </div>
    );
  if (!s.ops)
    return (
      <div class="stonks">
        {head}
        {s.error ? (
          <Notice type="error">
            {L("Historique illisible : ", "Could not read the history: ")}
            {s.error}{" "}
            <button class="btn sm" onClick={() => loadStonks({force: true})}>
              {L("Réessayer", "Retry")}
            </button>
          </Notice>
        ) : (
          <Progress done={0} label={L("Lecture de vos enchères conclues…", "Reading your completed auctions…")} />
        )}
      </div>
    );

  // Période affichée : celle choisie, sinon la dernière (en cours)
  const found = periods.findIndex((p) => p.key === selected);
  const at = found >= 0 ? found : periods.length - 1;
  const current = periods[at];
  // Fenêtre du graphique : les dernières périodes, centrée sur la période choisie si elle est plus ancienne
  let end = periods.length;
  if (at < end - unit.window) end = at + Math.ceil(unit.window / 2);
  const shown = periods.slice(Math.max(0, end - unit.window), end);
  const select = (key) => picked.set({selected: key});
  const hint = current ? periodHint(current, periods, unit.id) : null;
  const since = ops.length ? dateFmt({day: "numeric", month: "long", year: "numeric"}).format(new Date(ops[0].at)) : "";

  return (
    <div class={`stonks${s.loading ? " refreshing" : ""}`}>
      {head}
      <p class="stonks-lead">
        {resale
          ? L(
              "Seulement les cartes achetées au marché puis revendues, chacune avec son prix d'achat : une revente compte à la date de la vente. Les ventes de cartes tirées et les cartes encore en stock sont écartées.",
              "Only cards bought on the market and then resold, each with its purchase price: a resale counts on the date of the sale. Sales of pulled cards and cards still in stock are left out.",
            )
          : L(
              "Vos enchères conclues, achats et ventes. Une vente est rapprochée du plus ancien achat encore en stock de la même carte (même rareté, même version) : la différence est la plus-value réalisée.",
              "Your completed auctions, purchases and sales. Each sale is matched with the oldest purchase of the same card still in stock (same rarity, same version): the difference is the realized profit.",
            )}
      </p>
      {s.error && (
        <Notice type="error">
          {L("Actualisation impossible : ", "Refresh failed: ")}
          {s.error}
        </Notice>
      )}
      {!ops.length ? (
        <div class="empty">
          {resale
            ? L(
                "Aucune carte achetée puis revendue pour l'instant : chaque revente d'une carte achetée au marché apparaîtra ici, avec sa plus-value.",
                "No card bought and resold yet: every resale of a card bought on the market will show up here, with its profit.",
              )
            : L("Aucune enchère conclue pour l'instant : vos achats et ventes au marché apparaîtront ici.", "No completed auctions yet: your market purchases and sales will show up here.")}
        </div>
      ) : (
        <>
          <div class="stonks-total small muted">
            {resale ? (
              L(
                <>
                  Depuis le {since} : plus-value réalisée <Gain v={total.profit} /> sur {plural(total.resold, "revente")} ({percent(total.roi)}) · achetées <Money v={total.cost} /> · revendues <Money v={total.revenue} /> · {fmt(total.wins)} gagnantes sur {fmt(total.resold)}
                </>,
                <>
                  Since {since}: realized profit <Gain v={total.profit} /> on {plural(total.resold, "resale")} ({percent(total.roi)}) · bought <Money v={total.cost} /> · resold <Money v={total.revenue} /> · {fmt(total.wins)} winning out of {fmt(total.resold)}
                </>,
              )
            ) : L(
              <>
                Depuis le {since} : plus-value réalisée <Gain v={total.profit} /> sur {plural(total.resold, "revente")} ({percent(total.roi)}) · {plural(total.sells, "vente")} pour <Money v={total.revenue} /> · {plural(total.buys, "achat")} pour <Money v={total.spent} />
              </>,
              <>
                Since {since}: realized profit <Gain v={total.profit} /> on {plural(total.resold, "resale")} ({percent(total.roi)}) · {plural(total.sells, "sale")} for <Money v={total.revenue} /> · {plural(total.buys, "purchase")} for <Money v={total.spent} />
              </>,
            )}
          </div>
          <section class="box stack" aria-label={L("Plus-value réalisée par période", "Realized profit by period")}>
            <div class="row stonks-period">
              <button class="icon-btn" aria-label={L("Période précédente", "Previous period")} disabled={at <= 0} onClick={() => select(periods[at - 1].key)}>
                <Icon name="back" size={16} />
              </button>
              <div style={{flex: 1, minWidth: 0}}>
                {hint && <div class="eyebrow">{hint}</div>}
                <h2>{periodName(current, unit.id)}</h2>
              </div>
              <button class="icon-btn flip" aria-label={L("Période suivante", "Next period")} disabled={at >= periods.length - 1} onClick={() => select(periods[at + 1].key)}>
                <Icon name="back" size={16} />
              </button>
            </div>
            <Stats s={current.stats} resale={resale} />
            <div class="stonks-chart-head">
              <div>
                <div class="eyebrow">
                  {L(`${metric.title} par ${unit.label.toLowerCase()}`, `${metric.title} per ${unit.label.toLowerCase()}`)}
                </div>
                <span class="small muted">{L("Cliquez sur une barre pour afficher la période", "Click a bar to show that period")}</span>
              </div>
              {!resale && (
                <div class="seg" role="group" aria-label={L("Mesure du graphique", "Chart metric")}>
                  {METRICS.map((m) => (
                    <button key={m.id} class={metric.id === m.id ? "on" : ""} aria-pressed={metric.id === m.id} onClick={() => view.set({metric: m.id})}>
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <PnlChart periods={shown} unit={unit.id} metric={metric} selected={current.key} onSelect={select} />
          </section>
          {resale ? (
            <Resales ops={current.ops} period={`${unit.id}:${current.key}`} unit={unit.id} cards={s.cards} />
          ) : (
            <>
              <Operations ops={current.ops} period={`${unit.id}:${current.key}`} unit={unit.id} cards={s.cards} byId={byId} />
              <Positions open={s.open} error={s.openError} cards={s.cards} />
            </>
          )}
        </>
      )}
    </div>
  );
}
