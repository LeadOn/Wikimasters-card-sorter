// Récapitulatif du dernier paquet : bloc intégré à la page Paquets (et à l'onglet Paquets de la
// Toolbox), jamais une fenêtre. Les prix arrivent pendant la révélation des cartes ; tant qu'ils
// ne sont pas là, un indicateur de chargement les remplace. Chaque carte peut être mise aux
// enchères ou défaussée sur place, toujours après confirmation.
import {useState} from "preact/hooks";
import {useStore} from "../lib/store";
import {recapState, dismissRecap, discardPulled, markListed} from "../features/packs";
import {planSort} from "../features/sorter";
import {priceOf, priceStatus, priceVersion} from "../state/prices";
import {isOn} from "../state/settings";
import {Icon, Mark, Money, Rarity, ThemeChip, fmt, plural, useWikiImage} from "./components";
import {toast, errorMessage, confirmAction} from "./feedback";
import {askSell} from "./SellDialog";
import {emit} from "../lib/bus";
import {categorize, isThemeTag, DOUBLON} from "../../../../core";
import {mountIsland} from "./islands/mount";

function Price({card, loading}) {
  const status = priceStatus(card.id, card.rarity);
  if (status === "ok") return <Money v={priceOf(card.id, card.rarity)} class="recap-price" />;
  if (loading || status === "unknown") return <span class="spinner" aria-label="Chargement du prix" />;
  if (status === "error") return <span class="recap-price none" title="Le serveur n'a pas répondu ; nouvel essai dans quelques minutes">?</span>;
  return <span class="recap-price none" title="Cette carte n'a jamais été vendue dans cette rareté">aucune vente</span>;
}

// Vignette : image de la carte, sinon image de Wikimedia (jamais pour une image masquée par le site)
function Thumb({card}) {
  const own = card.hide_image ? null : card.image_url;
  const fallback = useWikiImage({...card, image_url: own});
  const src = own || fallback;
  return src ? <img class="recap-thumb" src={src} alt="" loading="lazy" referrerpolicy="no-referrer" /> : <div class="recap-thumb" />;
}

// Mettre aux enchères ou défausser l'exemplaire tiré ; une fois fait, ce qu'il en est advenu
function CardActions({card, index, at}) {
  const [busy, setBusy] = useState(false);
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
      badges: [card.isNew === true && {label: "Nouvelle", type: "ok"}, card.is_shiny && {label: "Shiny", type: "warn", icon: "shine"}],
      note: card.isNew === true ? "C'est votre seul exemplaire : il est mis en réserve pendant l'enchère." : "Un exemplaire est mis en réserve pendant l'enchère.",
    });
    markListed(at, index, sale);
  };

  const discard = async () => {
    const price = priceOf(card.id, card.rarity);
    const ok = await confirmAction({
      title: `Défausser « ${card.wikipedia_title} » ?`,
      body: [
        "La carte quitte votre collection contre 1 WikiBidou. C'est définitif.",
        card.isNew === true ? "C'est votre seul exemplaire." : card.isNew === false ? "Il vous en reste au moins un autre exemplaire." : "",
        card.is_shiny ? "Attention : c'est une carte shiny." : "",
        price > 1 ? `Elle se vend en moyenne ${fmt(price)} ₩ dans cette rareté : la mettre aux enchères rapporterait sans doute plus.` : "",
      ]
        .filter(Boolean)
        .join(" "),
      confirm: "Défausser (+1 ₩)",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await discardPulled(at, index);
      toast(`${card.wikipedia_title} défaussée : +1 WikiBidou.`, {type: "ok"});
    } catch (e) {
      toast(errorMessage(e), {type: "error", duration: 10000});
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="recap-actions">
      <button
        class="btn sm ghost"
        disabled={busy || !card.user_card_id}
        title={card.user_card_id ? "Mettre aux enchères" : "Exemplaire introuvable : mettez cette carte aux enchères depuis votre collection"}
        onClick={sell}
      >
        <Icon name="market" size={14} />
        <span class="label">Vendre</span>
      </button>
      <button
        class="btn sm ghost"
        disabled={busy || !card.user_card_id}
        title={card.user_card_id ? "Défausser contre 1 WikiBidou" : "Exemplaire introuvable : défaussez cette carte depuis votre collection"}
        onClick={discard}
      >
        {busy ? <span class="spinner" aria-label="Défausse en cours" /> : <Icon name="discard" size={14} />}
        <span class="label">Défausser</span>
        <span class="gain">+1</span>
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

export function PackRecapView({onClose, compact = false}) {
  const recap = useStore(recapState);
  useStore(priceVersion);
  if (!recap.cards.length) return null;
  const loading = recap.pricesLoading;
  const prices = recap.cards.map((c) => priceOf(c.id, c.rarity));
  const total = prices.reduce((n, p) => n + (p || 0), 0);
  const unpriced = prices.filter((p) => p == null).length;
  const failed = recap.cards.filter((c) => priceStatus(c.id, c.rarity) === "error").length;
  const fresh = recap.cards.filter((c) => c.isNew === true).length;
  const known = recap.cards.some((c) => c.isNew != null);

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
      <ul class={`recap-list${compact ? " compact" : ""}`}>
        {recap.cards.map((c, i) => (
          <li key={`${c.id}-${i}`} class={`recap-row${c.action?.kind === "discarded" ? " gone" : ""}`} style={{"--rc": `var(--r-${c.rarity || "C"})`}}>
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
              <CardActions card={c} index={i} at={recap.at} />
            </div>
          </li>
        ))}
      </ul>
      <footer class="recap-foot">
        <span class="small muted">
          {loading
            ? "Récupération des prix moyens du marché…"
            : failed
              ? `${plural(failed, "prix indisponible", "prix indisponibles")} (serveur WikiMasters), nouvel essai dans quelques minutes.`
              : unpriced
                ? `${plural(unpriced, "carte jamais vendue", "cartes jamais vendues")} dans sa rareté.`
                : "Prix moyens des 200 dernières ventes, par rareté."}
        </span>
        {recap.sort?.status === "done" && (
          <span class="chip ok">
            <Icon name="check" size={12} /> Cartes triées
          </span>
        )}
        {recap.sort?.status === "error" && <span class="chip danger" title={recap.sort.error}>Tri automatique impossible</span>}
        {(!recap.sort || recap.sort.status === "error") && isOn("sortAfterPack") && known && fresh > 0 && (
          <button
            class="btn sm primary"
            onClick={() => {
              emit("open-panel", {tab: "sort"});
              planSort({newOnly: true}).catch((e) => toast(errorMessage(e), {type: "error"}));
            }}
          >
            Trier les nouvelles cartes
          </button>
        )}
      </footer>
    </section>
  );
}

// Bloc autonome inséré dans la page du site, isolé dans son propre Shadow DOM
export function mountPackRecap(host) {
  mountIsland(host, PackRecapView)({onClose: dismissRecap});
}
