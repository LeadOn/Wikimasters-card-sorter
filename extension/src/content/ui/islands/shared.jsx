// Éléments communs aux blocs intégrés aux pages : prix du marché d'une carte, thème et amis intéressés.
import {useEffect} from "preact/hooks";
import {useStore} from "../../lib/store";
import {readSession} from "../../lib/session";
import {priceInfo, priceStatus, requestPrice, priceVersion, uncertainNote} from "../../state/prices";
import {profiles, activeProfiles} from "../../state/profiles";
import {Icon, Money, ThemeChip, plural} from "../components";
import {categorize, FRIEND_PREFIX, RARITY_LABEL, RECENT_SALES} from "../../../../../core";

// Ventes connues, premières ventes ignorées, dernière vente et moyenne affichée par le site
function SalesNote({info, shiny}) {
  const ignored = info.total - info.sales;
  return (
    <span class="muted small">
      {plural(info.total, shiny ? "vente shiny" : "vente", shiny ? "ventes shiny" : "ventes")}
      {ignored > 0 && ` dont ${plural(ignored, "première ignorée", "premières ignorées")}`}
      {info.latest != null && (
        <>
          {" · dernière "}
          <Money v={info.latest} />
        </>
      )}
      {!shiny && info.average != null && info.average !== info.price && (
        <>
          {" · moyenne du site "}
          <Money v={info.average} />
        </>
      )}
    </span>
  );
}

// Prix du marché pour la rareté (shiny : celui des exemplaires shiny), demandé dès l'affichage s'il
// n'est pas en cache (instantané sinon)
export function PriceLine({cardId, rarity, shiny = false}) {
  useStore(priceVersion);
  useEffect(() => {
    if (cardId) requestPrice(cardId, {rarity});
  }, [cardId, rarity]);
  const label = `Prix du marché${RARITY_LABEL[rarity] ? ` ${RARITY_LABEL[rarity]}` : ""}${shiny ? " shiny" : ""}`;
  if (!cardId)
    return (
      <div class="kv">
        <span class="k">{label}</span>
        <span class="spinner" aria-label="Recherche de la carte" />
      </div>
    );
  const status = priceStatus(cardId, rarity, {shiny});
  const info = priceInfo(cardId, rarity, {shiny});
  return (
    <div class="kv">
      <span class="k">{label}</span>
      {status === "ok" ? (
        <>
          <span title={`Médiane des ${RECENT_SALES} dernières ventes prises en compte${shiny ? "" : ", hors shiny"}`}>
            <Money v={info.price} class="price-big" />
          </span>
          <SalesNote info={info} shiny={shiny} />
        </>
      ) : status === "few" ? (
        <>
          {info.price != null && <Money v={info.price} class="price-big" approx title={uncertainNote(info)} />}
          <span class="chip warn" title={info.price != null ? uncertainNote(info) : "Les toutes premières ventes d'une carte sont ignorées (réglable dans les réglages de la Toolbox)."}>
            {info.price != null ? "indicatif" : "pas encore de prix"}
          </span>
          <SalesNote info={info} shiny={shiny} />
        </>
      ) : status === "unknown" ? (
        <span class="spinner" aria-label="Chargement du prix" />
      ) : status === "error" ? (
        <span class="muted small">serveur indisponible, nouvel essai dans quelques minutes</span>
      ) : (
        <span class="muted small">{shiny ? "jamais vendue en shiny dans cette rareté" : "jamais vendue dans cette rareté"}</span>
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
