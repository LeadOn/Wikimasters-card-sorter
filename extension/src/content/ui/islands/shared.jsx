// Éléments communs aux blocs intégrés aux pages : prix moyen d'une carte, thème et amis intéressés.
import {useEffect} from "preact/hooks";
import {useStore} from "../../lib/store";
import {readSession} from "../../lib/session";
import {priceOf, priceStatus, summaryOf, requestPrice, priceVersion} from "../../state/prices";
import {profiles, activeProfiles} from "../../state/profiles";
import {Icon, Money, ThemeChip, plural} from "../components";
import {categorize, FRIEND_PREFIX, RARITY_LABEL} from "../../../../../core";

// Prix moyen pour la rareté, demandé dès l'affichage s'il n'est pas en cache (instantané sinon)
export function PriceLine({cardId, rarity}) {
  useStore(priceVersion);
  useEffect(() => {
    if (cardId) requestPrice(cardId, {rarity});
  }, [cardId, rarity]);
  const label = `Prix moyen${RARITY_LABEL[rarity] ? ` ${RARITY_LABEL[rarity]}` : ""}`;
  if (!cardId)
    return (
      <div class="kv">
        <span class="k">{label}</span>
        <span class="spinner" aria-label="Recherche de la carte" />
      </div>
    );
  const status = priceStatus(cardId, rarity);
  const s = summaryOf(cardId)?.[rarity];
  return (
    <div class="kv">
      <span class="k">{label}</span>
      {status === "ok" ? (
        <>
          <Money v={priceOf(cardId, rarity)} class="price-big" />
          <span class="muted small">
            {plural(s.count, "vente")}
            {s.latest != null && (
              <>
                {" · dernière "}
                <Money v={s.latest} />
              </>
            )}
          </span>
        </>
      ) : status === "unknown" ? (
        <span class="spinner" aria-label="Chargement du prix" />
      ) : status === "error" ? (
        <span class="muted small">serveur indisponible, nouvel essai dans quelques minutes</span>
      ) : (
        <span class="muted small">jamais vendue dans cette rareté</span>
      )}
    </div>
  );
}

// Thème calculé par le moteur et profils d'intérêts concernés (« Pour : … »)
export function Interest({card}) {
  useStore(profiles);
  const me = readSession()?.username;
  const tags = categorize(
    {wikipedia_title: card.title, category: card.category || "", summary: card.summary || "", image_url: card.image_url},
    {profiles: activeProfiles()},
  );
  const fans = tags.slice(1).map((t) => t.slice(FRIEND_PREFIX.length));
  return (
    <>
      <div class="kv">
        <span class="k">Thème</span>
        <ThemeChip theme={tags[0]} />
      </div>
      {fans.length > 0 && (
        <div class="kv">
          <span class="k">Intéresse</span>
          <div class="chips">
            {fans.map((name) => (
              <span key={name} class={`chip ${name === me ? "me" : ""}`}>
                {name === me ? (
                  <>
                    <Icon name="star" size={12} /> Vous
                  </>
                ) : (
                  name
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
