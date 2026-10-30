// Bloc de la Toolbox sur la page d'une enchère : prix du marché, écart entre la mise et ce prix,
// carte déjà possédée ou non, amis intéressés. Lecture seule : la mise se fait avec le formulaire du site.
import {useEffect, useState} from "preact/hooks";
import {useStore} from "../../lib/store";
import {owned} from "../../state/collection";
import {priceOf, priceVersion} from "../../state/prices";
import {auctionById, auctionVersion, loadAuction, nextBid, isLeading} from "../../features/market";
import {Icon, Mark, Money, fmt} from "../components";
import {PriceLine, Interest} from "./shared";
import {L} from "../../../shared/i18n";

// Écart d'une mise au prix du marché (fiable seulement), en %
const gapOf = (amount, avg) => (avg ? Math.round((100 * (amount - avg)) / avg) : null);

function Gap({gap}) {
  if (gap == null) return null;
  if (gap <= -20) return <span class="chip ok">{L(`${-gap} % sous le prix du marché`, `${-gap}% below market price`)}</span>;
  if (gap >= 20) return <span class="chip warn">{L(`${gap} % au-dessus du prix du marché`, `${gap}% above market price`)}</span>;
  return <span class="chip">{L(`proche du prix du marché (${gap > 0 ? "+" : ""}${gap} %)`, `close to market price (${gap > 0 ? "+" : ""}${gap}%)`)}</span>;
}

export function AuctionInsight({auctionId}) {
  useStore(auctionVersion);
  useStore(priceVersion);
  const {ids, loadedAt} = useStore(owned);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    if (!auctionById(auctionId)?.card) loadAuction(auctionId).catch(() => setFailed(true));
  }, [auctionId]);

  const a = auctionById(auctionId);
  if (!a?.card)
    return failed ? null : (
      <section class="island compact">
        <div class="row">
          <div class="spinner" />
          <span class="muted small">{L("Analyse de l'enchère…", "Analyzing the auction…")}</span>
        </div>
      </section>
    );
  const cardId = a.card_id || a.card.id;
  const rarity = a.snapshot_rarity || a.card.rarity;
  const current = a.current_bid ?? a.base_amount;
  const next = nextBid(a);
  const avg = priceOf(cardId, rarity, {shiny: a.is_shiny});
  const ownedCard = loadedAt ? ids.has(cardId) : null;
  return (
    <section class="island compact" aria-label={L("Analyse WikiMasters Toolbox", "WikiMasters Toolbox analysis")}>
      <div class="island-head">
        <Mark size={20} />
        <span class="island-title">{L("Analyse Toolbox", "Toolbox analysis")}</span>
        {isLeading(a) && <span class="chip ok">{L("Vous êtes en tête", "You are leading")}</span>}
      </div>
      <PriceLine cardId={cardId} rarity={rarity} shiny={Boolean(a.is_shiny)} />
      {avg != null && current != null && (
        <div class="kv">
          <span class="k">{a.current_bid != null ? L("Enchère actuelle", "Current bid") : L("Mise de départ", "Starting bid")}</span>
          <strong>
            <Money v={current} />
          </strong>
          <Gap gap={gapOf(current, avg)} />
          {next !== current && <span class="muted small">{L(`prochaine mise : ${fmt(next)} ₩ (${gapOf(next, avg) > 0 ? "+" : ""}${gapOf(next, avg)} %)`, `next bid: ${fmt(next)} ₩ (${gapOf(next, avg) > 0 ? "+" : ""}${gapOf(next, avg)}%)`)}</span>}
        </div>
      )}
      {ownedCard != null && (
        <div class="kv">
          <span class="k">{L("Collection", "Collection")}</span>
          {ownedCard ? (
            <span class="chip">
              <Icon name="check" size={12} /> {L("Vous l'avez déjà", "You already have it")}
            </span>
          ) : (
            <span class="chip ok">{L("Nouvelle pour vous", "New for you")}</span>
          )}
        </div>
      )}
      <Interest card={{title: a.card.wikipedia_title, category: a.card.category, summary: a.card.summary, image_url: a.card.hide_image ? null : a.card.image_url}} />
    </section>
  );
}
