// Filtre par image (sans image, GIF) et liste des cartes correspondantes : onglet « Images » du
// panneau (sur la page Collection, ces vues sont celles de ui/CollectionCards.jsx).
import {IMAGE_FILTERS} from "../features/card-images";
import {CardTile, Paged, fmt} from "./components";

// Choix du filtre, avec le nombre de cartes de chaque groupe une fois la collection lue
export function ImageFilterSeg({value, onChange, groups}) {
  return (
    <div class="seg" role="group" aria-label="Filtrer par image">
      {IMAGE_FILTERS.map((o) => (
        <button key={o.id} class={value === o.id ? "on" : ""} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
          {groups ? ` · ${fmt(groups[o.id].length)}` : ""}
        </button>
      ))}
    </div>
  );
}

const EMPTY = {none: "Toutes vos cartes ont une image.", gif: "Aucune carte de votre collection n'a d'image GIF."};

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
          badges={[c.card.hide_image && {label: "masquée par le site", type: "warn"}, c.count > 1 && {label: `×${c.count}`, type: "ok"}]}
        />
      )}
    />
  );
}
