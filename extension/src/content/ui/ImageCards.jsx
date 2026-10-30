// Filtre par image (sans image, GIF) et liste des cartes correspondantes : onglet « Images » du
// panneau (sur la page Collection, ces vues sont celles de ui/CollectionCards.jsx).
import {IMAGE_FILTERS} from "../features/card-images";
import {CardTile, Paged, fmt} from "./components";
import {L} from "../../shared/i18n";

// Choix du filtre, avec le nombre de cartes de chaque groupe une fois la collection lue
export function ImageFilterSeg({value, onChange, groups}) {
  return (
    <div class="seg" role="group" aria-label={L("Filtrer par image", "Filter by image")}>
      {IMAGE_FILTERS.map((o) => (
        <button key={o.id} class={value === o.id ? "on" : ""} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
          {groups ? ` · ${fmt(groups[o.id].length)}` : ""}
        </button>
      ))}
    </div>
  );
}

const EMPTY = {
  none: L("Toutes vos cartes ont une image.", "All your cards have an image."),
  gif: L("Aucune carte de votre collection n'a d'image GIF.", "No card in your collection has a GIF image."),
};

export function ImageCards({items, filter, empty}) {
  return (
    <Paged
      items={items}
      empty={empty || EMPTY[filter]}
      class="tiles"
      render={(c) => (
        <CardTile
          key={`${c.card_id}|${c.rarity}`}
          card={c.card}
          rarity={c.rarity}
          badges={[c.card.hide_image && {label: L("masquée par le site", "hidden by the site"), type: "warn"}, c.count > 1 && {label: `×${c.count}`, type: "ok"}]}
        />
      )}
    />
  );
}
