// Onglet « Marché » : mes enchères (surenchère en un clic, avec confirmation) et vente de mes doublons.
import {useState, useEffect} from "preact/hooks";
import {useStore} from "../../lib/store";
import {bidsState, refreshBids, placeBid, nextBid, isLeading, msLeft, sellState, loadSpares, spareValue, sellCard} from "../../features/market";
import {priceVersion, priceOf} from "../../state/prices";
import {AUCTION_DURATIONS} from "../../api/site";
import {CardRow, Notice, Progress, fmt, plural, duration, timeAgo} from "../components";
import {confirmAction, toast, errorMessage} from "../feedback";

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

function SellDialog({spare, onClose}) {
  const avg = spareValue(spare);
  const [amount, setAmount] = useState(String(avg || 10));
  const [minutes, setMinutes] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async () => {
    const baseAmount = Math.round(Number(amount));
    if (!Number.isInteger(baseAmount) || baseAmount < 1) return setError("Mise de départ invalide (minimum 1).");
    setBusy(true);
    setError(null);
    try {
      await sellCard({cardId: spare.card_id, baseAmount, durationMinutes: minutes});
      toast(`${spare.card.wikipedia_title} mise aux enchères à ${fmt(baseAmount)} ₩.`, {type: "ok"});
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="modal-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="modal">
        <h3>Mettre aux enchères</h3>
        <CardRow card={spare.card} rarity={spare.rarity} price={avg} badges={[{label: `${spare.copies} exemplaires`, type: "ok"}]} />
        <p class="help">Un exemplaire est mis en réserve pendant l'enchère ; vous en gardez au moins un.</p>
        <div class="row" style={{alignItems: "flex-end"}}>
          <label class="field" style={{flex: 1}}>
            <span>Mise de départ (₩)</span>
            <input type="number" min="1" step="1" value={amount} onInput={(e) => setAmount(e.currentTarget.value)} />
          </label>
          <label class="field" style={{flex: 1}}>
            <span>Durée</span>
            <select value={minutes} onChange={(e) => setMinutes(Number(e.currentTarget.value))}>
              {AUCTION_DURATIONS.map((d) => <option key={d.minutes} value={d.minutes}>{d.label}</option>)}
            </select>
          </label>
        </div>
        {avg != null && <p class="small muted">Prix moyen constaté pour cette rareté : {fmt(avg)} ₩.</p>}
        {error && <Notice type="error">{error}</Notice>}
        <div class="actions">
          <button class="btn ghost" onClick={onClose}>Annuler</button>
          <button class="btn primary" disabled={busy} onClick={submit}>{busy ? "Mise en vente…" : "Lancer l'enchère"}</button>
        </div>
      </div>
    </div>
  );
}

export function MarketTab() {
  useTick();
  useStore(priceVersion);
  const bids = useStore(bidsState);
  const sell = useStore(sellState);
  const [selling, setSelling] = useState(null);
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
          <p>Suivez vos enchères et vendez vos cartes en double. Chaque enchère ou mise en vente demande votre confirmation.</p>
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
          <h3 style={{flex: 1}}>Vendre mes doublons</h3>
          {sell.quota && <span class={`chip ${quotaFull ? "warn" : ""}`}>{sell.quota.sellingCount} / {sell.quota.maxConcurrentAuctions} ventes en cours</span>}
          <button class="btn sm" disabled={sell.loading} onClick={loadSpares}>Actualiser</button>
        </div>
        <p class="help">Les cartes que vous possédez en plusieurs exemplaires, les plus chères d'abord. Vous gardez toujours au moins un exemplaire.</p>
        {sell.loading && <Progress label="Lecture de votre collection" done={0} />}
        {sell.error && <Notice type="error">{sell.error}</Notice>}
        {sell.spares && !spares.length && <p class="help">Aucun doublon.</p>}
        {spares.length > 0 && (
          <div class="cards">
            {spares.map((s) => (
              <CardRow
                key={s.card_id}
                card={s.card}
                rarity={s.rarity}
                price={s.value}
                badges={[{label: plural(s.spare, "en trop", "en trop"), type: "ok"}, s.starred && {label: "★ favori", type: "warn"}]}
                action={<button class="btn sm" disabled={quotaFull} onClick={() => setSelling(s)}>Vendre</button>}
              />
            ))}
          </div>
        )}
      </div>
      {selling && <SellDialog spare={selling} onClose={() => setSelling(null)} />}
    </div>
  );
}
