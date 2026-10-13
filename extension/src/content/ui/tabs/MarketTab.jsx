// Onglet « Marché » : mes enchères (surenchère en un clic, avec confirmation) et mes doublons
// (mise en vente ou défausse d'un exemplaire, avec confirmation).
import {useState, useEffect} from "preact/hooks";
import {useStore} from "../../lib/store";
import {bidsState, refreshBids, placeBid, nextBid, isLeading, msLeft, sellState, loadSpares, spareValue, discardSpare} from "../../features/market";
import {priceVersion, priceOf} from "../../state/prices";
import {CardRow, Icon, Notice, Progress, fmt, plural, duration, timeAgo} from "../components";
import {confirmAction, toast, errorMessage} from "../feedback";
import {askSell} from "../SellDialog";
import {confirmDiscard} from "../discard";

function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, []);
}

function AuctionRow({a, bidding}) {
  const leading = isLeading(a);
  const left = msLeft(a);
  const current = a.current_bid ?? a.base_amount;
  const avg = priceOf(a.card_id, a.snapshot_rarity || a.card?.rarity);
  const bid = async (amount) => {
    const ok = await confirmAction({
      title: `Enchérir ${fmt(amount)} ₩ ?`,
      body: `${a.card?.wikipedia_title} (${a.snapshot_rarity}) · enchère actuelle ${fmt(current)} ₩${avg ? ` · prix moyen ${fmt(avg)} ₩` : ""}. Les WikiBidous sont réservés jusqu'à la fin de l'enchère.`,
      confirm: `Enchérir ${fmt(amount)} ₩`,
    });
    if (!ok) return;
    const r = await placeBid(a, amount);
    if (r.ok) toast("Enchère placée.", {type: "ok"});
    else if (r.min) {
      const again = await confirmAction({title: "Mise trop basse", body: `Le site demande au moins ${fmt(r.min)} ₩. Enchérir ce montant ?`, confirm: `Enchérir ${fmt(r.min)} ₩`});
      if (again) {
        const r2 = await placeBid(a, r.min);
        toast(r2.ok ? "Enchère placée." : r2.error, {type: r2.ok ? "ok" : "error"});
      }
    } else toast(r.error, {type: "error"});
  };
  return (
    <CardRow
      card={a.card}
      rarity={a.snapshot_rarity}
      price={avg}
      badges={[
        {label: `${a.current_bid != null ? "enchère" : "mise de départ"} ${fmt(current)} ₩`, type: "accent"},
        {label: duration(left), type: left < 120000 ? "danger" : ""},
        bidding && {label: leading ? "en tête" : "dépassé", type: leading ? "ok" : "warn"},
      ]}
      action={
        bidding && !leading && left > 0 ? (
          <button class="btn sm primary" onClick={() => bid(nextBid(a))}>
            {fmt(nextBid(a))} ₩
          </button>
        ) : (
          <a class="btn sm ghost" href={`/marketplace/${a.id}`}>Voir</a>
        )
      }
    />
  );
}

