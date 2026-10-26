// Bloc de la Toolbox dans la fenêtre « Échanger avec … » du site : valeur de chaque côté de la
// proposition (prix du marché des cartes choisies + WikiBidous) et différence, à chaque carte ajoutée.
// Lecture seule : rien n'est envoyé, l'offre reste celle que le joueur compose sur le site.
import {useEffect} from "preact/hooks";
import {useStore} from "../../lib/store";
import {priceOf, priceStatus, requestPrice, priceVersion} from "../../state/prices";
import {Gain, Mark, Money, fmt, plural, signOf} from "../components";
import {offerBalance} from "../../../../../core";

// Prix d'une carte choisie : prix fiable, null (indicatif, jamais vendue, carte introuvable) ou pas encore lu
function priced(c) {
  if (!c.id) return {price: null};
  if (priceStatus(c.id, c.rarity, {shiny: c.shiny}) === "unknown") return {loading: true};
  return {price: priceOf(c.id, c.rarity, {shiny: c.shiny})};
}

function Side({label, s}) {
  const parts = [plural(s.count, "carte"), s.wb > 0 && `${fmt(s.wb)} WB`].filter(Boolean);
  return (
    <div class="trade-recap-side">
      <span class="k">{label}</span>
      <span class="trade-recap-v">
        <Money v={s.total} approx={!s.exact} class="price-big" />
        {s.loading > 0 && <span class="spinner" aria-label="Lecture des prix" />}
      </span>
      <span class="small muted">{parts.join(" + ")}</span>
    </div>
  );
}

// give / get : {cards: [{title, id, rarity, shiny}], count, wb} ; friend : pseudo de l'ami
export function TradeRecap({friend, give, get}) {
  useStore(priceVersion);
  const cards = [...give.cards, ...get.cards].filter((c) => c.id);
  const wanted = cards.map((c) => `${c.id}|${c.rarity}`).join(",");
  useEffect(() => {
    for (const c of cards) requestPrice(c.id, {rarity: c.rarity});
  }, [wanted]);
  const b = offerBalance({...give, cards: give.cards.map(priced)}, {...get, cards: get.cards.map(priced)});
  const empty = !b.give.count && !b.get.count && !b.give.wb && !b.get.wb;
  const missing = b.give.missing + b.get.missing;
  const notes = [
    b.give.unseen > 0 && `Ouvrez « Mes cartes » pour estimer ${plural(b.give.unseen, "carte choisie", "cartes choisies")}`,
    b.get.unseen > 0 && `Ouvrez « Cartes de ${friend} » pour estimer ${plural(b.get.unseen, "carte choisie", "cartes choisies")}`,
    missing > 0 && `${plural(missing, "carte", "cartes")} sans prix du marché fiable, non ${missing > 1 ? "comptées" : "comptée"}`,
  ].filter(Boolean);
  return (
    <section class="island compact trade-recap" aria-label="Bilan de l'échange (WikiMasters Toolbox)">
      <div class="trade-recap-row">
        <span class="trade-recap-head">
          <Mark size={18} />
          <span class="island-title">Bilan</span>
        </span>
        <Side label="Je donne" s={b.give} />
        <Side label="Je reçois" s={b.get} />
        <div class="trade-recap-side trade-recap-diff">
          <span class="k">Différence</span>
          {empty ? (
            <span class="muted small">Ajoutez des cartes</span>
          ) : (
            <span class="trade-recap-v">
              <Gain v={b.diff} approx={!b.exact} class="price-big" title="Ce que je reçois moins ce que je donne, au prix du marché" />
              {b.pct != null && b.diff !== 0 && <span class="small muted">{signOf(b.pct)}{fmt(Math.abs(b.pct))} %</span>}
            </span>
          )}
        </div>
      </div>
      {!empty && notes.length > 0 && <p class="trade-recap-notes">{notes.join(" · ")}</p>}
    </section>
  );
}
