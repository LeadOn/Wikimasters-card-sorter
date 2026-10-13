// Bloc de la Toolbox sur la page d'une enchère : prix moyen, écart entre la mise et ce prix,
// carte déjà possédée ou non, amis intéressés. Lecture seule : la mise se fait avec le formulaire du site.
import {useEffect, useState} from "preact/hooks";
import {useStore} from "../../lib/store";
import {owned} from "../../state/collection";
import {priceOf, priceVersion} from "../../state/prices";
import {auctionById, auctionVersion, loadAuction, nextBid, isLeading} from "../../features/market";
import {Icon, Mark, Money, fmt} from "../components";
import {PriceLine, Interest} from "./shared";

// Écart d'une mise au prix moyen, en %
const gapOf = (amount, avg) => (avg ? Math.round((100 * (amount - avg)) / avg) : null);

function Gap({gap}) {
  if (gap == null) return null;
  if (gap <= -20) return <span class="chip ok">{-gap} % sous la moyenne</span>;
  if (gap >= 20) return <span class="chip warn">{gap} % au-dessus de la moyenne</span>;
  return <span class="chip">proche de la moyenne ({gap > 0 ? "+" : ""}{gap} %)</span>;
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
          <span class="muted small">Analyse de l'enchère…</span>
        </div>
      </section>
    );
  const cardId = a.card_id || a.card.id;
  const rarity = a.snapshot_rarity || a.card.rarity;
  const current = a.current_bid ?? a.base_amount;
  const next = nextBid(a);
  const avg = priceOf(cardId, rarity);
  const ownedCard = loadedAt ? ids.has(cardId) : null;
  return (
    <section class="island compact" aria-label="Analyse WikiMasters Toolbox">
      <div class="island-head">
        <Mark size={20} />
        <span class="island-title">Analyse Toolbox</span>
        {isLeading(a) && <span class="chip ok">Vous êtes en tête</span>}
      </div>
      <PriceLine cardId={cardId} rarity={rarity} />
      {avg != null && current != null && (
        <div class="kv">
          <span class="k">{a.current_bid != null ? "Enchère actuelle" : "Mise de départ"}</span>
          <strong>
            <Money v={current} />
          </strong>
          <Gap gap={gapOf(current, avg)} />
          {next !== current && <span class="muted small">prochaine mise : {fmt(next)} ₩ ({gapOf(next, avg) > 0 ? "+" : ""}{gapOf(next, avg)} %)</span>}
        </div>
      )}
      {ownedCard != null && (
        <div class="kv">
          <span class="k">Collection</span>
          {ownedCard ? (
            <span class="chip">
              <Icon name="check" size={12} /> Vous l'avez déjà
            </span>
          ) : (
            <span class="chip ok">Nouvelle pour vous</span>
          )}
        </div>
      )}
      <Interest card={{title: a.card.wikipedia_title, category: a.card.category, summary: a.card.summary, image_url: a.card.hide_image ? null : a.card.image_url}} />
    </section>
  );
}
