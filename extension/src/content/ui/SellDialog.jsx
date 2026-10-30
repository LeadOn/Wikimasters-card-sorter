// Fenêtre « Mettre aux enchères », partagée par l'onglet Marché, le récapitulatif de paquet et la
// liste des cartes jamais vendues (une carte, ou plusieurs avec la même mise de départ).
// Affichée à la racine de la Toolbox (App), comme les confirmations : elle s'ouvre de la même façon
// depuis le panneau et depuis un bloc intégré à une page du site.
import {useState, useEffect, useRef} from "preact/hooks";
import {createStore, useStore} from "../lib/store";
import {sellCard} from "../features/market";
import {site, AUCTION_DURATIONS} from "../api/site";
import {priceInfo, priceOptions, pricing} from "../state/prices";
import {CardRow, Notice, Progress, fmt, plural} from "./components";
import {toast, errorMessage} from "./feedback";
import {L} from "../../shared/i18n";

const sellDialog = createStore({current: null});

// askSell({card, userCardId, rarity, shiny, badges, note}) → Promise<{baseAmount, durationMinutes} | {uncertain: true} | null>
// userCardId : l'exemplaire à mettre en vente (id de user_cards), card : la carte affichée, shiny : l'exemplaire est shiny
// null : annulé ; uncertain : le site n'a pas répondu, l'enchère a peut-être été créée
export function askSell(options) {
  sellDialog.get().current?.resolve(null);
  return new Promise((resolve) => sellDialog.set({current: {...options, resolve}}));
}

// askSellMany({items, sell}) → Promise<{done} | {uncertain: true} | null>
// items : cartes à mettre en vente ({card, rarity}) ; sell(items, {baseAmount, durationMinutes},
// {signal, onProgress}) les met en vente une à une et renvoie leur nombre (voir features/collection-view.js)
export function askSellMany(options) {
  sellDialog.get().current?.resolve(null);
  return new Promise((resolve) => sellDialog.set({current: {...options, resolve}}));
}

function close(result) {
  const current = sellDialog.get().current;
  sellDialog.set({current: null});
  current?.resolve(result);
}

// Ventes en cours et maximum autorisé par le site : {sellingCount, maxConcurrentAuctions}, ou null
// si la réponse du site n'a pas cette forme
function useQuota() {
  const [quota, setQuota] = useState(null);
  useEffect(() => {
    site.marketplaceQuota().then((q) => Number.isFinite(q?.sellingCount) && Number.isFinite(q?.maxConcurrentAuctions) && setQuota(q), () => {});
  }, []);
  return quota;
}

