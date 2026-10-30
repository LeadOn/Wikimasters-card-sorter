// Confirmation d'une défausse, d'une carte ou de plusieurs : ce que le joueur perd, et ce que les
// exemplaires rapporteraient sans doute aux enchères.
import {priceOf} from "../state/prices";
import {fmt, plural} from "./components";
import {confirmAction} from "./feedback";
import {L} from "../../shared/i18n";

const copiesNote = (only) =>
  only === true ? L("C'est votre seul exemplaire.", "This is your only copy.") : only === false ? L("Il vous en reste au moins un autre exemplaire.", "You still have at least one other copy.") : "";

// Défausse de plusieurs exemplaires, un par carte. items : [{card, rarity, shiny, only}], only : c'est
// le seul exemplaire de la carte (true / false, null si on ne sait pas). → Promise<boolean>
export function confirmDiscardMany(items) {
  if (items.length === 1) {
    const [it] = items;
    return confirmDiscard({card: it.card, rarity: it.rarity, shiny: it.shiny, copies: copiesNote(it.only)});
  }
  const n = items.length;
  const only = items.filter((it) => it.only === true).length;
  const shiny = items.filter((it) => it.shiny).map((it) => L(`« ${it.card.wikipedia_title} »`, `"${it.card.wikipedia_title}"`));
  const price = (it) => priceOf(it.card.id, it.rarity, {shiny: it.shiny});
  const valued = items.filter((it) => price(it) > 1);
  const worth = valued.reduce((sum, it) => sum + price(it), 0);
  return confirmAction({
    title: L(`Défausser ${fmt(n)} cartes ?`, `Discard ${fmt(n)} cards?`),
    body: [
      L("Un exemplaire de chacune quitte votre collection contre 1 WikiBidou. C'est définitif.", "One copy of each leaves your collection for 1 WikiBidou. This cannot be undone."),
      only === n
        ? L("Ce sont vos seuls exemplaires.", "These are your only copies.")
        : only === 1
          ? L("L'une d'elles est votre seul exemplaire.", "One of them is your only copy.")
          : only > 1
            ? L(`${fmt(only)} d'entre elles sont vos seuls exemplaires.`, `${fmt(only)} of them are your only copies.`)
            : "",
      shiny.length === 1
        ? L(`Attention : ${shiny[0]} est une carte shiny.`, `Careful: ${shiny[0]} is a shiny card.`)
        : shiny.length > 1
          ? L(
              `Attention : ${plural(shiny.length, "carte shiny", "cartes shiny")} (${shiny.slice(0, 5).join(", ")}${shiny.length > 5 ? "…" : ""}).`,
              `Careful: ${fmt(shiny.length)} shiny cards (${shiny.slice(0, 5).join(", ")}${shiny.length > 5 ? "…" : ""}).`,
            )
          : "",
      valued.length === 1
        ? L(
            `« ${valued[0].card.wikipedia_title} » se vend d'habitude ${fmt(worth)} ₩ dans sa rareté : la mettre aux enchères rapporterait sans doute plus.`,
            `"${valued[0].card.wikipedia_title}" usually sells for ${fmt(worth)} ₩ in its rarity: auctioning it would probably earn more.`,
          )
        : valued.length > 1
          ? L(
              `${fmt(valued.length)} d'entre elles se vendent d'habitude ${fmt(worth)} ₩ au total : les mettre aux enchères rapporterait sans doute plus.`,
              `${fmt(valued.length)} of them usually sell for ${fmt(worth)} ₩ in total: auctioning them would probably earn more.`,
            )
          : "",
    ]
      .filter(Boolean)
      .join(" "),
    confirm: L(`Défausser (+${fmt(n)} ₩)`, `Discard (+${fmt(n)} ₩)`),
    danger: true,
  });
}

// card : la carte ({id, wikipedia_title}) ; rarity, shiny : ceux de l'exemplaire défaussé ;
// copies : phrase sur les exemplaires qui restent (omise si on ne sait pas). → Promise<boolean>
export function confirmDiscard({card, rarity, shiny, copies}) {
  const price = priceOf(card.id, rarity, {shiny});
  return confirmAction({
    title: L(`Défausser « ${card.wikipedia_title} » ?`, `Discard "${card.wikipedia_title}"?`),
    body: [
      L("L'exemplaire quitte votre collection contre 1 WikiBidou. C'est définitif.", "This copy leaves your collection for 1 WikiBidou. This cannot be undone."),
      copies,
      shiny ? L("Attention : c'est une carte shiny.", "Careful: this is a shiny card.") : "",
      price > 1
        ? L(
            `Elle se vend d'habitude ${fmt(price)} ₩ dans cette rareté : la mettre aux enchères rapporterait sans doute plus.`,
            `It usually sells for ${fmt(price)} ₩ in this rarity: auctioning it would probably earn more.`,
          )
        : "",
    ]
      .filter(Boolean)
      .join(" "),
    confirm: L("Défausser (+1 ₩)", "Discard (+1 ₩)"),
    danger: true,
  });
}
