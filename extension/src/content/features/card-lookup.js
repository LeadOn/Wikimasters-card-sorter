// Carte affichée par le site mais absente des réponses observées (page servie depuis le cache du
// site, ouverte avant le chargement de l'extension) : retrouvée par son titre dans la table `cards`,
// une seule fois par titre, puis ajoutée au registre (les badges et les blocs se mettent à jour).
import {rest} from "../api/supabase";
import {remember} from "../lib/registry";

const lookups = new Map(); // titre → promesse de la carte (ou null)

export function resolveCard(title) {
  if (!title) return Promise.resolve(null);
  if (!lookups.has(title))
    lookups.set(
      title,
      rest(`cards?select=id,wikipedia_title,category,rarity,summary,image_url,wikipedia_url,hide_image&wikipedia_title=eq.${encodeURIComponent(title)}&limit=1`, {retries: 2})
        .then((rows) => {
          const card = Array.isArray(rows) ? rows[0] || null : null;
          if (card) remember(card);
          return card;
        })
        .catch(() => {
          // Échec passager : nouvel essai à la prochaine ouverture
          lookups.delete(title);
          return null;
        }),
    );
  return lookups.get(title);
}
