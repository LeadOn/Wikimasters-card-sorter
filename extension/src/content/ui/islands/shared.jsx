// Éléments communs aux blocs intégrés aux pages : prix du marché d'une carte, thème et amis intéressés.
import {useEffect} from "preact/hooks";
import {useStore} from "../../lib/store";
import {readSession} from "../../lib/session";
import {priceInfo, priceStatus, requestPrice, priceVersion, uncertainNote} from "../../state/prices";
import {profiles, activeProfiles} from "../../state/profiles";
import {Icon, Money, ThemeChip, plural} from "../components";
import {FRIEND_PREFIX, RARITY_LABEL, RECENT_SALES} from "../../../../../core";
import {classify} from "../../state/themes";
import {L} from "../../../shared/i18n";

// Ventes connues, premières ventes ignorées, dernière vente et moyenne affichée par le site
function SalesNote({info, shiny}) {
  const ignored = info.total - info.sales;
  return (
    <span class="muted small">
      {L(plural(info.total, shiny ? "vente shiny" : "vente", shiny ? "ventes shiny" : "ventes"), plural(info.total, shiny ? "shiny sale" : "sale", shiny ? "shiny sales" : "sales"))}
      {ignored > 0 && L(` dont ${plural(ignored, "première ignorée", "premières ignorées")}`, `, ${plural(ignored, "first one", "first ones")} ignored`)}
      {info.latest != null && (
        <>
          {L(" · dernière ", " · last ")}
          <Money v={info.latest} />
        </>
      )}
      {!shiny && info.average != null && info.average !== info.price && (
        <>
          {L(" · moyenne du site ", " · site average ")}
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
  const label = L(
    `Prix du marché${RARITY_LABEL[rarity] ? ` ${RARITY_LABEL[rarity]}` : ""}${shiny ? " shiny" : ""}`,
    `${RARITY_LABEL[rarity] ? `${RARITY_LABEL[rarity]} ` : ""}${shiny ? "shiny " : ""}market price`,
  );
  if (!cardId)
    return (
      <div class="kv">
        <span class="k">{label}</span>
        <span class="spinner" aria-label={L("Recherche de la carte", "Looking up the card")} />
      </div>
    );
  const status = priceStatus(cardId, rarity, {shiny});
  const info = priceInfo(cardId, rarity, {shiny});
  return (
    <div class="kv">
      <span class="k">{label}</span>
      {status === "ok" ? (
        <>
          <span title={L(`Médiane des ${RECENT_SALES} dernières ventes prises en compte${shiny ? "" : ", hors shiny"}`, `Median of the last ${RECENT_SALES} counted sales${shiny ? "" : ", excluding shiny"}`)}>
            <Money v={info.price} class="price-big" />
          </span>
          <SalesNote info={info} shiny={shiny} />
        </>
      ) : status === "few" ? (
        <>
          {info.price != null && <Money v={info.price} class="price-big" approx title={uncertainNote(info)} />}
          <span class="chip warn" title={info.price != null ? uncertainNote(info) : L("Les toutes premières ventes d'une carte sont ignorées (réglable dans les réglages de la Toolbox).", "A card's very first sales are ignored (adjustable in the Toolbox settings).")}>
            {info.price != null ? L("indicatif", "tentative") : L("pas encore de prix", "no price yet")}
          </span>
          <SalesNote info={info} shiny={shiny} />
        </>
      ) : status === "unknown" ? (
        <span class="spinner" aria-label={L("Chargement du prix", "Loading price")} />
      ) : status === "error" ? (
        <span class="muted small">{L("serveur indisponible, nouvel essai dans quelques minutes", "server unavailable, retrying in a few minutes")}</span>
      ) : (
        <span class="muted small">{shiny ? L("jamais vendue en shiny dans cette rareté", "never sold as shiny in this rarity") : L("jamais vendue dans cette rareté", "never sold in this rarity")}</span>
      )}
    </div>
  );
}

// Thème calculé par le moteur et profils d'intérêts concernés (« Pour : … »)
export function Interest({card}) {
  useStore(profiles);
  const me = readSession()?.username;
  const tags = classify(
    {wikipedia_title: card.title, category: card.category || "", summary: card.summary || "", image_url: card.image_url},
    {profiles: activeProfiles()},
  );
  const fans = tags.slice(1).map((t) => t.slice(FRIEND_PREFIX.length));
  return (
    <>
      <div class="kv">
        <span class="k">{L("Thème", "Theme")}</span>
        <ThemeChip theme={tags[0]} />
      </div>
      {fans.length > 0 && (
        <div class="kv">
          <span class="k">{L("Intéresse", "Wanted by")}</span>
          <div class="chips">
            {fans.map((name) => (
              <span key={name} class={`chip ${name === me ? "me" : ""}`}>
                {name === me ? (
                  <>
                    <Icon name="star" size={12} /> {L("Vous", "You")}
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
