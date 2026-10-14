// Récapitulatif du dernier paquet : bloc intégré à la page Paquets (et à l'onglet Paquets de la
// Toolbox), jamais une fenêtre. Les prix arrivent pendant la révélation des cartes ; tant qu'ils
// ne sont pas là, un indicateur de chargement les remplace. Les cartes cochées sont défaussées
// ensemble, chacune peut être mise aux enchères, toujours après confirmation. Dans la page, un
// bouton enchaîne sur le paquet suivant.
import {useState} from "preact/hooks";
import {useStore} from "../lib/store";
import {recapState, dismissRecap, discardPulledMany, markListed, packsStatus} from "../features/packs";
import {planSort} from "../features/sorter";
import {priceOf, priceInfo, priceStatus, priceVersion, uncertainNote} from "../state/prices";
import {isOn} from "../state/settings";
import {Icon, Mark, Money, Rarity, ThemeChip, fmt, plural, useWikiImage} from "./components";
import {toast, errorMessage} from "./feedback";
import {confirmDiscardMany} from "./discard";
import {askSell} from "./SellDialog";
import {emit} from "../lib/bus";
import {categorize, isThemeTag, DOUBLON, RECENT_SALES} from "../../../../core";
import {mountIsland} from "./islands/mount";

function Price({card, loading}) {
  const shiny = {shiny: card.is_shiny};
  const status = priceStatus(card.id, card.rarity, shiny);
  if (status === "ok") return <Money v={priceOf(card.id, card.rarity, shiny)} class="recap-price" />;
  if (loading || status === "unknown") return <span class="spinner" aria-label="Chargement du prix" />;
  if (status === "few") {
    const info = priceInfo(card.id, card.rarity, shiny);
    if (info.price != null) return <Money v={info.price} class="recap-price" approx title={uncertainNote(info)} />;
    return <span class="recap-price none" title="Ses seules ventes sont ses toutes premières, ignorées">pas de prix</span>;
  }
  if (status === "error") return <span class="recap-price none" title="Le serveur n'a pas répondu ; nouvel essai dans quelques minutes">?</span>;
  return <span class="recap-price none" title={`Cette carte n'a jamais été vendue${card.is_shiny ? " en shiny" : ""} dans cette rareté`}>aucune vente</span>;
}

// Vignette : image de la carte, sinon image de Wikimedia (jamais pour une image masquée par le site)
function Thumb({card}) {
  const own = card.hide_image ? null : card.image_url;
  const fallback = useWikiImage({...card, image_url: own});
  const src = own || fallback;
  return src ? <img class="recap-thumb" src={src} alt="" loading="lazy" referrerpolicy="no-referrer" /> : <div class="recap-thumb" />;
}

// Exemplaire encore entre les mains du joueur : il peut être défaussé ou mis aux enchères
const available = (c) => Boolean(c.user_card_id) && !c.action;

// Mise aux enchères, un exemplaire à la fois ; une fois fait, ce qu'il est advenu de la carte
function CardActions({card, index, at, locked}) {
  const done = card.action;
  if (done?.kind === "discarded") return <span class="chip">Défaussée · +1 ₩</span>;
  if (done?.kind === "listed") return <span class="chip accent">En vente · {fmt(done.baseAmount)} ₩</span>;
  if (done?.kind === "uncertain")
    return (
      <span class="chip warn" title="Le site n'a pas répondu : vérifiez sur WikiMasters avant de recommencer">
        {done.what === "discard" ? "Défausse" : "Vente"} à vérifier
      </span>
    );

  const sell = async () => {
    const sale = await askSell({
      card,
      userCardId: card.user_card_id,
      rarity: card.rarity,
      shiny: card.is_shiny,
      badges: [card.isNew === true && {label: "Nouvelle", type: "ok"}, card.is_shiny && {label: "Shiny", type: "warn", icon: "shine"}],
      note: card.isNew === true ? "C'est votre seul exemplaire : il est mis en réserve pendant l'enchère." : "Un exemplaire est mis en réserve pendant l'enchère.",
    });
    markListed(at, index, sale);
  };

  return (
    <div class="recap-actions">
      <button
        class="btn sm ghost"
        disabled={locked || !card.user_card_id}
        title={card.user_card_id ? "Mettre aux enchères" : "Exemplaire introuvable : mettez cette carte aux enchères depuis votre collection"}
        onClick={sell}
      >
        <Icon name="market" size={14} />
        <span class="label">Vendre</span>
      </button>
    </div>
  );
}

