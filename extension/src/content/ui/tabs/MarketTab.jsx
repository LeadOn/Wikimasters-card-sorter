// Onglet « Marché » : mes enchères (surenchère en un clic, avec confirmation) et mes doublons
// (mise en vente ou défausse d'un exemplaire, avec confirmation).
import {useState, useEffect} from "preact/hooks";
import {useStore} from "../../lib/store";
import {bidsState, refreshBids, placeBid, nextBid, isLeading, msLeft, sellState, loadSpares, spareValue, spareCopy, discardSpare} from "../../features/market";
import {priceVersion, priceOf, pricing} from "../../state/prices";
import {CardRow, Icon, Notice, Progress, fmt, plural, duration, timeAgo} from "../components";
import {confirmAction, toast, errorMessage} from "../feedback";
import {askSell} from "../SellDialog";
import {confirmDiscard} from "../discard";
import {L} from "../../../shared/i18n";

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
  const avg = priceOf(a.card_id, a.snapshot_rarity || a.card?.rarity, {shiny: a.is_shiny});
  const bid = async (amount) => {
    const ok = await confirmAction({
      title: L(`Enchérir ${fmt(amount)} ₩ ?`, `Bid ${fmt(amount)} ₩?`),
      body: L(
        `${a.card?.wikipedia_title} (${a.snapshot_rarity}) · enchère actuelle ${fmt(current)} ₩${avg ? ` · prix du marché ${fmt(avg)} ₩` : ""}. Les WikiBidous sont réservés jusqu'à la fin de l'enchère.`,
        `${a.card?.wikipedia_title} (${a.snapshot_rarity}) · current bid ${fmt(current)} ₩${avg ? ` · market price ${fmt(avg)} ₩` : ""}. The WikiBidous are held until the auction ends.`,
      ),
      confirm: L(`Enchérir ${fmt(amount)} ₩`, `Bid ${fmt(amount)} ₩`),
    });
    if (!ok) return;
    const r = await placeBid(a, amount);
    if (r.ok) toast(L("Enchère placée.", "Bid placed."), {type: "ok"});
    else if (r.min) {
      const again = await confirmAction({
        title: L("Mise trop basse", "Bid too low"),
        body: L(`Le site demande au moins ${fmt(r.min)} ₩. Enchérir ce montant ?`, `The site requires at least ${fmt(r.min)} ₩. Bid this amount?`),
        confirm: L(`Enchérir ${fmt(r.min)} ₩`, `Bid ${fmt(r.min)} ₩`),
      });
      if (again) {
        const r2 = await placeBid(a, r.min);
        toast(r2.ok ? L("Enchère placée.", "Bid placed.") : r2.error, {type: r2.ok ? "ok" : "error"});
      }
    } else toast(r.error, {type: "error"});
  };
  return (
    <CardRow
      card={a.card}
      rarity={a.snapshot_rarity}
      {...pricing(a.card_id, a.snapshot_rarity || a.card?.rarity, {shiny: a.is_shiny})}
      badges={[
        {label: `${a.current_bid != null ? L("enchère", "bid") : L("mise de départ", "starting bid")} ${fmt(current)} ₩`, type: "accent"},
        {label: duration(left), type: left < 120000 ? "danger" : ""},
        bidding && {label: leading ? L("en tête", "leading") : L("dépassé", "outbid"), type: leading ? "ok" : "warn"},
      ]}
      action={
        bidding && !leading && left > 0 ? (
          <button class="btn sm primary" onClick={() => bid(nextBid(a))}>
            {fmt(nextBid(a))} ₩
          </button>
        ) : (
          <a class="btn sm ghost" href={`/marketplace/${a.id}`}>{L("Voir", "View")}</a>
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
  const locked = s.sellCopyId ? "" : L("Tous vos exemplaires sont en favori : le site les verrouille", "All your copies are favorites: the site locks them");
  const shiny = Boolean(spareCopy(s)?.is_shiny);

  const discard = async () => {
    const ok = await confirmDiscard({
      card,
      rarity: s.rarity,
      shiny,
      copies: L(`Il vous en restera ${plural(s.copies - 1, "exemplaire")}.`, `You will have ${plural(s.copies - 1, "copy", "copies")} left.`),
    });
    if (!ok) return;
    setBusy(true);
    try {
      await discardSpare({userCardId: s.sellCopyId, cardId: s.card_id});
      toast(L(`${card.wikipedia_title} : un exemplaire défaussé, +1 WikiBidou.`, `${card.wikipedia_title}: one copy discarded, +1 WikiBidou.`), {type: "ok"});
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
      {...pricing(s.card_id, s.rarity, {shiny})}
      badges={[{label: L(plural(s.spare, "en trop", "en trop"), plural(s.spare, "extra", "extra")), type: "ok"}, s.starred && {label: L("favori", "favorite"), type: "warn", icon: "star"}]}
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
                shiny,
                badges: [{label: L(`${s.copies} exemplaires`, `${s.copies} copies`), type: "ok"}],
                note: L("Un exemplaire est mis en réserve pendant l'enchère ; vous en gardez au moins un.", "One copy is held in reserve during the auction; you keep at least one."),
              })
            }
          >
            {L("Vendre", "Sell")}
          </button>
          <button
            class="btn sm ghost"
            disabled={busy || loading || Boolean(locked)}
            title={locked || L("Défausser un exemplaire contre 1 WikiBidou", "Discard a copy for 1 WikiBidou")}
            aria-label={L("Défausser un exemplaire", "Discard a copy")}
            onClick={discard}
          >
            {busy ? <span class="spinner" style={{width: "12px", height: "12px"}} aria-label={L("Défausse en cours", "Discarding")} /> : <Icon name="discard" size={14} />}
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
          <h2>{L("Marché", "Market")}</h2>
          <p>{L("Suivez vos enchères, vendez ou défaussez vos cartes en double. Chaque enchère, mise en vente ou défausse demande votre confirmation.", "Track your auctions, sell or discard your duplicate cards. Every bid, listing or discard asks for your confirmation.")}</p>
        </div>
      </div>

      <div class="box stack">
        <div class="row">
          <h3 style={{flex: 1}}>{L("Mes enchères", "My auctions")}</h3>
          {bids.balance != null && <span class="chip accent">{fmt(bids.balance)} WikiBidous</span>}
          <span class="small muted">{bids.at ? timeAgo(bids.at) : ""}</span>
          <button class="btn sm" disabled={bids.loading} onClick={refreshBids}>{L("Actualiser", "Refresh")}</button>
        </div>
        {bids.error && <Notice type="error">{bids.error}</Notice>}
        {bids.bidding.length ? (
          <div class="cards">{[...bids.bidding].sort((a, b) => msLeft(a) - msLeft(b)).map((a) => <AuctionRow key={a.id} a={a} bidding />)}</div>
        ) : (
          <p class="help">{L("Aucune enchère en cours.", "No active bids.")}</p>
        )}
        {bids.selling.length > 0 && (
          <>
            <h3 style={{marginTop: "8px"}}>{L("Mes ventes en cours", "My active sales")}</h3>
            <div class="cards">{bids.selling.map((a) => <AuctionRow key={a.id} a={a} />)}</div>
          </>
        )}
      </div>

      <div class="box stack">
        <div class="row">
          <h3 style={{flex: 1}}>{L("Mes doublons", "My duplicates")}</h3>
          {sell.quota && <span class={`chip ${quotaFull ? "warn" : ""}`}>{sell.quota.sellingCount} / {sell.quota.maxConcurrentAuctions} {L("ventes en cours", "active sales")}</span>}
          <button class="btn sm" disabled={sell.loading} onClick={loadSpares}>{L("Actualiser", "Refresh")}</button>
        </div>
        <p class="help">
          {L(
            "Les cartes que vous possédez en plusieurs exemplaires, les plus chères d'abord. Mettez un exemplaire aux enchères, ou défaussez-le contre 1 WikiBidou : vous gardez toujours au moins un exemplaire.",
            "Cards you own in several copies, most valuable first. Put a copy up for auction, or discard it for 1 WikiBidou: you always keep at least one copy.",
          )}
        </p>
        {sell.loading && <Progress label={L("Lecture de votre collection", "Reading your collection")} done={0} />}
        {sell.error && <Notice type="error">{sell.error}</Notice>}
        {sell.spares && !spares.length && <p class="help">{L("Aucun doublon.", "No duplicates.")}</p>}
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