// Carte en plusieurs exemplaires : en vendre ou en défausser un (jamais un favori, jamais le dernier).
// Pendant une relecture de la liste (après une action restée sans réponse), rien n'est proposé.
function SpareRow({s, quotaFull, loading}) {
  const [busy, setBusy] = useState(false);
  const card = {...s.card, id: s.card_id};
  const locked = s.sellCopyId ? "" : "Tous vos exemplaires sont en favori : le site les verrouille";

  const discard = async () => {
    const ok = await confirmDiscard({
      card,
      rarity: s.rarity,
      shiny: s.rows.find((r) => r.id === s.sellCopyId)?.is_shiny,
      copies: `Il vous en restera ${plural(s.copies - 1, "exemplaire")}.`,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await discardSpare({userCardId: s.sellCopyId, cardId: s.card_id});
      toast(`${card.wikipedia_title} : un exemplaire défaussé, +1 WikiBidou.`, {type: "ok"});
    } catch (e) {
      toast(errorMessage(e), {type: "error", duration: 10000});
    } finally {
      setBusy(false);
    }
  };

  return (
    <CardRow
      card={s.card}
      rarity={s.rarity}
      price={s.value}
      badges={[{label: plural(s.spare, "en trop", "en trop"), type: "ok"}, s.starred && {label: "favori", type: "warn", icon: "star"}]}
      action={
        <span class="row" style={{gap: "2px"}}>
          <button
            class="btn sm"
            disabled={busy || loading || quotaFull || Boolean(locked)}
            title={locked}
            onClick={() =>
              askSell({
                card,
                userCardId: s.sellCopyId,
                rarity: s.rarity,
                badges: [{label: `${s.copies} exemplaires`, type: "ok"}],
                note: "Un exemplaire est mis en réserve pendant l'enchère ; vous en gardez au moins un.",
              })
            }
          >
            Vendre
          </button>
          <button
            class="btn sm ghost"
            disabled={busy || loading || Boolean(locked)}
            title={locked || "Défausser un exemplaire contre 1 WikiBidou"}
            aria-label="Défausser un exemplaire"
            onClick={discard}
          >
            {busy ? <span class="spinner" style={{width: "12px", height: "12px"}} aria-label="Défausse en cours" /> : <Icon name="discard" size={14} />}
          </button>
        </span>
      }
    />
  );
}

export function MarketTab() {
  useTick();
  useStore(priceVersion);
  const bids = useStore(bidsState);
  const sell = useStore(sellState);
  useEffect(() => {
    if (!bids.at) refreshBids();
    if (!sell.spares && !sell.loading) loadSpares();
  }, []);

  const spares = (sell.spares || []).map((s) => ({...s, value: spareValue(s)})).sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  const quotaFull = sell.quota && sell.quota.sellingCount >= sell.quota.maxConcurrentAuctions;

  return (
    <div class="stack">
      <div class="page-head">
        <div>
          <h2>Marché</h2>
          <p>Suivez vos enchères, vendez ou défaussez vos cartes en double. Chaque enchère, mise en vente ou défausse demande votre confirmation.</p>
        </div>
      </div>

      <div class="box stack">
        <div class="row">
          <h3 style={{flex: 1}}>Mes enchères</h3>
          {bids.balance != null && <span class="chip accent">{fmt(bids.balance)} WikiBidous</span>}
          <span class="small muted">{bids.at ? timeAgo(bids.at) : ""}</span>
          <button class="btn sm" disabled={bids.loading} onClick={refreshBids}>Actualiser</button>
        </div>
        {bids.error && <Notice type="error">{bids.error}</Notice>}
        {bids.bidding.length ? (
          <div class="cards">{[...bids.bidding].sort((a, b) => msLeft(a) - msLeft(b)).map((a) => <AuctionRow key={a.id} a={a} bidding />)}</div>
        ) : (
          <p class="help">Aucune enchère en cours.</p>
        )}
        {bids.selling.length > 0 && (
          <>
            <h3 style={{marginTop: "8px"}}>Mes ventes en cours</h3>
            <div class="cards">{bids.selling.map((a) => <AuctionRow key={a.id} a={a} />)}</div>
          </>
        )}
      </div>

      <div class="box stack">
        <div class="row">
          <h3 style={{flex: 1}}>Mes doublons</h3>
          {sell.quota && <span class={`chip ${quotaFull ? "warn" : ""}`}>{sell.quota.sellingCount} / {sell.quota.maxConcurrentAuctions} ventes en cours</span>}
          <button class="btn sm" disabled={sell.loading} onClick={loadSpares}>Actualiser</button>
        </div>
        <p class="help">Les cartes que vous possédez en plusieurs exemplaires, les plus chères d'abord. Mettez un exemplaire aux enchères, ou défaussez-le contre 1 WikiBidou : vous gardez toujours au moins un exemplaire.</p>
        {sell.loading && <Progress label="Lecture de votre collection" done={0} />}
        {sell.error && <Notice type="error">{sell.error}</Notice>}
        {sell.spares && !spares.length && <p class="help">Aucun doublon.</p>}
        {spares.length > 0 && (
          <div class="cards">
            {spares.map((s) => (
              <SpareRow key={s.card_id} s={s} quotaFull={quotaFull} loading={sell.loading} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