// Étiquettes posées par le tri automatique (ou thème calculé si l'option est désactivée)
function SortTags({card, sort, index}) {
  if (!sort) return <ThemeChip theme={categorize(card)[0]} />;
  if (sort.status === "running")
    return (
      <span class="chip">
        <span class="spinner" style={{width: "10px", height: "10px", borderWidth: "2px"}} /> tri…
      </span>
    );
  if (sort.status === "error") return <ThemeChip theme={categorize(card)[0]} />;
  const r = sort.byIndex?.[index];
  if (!r || r.status === "unknown") return <span class="chip warn" title="Exemplaire introuvable : utilisez le tri manuel">non trié</span>;
  if (r.status === "already") return <span class="chip" title="Cet exemplaire avait déjà un thème : il n'a pas été modifié">déjà triée</span>;
  return (
    <>
      {r.tags.map((t) =>
        isThemeTag(t) ? <ThemeChip key={t} theme={t} /> : t === DOUBLON ? null : <span key={t} class="chip accent">{t}</span>,
      )}
    </>
  );
}

// Paquet suivant, sans passer par « Continuer » puis « Ouvrir » (seulement dans la page, quand il en reste)
function NextPack({onNext, disabled}) {
  const {remaining} = useStore(packsStatus);
  const [busy, setBusy] = useState(false);
  if (!remaining) return null;
  const run = async () => {
    setBusy(true);
    try {
      await onNext();
    } catch (e) {
      toast(errorMessage(e), {type: "error"});
    } finally {
      setBusy(false);
    }
  };
  return (
    <button class="btn sm primary" disabled={busy || disabled} onClick={run}>
      {busy ? <span class="spinner" aria-label="Ouverture en cours" /> : <Icon name="packs" size={14} />}
      Ouvrir le prochain
      <span class="num">({remaining})</span>
    </button>
  );
}

