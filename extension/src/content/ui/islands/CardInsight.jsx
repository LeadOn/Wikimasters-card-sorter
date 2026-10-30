// Bloc de la Toolbox dans la fenêtre d'une carte (collection, profils, toutes les cartes) :
// prix du marché instantané, thème, amis intéressés, possession et familles.
import {useStore} from "../../lib/store";
import {owned} from "../../state/collection";
import {families, addCard} from "../../features/families";
import {emit} from "../../lib/bus";
import {toast} from "../feedback";
import {PriceLine, Interest} from "./shared";
import {Icon, Mark} from "../components";
import {L} from "../../../shared/i18n";

// card : {id, title, rarity, shiny, category, summary, image_url, owned}
export function CardInsight({card}) {
  const {list} = useStore(families);
  const {ids, loadedAt} = useStore(owned);
  if (!card) return null;
  const isOwned = card.owned ?? (card.id && loadedAt ? ids.has(card.id) : null);
  const inFamilies = card.id ? list.filter((f) => f.cards.some((c) => c.id === card.id)) : [];
  const addable = card.id ? list.filter((f) => f.kind === "manual" && !inFamilies.includes(f)) : [];
  const add = (familyId) => {
    const family = list.find((f) => f.id === familyId);
    if (!family) return;
    addCard(family.id, {id: card.id, wikipedia_title: card.title, rarity: card.rarity, category: card.category, image_url: card.image_url, hide_image: card.hide_image});
    toast(L(`« ${card.title} » ajoutée à la famille « ${family.name} ».`, `"${card.title}" added to the "${family.name}" family.`), {type: "ok"});
  };
  return (
    <section class="island compact stacked" aria-label="WikiMasters Toolbox">
      <div class="island-head">
        <Mark size={20} />
        <span class="island-title">Toolbox</span>
        {isOwned === true && !card.onMyCollection && (
          <span class="chip ok">
            <Icon name="check" size={12} /> {L("Dans votre collection", "In your collection")}
          </span>
        )}
        {isOwned === false && <span class="chip warn">{L("Pas dans votre collection", "Not in your collection")}</span>}
      </div>
      <PriceLine cardId={card.id} rarity={card.rarity} shiny={card.shiny} />
      <Interest card={card} />
      {card.id && (
        <div class="kv">
          <span class="k">{L("Familles", "Families")}</span>
          {inFamilies.length > 0 && (
            <div class="chips">
              {inFamilies.map((f) => (
                <span key={f.id} class="chip accent">
                  {f.name}
                </span>
              ))}
            </div>
          )}
          {addable.length > 0 ? (
            <select
              class="mini-select"
              value=""
              onChange={(e) => {
                add(e.currentTarget.value);
                e.currentTarget.value = "";
              }}
            >
              <option value="">{L("+ Ajouter à une famille…", "+ Add to a family…")}</option>
              {addable.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          ) : (
            !inFamilies.length && (
              <button class="btn sm ghost" onClick={() => emit("open-panel", {tab: "families"})}>
                {L("Créer une famille", "Create a family")}
              </button>
            )
          )}
        </div>
      )}
    </section>
  );
}
