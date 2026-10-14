// Confirmation d'une défausse, d'une carte ou de plusieurs : ce que le joueur perd, et ce que les
// exemplaires rapporteraient sans doute aux enchères.
import {priceOf} from "../state/prices";
import {fmt, plural} from "./components";
import {confirmAction} from "./feedback";

const copiesNote = (only) => (only === true ? "C'est votre seul exemplaire." : only === false ? "Il vous en reste au moins un autre exemplaire." : "");

// Défausse de plusieurs exemplaires, un par carte. items : [{card, rarity, shiny, only}], only : c'est
// le seul exemplaire de la carte (true / false, null si on ne sait pas). → Promise<boolean>
export function confirmDiscardMany(items) {
  if (items.length === 1) {
    const [it] = items;
    return confirmDiscard({card: it.card, rarity: it.rarity, shiny: it.shiny, copies: copiesNote(it.only)});
  }
  const n = items.length;
  const only = items.filter((it) => it.only === true).length;
  const shiny = items.filter((it) => it.shiny).map((it) => `« ${it.card.wikipedia_title} »`);
  const price = (it) => priceOf(it.card.id, it.rarity, {shiny: it.shiny});
  const valued = items.filter((it) => price(it) > 1);
  const worth = valued.reduce((sum, it) => sum + price(it), 0);
  return confirmAction({
    title: `Défausser ${fmt(n)} cartes ?`,
    body: [
      "Un exemplaire de chacune quitte votre collection contre 1 WikiBidou. C'est définitif.",
      only === n ? "Ce sont vos seuls exemplaires." : only === 1 ? "L'une d'elles est votre seul exemplaire." : only > 1 ? `${fmt(only)} d'entre elles sont vos seuls exemplaires.` : "",
      shiny.length === 1 ? `Attention : ${shiny[0]} est une carte shiny.` : shiny.length > 1 ? `Attention : ${plural(shiny.length, "carte shiny", "cartes shiny")} (${shiny.slice(0, 5).join(", ")}${shiny.length > 5 ? "…" : ""}).` : "",
      valued.length === 1
        ? `« ${valued[0].card.wikipedia_title} » se vend d'habitude ${fmt(worth)} ₩ dans sa rareté : la mettre aux enchères rapporterait sans doute plus.`
        : valued.length > 1
          ? `${fmt(valued.length)} d'entre elles se vendent d'habitude ${fmt(worth)} ₩ au total : les mettre aux enchères rapporterait sans doute plus.`
          : "",
    ]
      .filter(Boolean)
      .join(" "),
    confirm: `Défausser (+${fmt(n)} ₩)`,
    danger: true,
  });
}

// card : la carte ({id, wikipedia_title}) ; rarity, shiny : ceux de l'exemplaire défaussé ;
// copies : phrase sur les exemplaires qui restent (omise si on ne sait pas). → Promise<boolean>
export function confirmDiscard({card, rarity, shiny, copies}) {
  const price = priceOf(card.id, rarity, {shiny});
  return confirmAction({
    title: `Défausser « ${card.wikipedia_title} » ?`,
    body: [
      "L'exemplaire quitte votre collection contre 1 WikiBidou. C'est définitif.",
      copies,
      shiny ? "Attention : c'est une carte shiny." : "",
      price > 1 ? `Elle se vend d'habitude ${fmt(price)} ₩ dans cette rareté : la mettre aux enchères rapporterait sans doute plus.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    confirm: "Défausser (+1 ₩)",
    danger: true,
  });
}