export function PackRecapView({onClose, onNext, compact = false}) {
  const recap = useStore(recapState);
  useStore(priceVersion);
  // Cartes cochées pour la défausse (index dans le paquet), propres à ce récapitulatif
  const [picks, setPicks] = useState({at: 0, set: new Set()});
  const [discarding, setDiscarding] = useState(null); // {done, total} pendant la défausse
  if (!recap.cards.length) return null;
  const loading = recap.pricesLoading;
  const prices = recap.cards.map((c) => priceOf(c.id, c.rarity, {shiny: c.is_shiny}));
  const total = prices.reduce((n, p) => n + (p || 0), 0);
  const unpriced = prices.filter((p) => p == null).length;
  const statuses = recap.cards.map((c) => priceStatus(c.id, c.rarity, {shiny: c.is_shiny}));
  const failed = statuses.filter((st) => st === "error").length;
  const few = statuses.filter((st) => st === "few").length;
  const fresh = recap.cards.filter((c) => c.isNew === true).length;
  const known = recap.cards.some((c) => c.isNew != null);

  const choosable = recap.cards.flatMap((c, i) => (available(c) ? [i] : []));
  const doubles = choosable.filter((i) => recap.cards[i].isNew === false && !recap.cards[i].is_shiny);
  const checked = picks.at === recap.at ? picks.set : new Set();
  const picked = choosable.filter((i) => checked.has(i));
  const pick = (indexes) => setPicks({at: recap.at, set: new Set(indexes)});
  const toggle = (i) => pick(checked.has(i) ? picked.filter((j) => j !== i) : [...picked, i]);

  const discardPicked = async () => {
    const at = recap.at;
    const cards = picked.map((i) => recap.cards[i]);
    if (!(await confirmDiscardMany(cards.map((c) => ({card: c, rarity: c.rarity, shiny: c.is_shiny, only: c.isNew}))))) return;
    setDiscarding({done: 0, total: picked.length});
    try {
      const n = await discardPulledMany(at, picked, (done) => setDiscarding({done, total: picked.length}));
      toast(n === 1 ? `${cards[0].wikipedia_title} défaussée : +1 WikiBidou.` : `${n} cartes défaussées : +${n} WikiBidous.`, {type: "ok"});
    } catch (e) {
      const before = e.discarded ? `${plural(e.discarded, "carte défaussée", "cartes défaussées")}, puis arrêt : ` : "";
      toast(before + errorMessage(e), {type: "error", duration: 10000});
    } finally {
      setDiscarding(null);
    }
  };

  return (
    <section class="recap" aria-label="Récapitulatif du paquet">
      <header class="recap-head">
        <Mark size={22} />
        <div class="recap-heading">
          <div class="recap-title">{recap.packs > 1 ? `${recap.packs} paquets ouverts` : "Récapitulatif du paquet"}</div>
          <div class="recap-sub">
            {plural(recap.cards.length, "carte")}
            {known && ` · ${plural(fresh, "nouvelle", "nouvelles")}`}
          </div>
        </div>
        <div class="recap-total">
          <span class="k">Valeur</span>
          {loading && unpriced ? <span class="spinner" aria-label="Chargement des prix" /> : unpriced === prices.length ? <span class="v none">—</span> : <Money v={total} class="v" />}
        </div>
        {onClose && (
          <button class="icon-btn" aria-label="Masquer le récapitulatif" onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
        )}
      </header>
      {choosable.length > 0 && (
        <div class="recap-select">
          <label class="check">
            <input
              type="checkbox"
              checked={picked.length === choosable.length}
              ref={(el) => el && (el.indeterminate = picked.length > 0 && picked.length < choosable.length)}
              disabled={Boolean(discarding)}
              onChange={() => pick(picked.length === choosable.length ? [] : choosable)}
            />
            Tout
          </label>
          {doubles.length > 0 && (
            <button class="btn sm ghost" disabled={Boolean(discarding)} title="Cocher les doublons (sauf les shiny)" onClick={() => pick(doubles)}>
              Doublons
            </button>
          )}
          <span class={`recap-select-count${picked.length ? "" : " hint"}`}>{picked.length ?plural(picked.length, "carte cochée", "cartes cochées") : "Cochez les cartes à défausser"}</span>
          <button class="btn sm" disabled={!picked.length || Boolean(discarding)} title="Défausser les cartes cochées contre 1 WikiBidou chacune" onClick={discardPicked}>
            {discarding ? <span class="spinner" aria-label="Défausse en cours" /> : <Icon name="discard" size={14} />}
            {discarding ? `Défausse… ${discarding.done}/${discarding.total}` : "Défausser"}
            {!discarding && picked.length > 0 && <span class="gain">+{picked.length}</span>}
          </button>
        </div>
      )}
      <ul class={`recap-list${compact ? " compact" : ""}`}>
        {recap.cards.map((c, i) => {
          const choosableRow = available(c) && !discarding;
          return (
            <li
              key={`${c.id}-${i}`}
              class={`recap-row${c.action?.kind === "discarded" ? " gone" : ""}${checked.has(i) && available(c) ? " picked" : ""}${choosableRow ? " choosable" : ""}`}
              style={{"--rc": `var(--r-${c.rarity || "C"})`}}
              onClick={choosableRow ? (e) => !e.target.closest("button, input, a") && toggle(i) : undefined}
            >
              {available(c) ? (
                <input
                  type="checkbox"
                  class="recap-pick"
                  checked={checked.has(i)}
                  disabled={Boolean(discarding)}
                  aria-label={`Défausser ${c.wikipedia_title}`}
                  onChange={() => toggle(i)}
                />
              ) : (
                <span class="recap-pick" />
              )}
              <Thumb card={c} />
              <div class="recap-card">
                <div class="recap-name" title={c.wikipedia_title}>{c.wikipedia_title}</div>
                <div class="recap-meta">
                  <Rarity r={c.rarity} />
                  {c.isNew === true && <span class="chip ok">Nouvelle</span>}
                  {c.isNew === false && <span class="chip danger">Doublon</span>}
                  {c.is_shiny && (
                    <span class="chip warn">
                      <Icon name="shine" size={12} /> Shiny
                    </span>
                  )}
                  <SortTags card={c} sort={recap.sort} index={i} />
                </div>
              </div>
              <div class="recap-value">
                <Price card={c} loading={loading} />
              </div>
              <div class="recap-do">
                <CardActions card={c} index={i} at={recap.at} locked={Boolean(discarding) && checked.has(i)} />
              </div>
            </li>
          );
        })}
      </ul>
      <footer class="recap-foot">
        <span class="small muted">
          {loading
            ? "Récupération des prix du marché…"
            : failed
              ? `${plural(failed, "prix indisponible", "prix indisponibles")} (serveur WikiMasters), nouvel essai dans quelques minutes.`
              : few
                ? `${plural(few, "carte vendue trop peu de fois", "cartes vendues trop peu de fois")} pour un prix fiable : hors du total.`
                : unpriced
                  ? `${plural(unpriced, "carte jamais vendue", "cartes jamais vendues")} dans sa rareté.`
                  : `Prix du marché : médiane des ${RECENT_SALES} dernières ventes, par rareté.`}
        </span>
        <div class="recap-foot-do">
          {recap.sort?.status === "done" && (
            <span class="chip ok">
              <Icon name="check" size={12} /> Cartes triées
            </span>
          )}
          {recap.sort?.status === "error" && <span class="chip danger" title={recap.sort.error}>Tri automatique impossible</span>}
          {(!recap.sort || recap.sort.status === "error") && isOn("sortAfterPack") && known && fresh > 0 && (
            <button
              class="btn sm"
              onClick={() => {
                emit("open-panel", {tab: "sort"});
                planSort({newOnly: true}).catch((e) => toast(errorMessage(e), {type: "error"}));
              }}
            >
              Trier les nouvelles cartes
            </button>
          )}
          {onNext && recap.source === "reveal" && recap.phase === "ready" && <NextPack onNext={onNext} disabled={Boolean(discarding)} />}
        </div>
      </footer>
    </section>
  );
}

// Bloc autonome inséré dans la page du site, isolé dans son propre Shadow DOM.
// onNext : ouvre le paquet suivant avec les boutons du site (features/site-dom.js).
export function mountPackRecap(host, {onNext} = {}) {
  mountIsland(host, PackRecapView)({onClose: dismissRecap, onNext});
}
