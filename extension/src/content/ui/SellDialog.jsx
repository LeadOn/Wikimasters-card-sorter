// Fenêtre « Mettre aux enchères », partagée par l'onglet Marché et le récapitulatif de paquet.
// Affichée à la racine de la Toolbox (App), comme les confirmations : elle s'ouvre de la même façon
// depuis le panneau et depuis un bloc intégré à une page du site.
import {useState, useEffect} from "preact/hooks";
import {createStore, useStore} from "../lib/store";
import {sellCard} from "../features/market";
import {site, AUCTION_DURATIONS} from "../api/site";
import {priceOf} from "../state/prices";
import {CardRow, Notice, fmt} from "./components";
import {toast, errorMessage} from "./feedback";

const sellDialog = createStore({current: null});

// askSell({card, userCardId, rarity, badges, note}) → Promise<{baseAmount, durationMinutes} | {uncertain: true} | null>
// userCardId : l'exemplaire à mettre en vente (id de user_cards), card : la carte affichée
// null : annulé ; uncertain : le site n'a pas répondu, l'enchère a peut-être été créée
export function askSell(options) {
  sellDialog.get().current?.resolve(null);
  return new Promise((resolve) => sellDialog.set({current: {...options, resolve}}));
}

function close(result) {
  const current = sellDialog.get().current;
  sellDialog.set({current: null});
  current?.resolve(result);
}

function SellForm({card, userCardId, rarity, badges = [], note}) {
  const avg = priceOf(card.id, rarity);
  const [amount, setAmount] = useState(String(avg || 10));
  const [minutes, setMinutes] = useState(60);
  const [quota, setQuota] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    // {sellingCount, maxConcurrentAuctions} ; ignoré si la réponse du site n'a pas cette forme
    site.marketplaceQuota().then((q) => Number.isFinite(q?.sellingCount) && Number.isFinite(q?.maxConcurrentAuctions) && setQuota(q), () => {});
  }, []);
  const full = quota && quota.sellingCount >= quota.maxConcurrentAuctions;
  const dismiss = () => close(busy === "uncertain" ? {uncertain: true} : null);

  const submit = async () => {
    const baseAmount = Math.round(Number(amount));
    if (!Number.isInteger(baseAmount) || baseAmount < 1) return setError("Mise de départ invalide (minimum 1).");
    setBusy(true);
    setError(null);
    try {
      await sellCard({userCardId, cardId: card.id, baseAmount, durationMinutes: minutes});
      toast(`${card.wikipedia_title} mise aux enchères à ${fmt(baseAmount)} ₩.`, {type: "ok"});
      close({baseAmount, durationMinutes: minutes});
    } catch (e) {
      setError(errorMessage(e));
      // Sans réponse du site, l'enchère existe peut-être déjà : pas de second envoi depuis cette fenêtre
      if (e.uncertain) setBusy("uncertain");
      else setBusy(false);
    }
  };

  return (
    <div class="modal-wrap" onClick={(e) => e.target === e.currentTarget && dismiss()}>
      <div class="modal" role="dialog" aria-label="Mettre aux enchères">
        <h3>Mettre aux enchères</h3>
        <CardRow card={card} rarity={rarity} price={avg} badges={badges} />
        <p class="help">{note || "L'exemplaire est mis en réserve pendant l'enchère."}</p>
        <div class="row" style={{alignItems: "flex-end"}}>
          <label class="field" style={{flex: 1}}>
            <span>Mise de départ (₩)</span>
            <input type="number" min="1" step="1" value={amount} onInput={(e) => setAmount(e.currentTarget.value)} />
          </label>
          <label class="field" style={{flex: 1}}>
            <span>Durée</span>
            <select value={minutes} onChange={(e) => setMinutes(Number(e.currentTarget.value))}>
              {AUCTION_DURATIONS.map((d) => (
                <option key={d.minutes} value={d.minutes}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p class="small muted">
          {avg != null ? `Prix moyen constaté pour cette rareté : ${fmt(avg)} ₩.` : "Cette carte n'a jamais été vendue dans cette rareté."}
          {quota && ` ${quota.sellingCount} / ${quota.maxConcurrentAuctions} ventes en cours.`}
        </p>
        {full && <Notice type="warn">Vous avez atteint le nombre de ventes simultanées autorisé par le site.</Notice>}
        {error && <Notice type="error">{error}</Notice>}
        <div class="actions">
          <button class="btn ghost" onClick={dismiss}>
            {busy === "uncertain" ? "Fermer" : "Annuler"}
          </button>
          <button class="btn primary" disabled={Boolean(busy) || full} onClick={submit}>
            {busy === true ? "Mise en vente…" : "Lancer l'enchère"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SellDialogHost() {
  const {current} = useStore(sellDialog);
  return current ? <SellForm key={current.card.id} {...current} /> : null;
}