function AuctionFields({amount, setAmount, minutes, setMinutes, label = L("Mise de départ (₩)", "Starting bid (₩)"), disabled}) {
  return (
    <div class="row" style={{alignItems: "flex-end"}}>
      <label class="field" style={{flex: 1}}>
        <span>{label}</span>
        <input type="number" min="1" step="1" value={amount} disabled={disabled} onInput={(e) => setAmount(e.currentTarget.value)} />
      </label>
      <label class="field" style={{flex: 1}}>
        <span>{L("Durée", "Duration")}</span>
        <select value={minutes} disabled={disabled} onChange={(e) => setMinutes(Number(e.currentTarget.value))}>
          {AUCTION_DURATIONS.map((d) => (
            <option key={d.minutes} value={d.minutes}>
              {d.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

// Ce que l'on sait du prix de l'exemplaire, sous le formulaire
function priceHelp(info, shiny) {
  const version = shiny ? " en shiny" : "";
  if (!info) return L(`Cette carte n'a jamais été vendue${version} dans cette rareté.`, `This card has never been sold${shiny ? " as shiny" : ""} in this rarity.`);
  if (info.reliable)
    return L(
      `Prix du marché${shiny ? " shiny" : ""} pour cette rareté : ${fmt(info.price)} ₩ (${plural(info.total, "vente")}).`,
      `${shiny ? "Shiny market price" : "Market price"} for this rarity: ${fmt(info.price)} ₩ (${plural(info.total, "sale")}).`,
    );
  if (info.price == null)
    return L(
      `Les seules ventes${version} de cette carte sont ses toutes premières, ignorées : pas encore de prix du marché.`,
      `The only${shiny ? " shiny" : ""} sales of this card are its very first ones, which are ignored: no market price yet.`,
    );
  return L(
    `Prix indicatif : ${fmt(info.price)} ₩, sur trop peu de ventes pour être fiable (${plural(info.sales, "prise", "prises")} en compte, il en faut ${priceOptions().minSales}).`,
    `Estimated price: ${fmt(info.price)} ₩, from too few sales to be reliable (${fmt(info.sales)} counted, ${priceOptions().minSales} needed).`,
  );
}

function SellForm({card, userCardId, rarity, shiny = false, badges = [], note}) {
  const info = priceInfo(card.id, rarity, {shiny});
  // Mise de départ proposée : le prix du marché, seulement s'il est fiable
  const [amount, setAmount] = useState(String((info?.reliable && info.price) || 10));
  const [minutes, setMinutes] = useState(60);
  const quota = useQuota();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const full = quota && quota.sellingCount >= quota.maxConcurrentAuctions;
  const dismiss = () => close(busy === "uncertain" ? {uncertain: true} : null);

  const submit = async () => {
    const baseAmount = Math.round(Number(amount));
    if (!Number.isInteger(baseAmount) || baseAmount < 1) return setError(L("Mise de départ invalide (minimum 1).", "Invalid starting bid (minimum 1)."));
    setBusy(true);
    setError(null);
    try {
      await sellCard({userCardId, cardId: card.id, baseAmount, durationMinutes: minutes});
      toast(L(`${card.wikipedia_title} mise aux enchères à ${fmt(baseAmount)} ₩.`, `${card.wikipedia_title} put up for auction at ${fmt(baseAmount)} ₩.`), {type: "ok"});
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
      <div class="modal" role="dialog" aria-label={L("Mettre aux enchères", "Put up for auction")}>
        <h3>{L("Mettre aux enchères", "Put up for auction")}</h3>
        <CardRow card={card} rarity={rarity} {...pricing(card.id, rarity, {shiny})} badges={badges} />
        <p class="help">{note || L("L'exemplaire est mis en réserve pendant l'enchère.", "The copy is held in reserve during the auction.")}</p>
        <AuctionFields amount={amount} setAmount={setAmount} minutes={minutes} setMinutes={setMinutes} />
        <p class="small muted">
          {priceHelp(info, shiny)}
          {quota && L(` ${quota.sellingCount} / ${quota.maxConcurrentAuctions} ventes en cours.`, ` ${quota.sellingCount} / ${quota.maxConcurrentAuctions} active sales.`)}
        </p>
        {full && <Notice type="warn">{L("Vous avez atteint le nombre de ventes simultanées autorisé par le site.", "You have reached the number of simultaneous sales the site allows.")}</Notice>}
        {error && <Notice type="error">{error}</Notice>}
        <div class="actions">
          <button class="btn ghost" onClick={dismiss}>
            {busy === "uncertain" ? L("Fermer", "Close") : L("Annuler", "Cancel")}
          </button>
          <button class="btn primary" disabled={Boolean(busy) || full} onClick={submit}>
            {busy === true ? L("Mise en vente…", "Listing…") : L("Lancer l'enchère", "Start auction")}
          </button>
        </div>
      </div>
    </div>
  );
}

// Plusieurs cartes, même mise de départ et même durée, dans la limite des ventes simultanées
// autorisées par le site. Une enchère après l'autre, arrêt à la première erreur : rien n'est rejoué.
function SellManyForm({items, sell}) {
  const [amount, setAmount] = useState("10");
  const [minutes, setMinutes] = useState(60);
  const quota = useQuota();
  const [progress, setProgress] = useState(null); // {done, total} pendant les mises en vente
  const [ended, setEnded] = useState(null); // {done, uncertain} après un arrêt sur erreur
  const [error, setError] = useState(null);
  const abort = useRef(null);
  const room = quota ? Math.max(0, quota.maxConcurrentAuctions - quota.sellingCount) : items.length;
  const count = Math.min(items.length, room);
  const titles = items.map((c) => c.card.wikipedia_title);
  const dismiss = () => (progress ? abort.current?.abort() : close(ended ? (ended.uncertain ? {uncertain: true} : {done: ended.done}) : null));

  const submit = async () => {
    const baseAmount = Math.round(Number(amount));
    if (!Number.isInteger(baseAmount) || baseAmount < 1) return setError(L("Mise de départ invalide (minimum 1).", "Invalid starting bid (minimum 1)."));
    const chosen = items.slice(0, count);
    abort.current = new AbortController();
    setError(null);
    setProgress({done: 0, total: chosen.length});
    try {
      const done = await sell(chosen, {baseAmount, durationMinutes: minutes}, {signal: abort.current.signal, onProgress: (n) => setProgress({done: n, total: chosen.length})});
      toast(
        done < chosen.length
          ? L(`${plural(done, "carte mise", "cartes mises")} aux enchères, puis arrêt.`, `${plural(done, "card")} put up for auction, then stopped.`)
          : L(`${plural(done, "carte mise", "cartes mises")} aux enchères à ${fmt(baseAmount)} ₩.`, `${plural(done, "card")} put up for auction at ${fmt(baseAmount)} ₩.`),
        {type: "ok"},
      );
      close({done});
    } catch (e) {
      const before = e.done ? L(`${plural(e.done, "carte mise", "cartes mises")} aux enchères, puis arrêt : `, `${plural(e.done, "card")} put up for auction, then stopped: `) : "";
      setError(before + errorMessage(e));
      setEnded({done: e.done || 0, uncertain: Boolean(e.uncertain)});
      setProgress(null);
    }
  };

  return (
    <div class="modal-wrap" onClick={(e) => e.target === e.currentTarget && !progress && dismiss()}>
      <div class="modal" role="dialog" aria-label={L("Mettre aux enchères", "Put up for auction")}>
        <h3>{L(`Mettre aux enchères ${plural(items.length, "carte", "cartes")}`, `Put ${plural(items.length, "card")} up for auction`)}</h3>
        <p class="small muted">
          {titles.slice(0, 6).join(", ")}
          {titles.length > 6 ? L(`… et ${fmt(titles.length - 6)} autres`, `… and ${fmt(titles.length - 6)} more`) : ""}
        </p>
        <p class="help">
          {L(
            "Un exemplaire de chaque carte est mis en réserve pendant son enchère. Jamais un favori, une carte shiny en dernier.",
            "One copy of each card is held in reserve during its auction. Never a favorite; a shiny copy only as a last resort.",
          )}
        </p>
        <AuctionFields amount={amount} setAmount={setAmount} minutes={minutes} setMinutes={setMinutes} label={L("Mise de départ de chaque carte (₩)", "Starting bid per card (₩)")} disabled={Boolean(progress || ended)} />
        {quota && (
          <p class="small muted">
            {quota.sellingCount} / {quota.maxConcurrentAuctions} {L("ventes en cours.", "active sales.")}
          </p>
        )}
        {quota && count < items.length && (
          <Notice type="warn">
            {count
              ? L(
                  `Le site n'autorise plus que ${plural(count, "vente simultanée", "ventes simultanées")} : seules les ${fmt(count)} premières cartes seront mises en vente.`,
                  `The site only allows ${plural(count, "more simultaneous sale", "more simultaneous sales")}: only the first ${fmt(count)} cards will be listed.`,
                )
              : L("Vous avez atteint le nombre de ventes simultanées autorisé par le site.", "You have reached the number of simultaneous sales the site allows.")}
          </Notice>
        )}
        {progress && <Progress done={progress.done} total={progress.total} label={L("Mise en vente", "Listing")} />}
        {error && <Notice type="error">{error}</Notice>}
        <div class="actions">
          <button class="btn ghost" onClick={dismiss}>
            {progress ? L("Arrêter", "Stop") : ended ? L("Fermer", "Close") : L("Annuler", "Cancel")}
          </button>
          {!ended && (
            <button class="btn primary" disabled={Boolean(progress) || !count} onClick={submit}>
              {progress ? L("Mise en vente…", "Listing…") : L(`Lancer ${plural(count, "enchère", "enchères")}`, `Start ${plural(count, "auction")}`)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function SellDialogHost() {
  const {current} = useStore(sellDialog);
  if (!current) return null;
  return current.items ? <SellManyForm {...current} /> : <SellForm key={current.card.id} {...current} />;
}
