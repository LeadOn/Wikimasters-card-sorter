// Composants d'interface réutilisables.
import {useState, useEffect} from "preact/hooks";
import {RARITY_LABEL, THEME_COLORS} from "../../../../core";
import {settings, isOn} from "../state/settings";
import {wikiImage, knownWikiImage} from "../features/wiki-images";
import {siteLogo, rarityTexture} from "../features/site-assets";
import {Icon, Mark} from "../../shared/Brand";

export {Icon, Mark};

export const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("fr-FR"));
export const plural = (n, one, many = `${one}s`) => `${fmt(n)} ${n > 1 ? many : one}`;

export function timeAgo(date) {
  if (!date) return "jamais";
  const s = Math.round((Date.now() - new Date(date)) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
}

export function duration(ms) {
  if (ms <= 0) return "terminée";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")}`;
  return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
}

// Montant en WikiBidous : chiffres alignés, symbole en retrait. approx : prix indicatif (trop peu de
// ventes), précédé de « ≈ » et atténué ; title : son explication.
export const Money = ({v, class: cls = "", approx = false, title}) => (
  <span class={`money${approx ? " approx" : ""}${cls ? ` ${cls}` : ""}`} title={title}>
    {approx && "≈ "}
    {fmt(v)}
    <span class="cur">₩</span>
  </span>
);

export const signOf = (v) => (v > 0 ? "+" : v < 0 ? "−" : "");

// Montant signé : vert si gain, rouge si perte (le signe le dit aussi, pas seulement la couleur).
// approx : estimation (prix indicatifs ou manquants), précédée de « ≈ ».
export const Gain = ({v, class: cls = "", approx = false, title}) =>
  v == null ? (
    <span class="muted">—</span>
  ) : (
    <span class={`money delta${v > 0 ? " up" : v < 0 ? " down" : ""}${cls ? ` ${cls}` : ""}`} title={title}>
      {approx && "≈ "}
      {signOf(v)}
      {fmt(Math.abs(v))}
      <span class="cur">₩</span>
    </span>
  );

export function Progress({done, total, label}) {
  const pct = total ? Math.min(100, Math.round((100 * done) / total)) : null;
  return (
    <div class="stack" style={{gap: "7px"}}>
      {label && (
        <div class="progress-label">
          <span>{label}</span>
          {pct != null && <span class="n">{fmt(done)} / {fmt(total)}</span>}
          {pct == null && done ? <span class="n">{fmt(done)}</span> : null}
        </div>
      )}
      <div class={`progress${pct == null ? " indeterminate" : ""}`}>
        <div style={{width: `${pct ?? 35}%`}} />
      </div>
    </div>
  );
}

export const Rarity = ({r}) => (r ? <span class={`rarity ${r}`} title={RARITY_LABEL[r] || r}>{r}</span> : null);

export function ThemeChip({theme}) {
  if (!theme) return null;
  const color = settings.get().themeColors[theme] || THEME_COLORS[theme] || "#64748b";
  return (
    <span class="chip theme" style={{"--c": color}} title={theme}>
      <span class="lbl">{theme}</span>
    </span>
  );
}

const NOTICE_ICON = {ok: "check", warn: "alert", error: "alert", info: "info"};

export function Notice({type = "info", children}) {
  return (
    <div class={`notice ${type}`}>
      <Icon name={NOTICE_ICON[type] || "info"} size={15} />
      <div style={{flex: 1, minWidth: 0}}>{children}</div>
    </div>
  );
}

export function Toggle({checked, onChange, label}) {
  return (
    <span class="switch">
      <input type="checkbox" checked={checked} aria-label={label} onChange={(e) => onChange(e.currentTarget.checked)} />
      <span class="track" />
    </span>
  );
}

// Image de remplacement d'une carte sans image (réglage « Images manquantes »), cherchée sur Wikimedia ;
// jamais pour une image masquée par le site, ni quand on ne sait pas si elle l'a été.
// url, null (pas d'image), ou undefined pendant la recherche
export function useWikiImage(card) {
  const title = card?.wikipedia_title || card?.title;
  const wanted = Boolean(title) && !card?.image_url && card?.hide_image === false && isOn("missingImages");
  const [src, setSrc] = useState(() => (wanted ? knownWikiImage(title) : null));
  useEffect(() => {
    if (!wanted) return setSrc(null);
    setSrc(knownWikiImage(title));
    let alive = true;
    wikiImage(title, card?.category || "").then((url) => alive && setSrc(url));
    return () => (alive = false);
  }, [title, wanted]);
  return wanted ? src : null;
}

// Badge d'une carte : {label, type: "ok" | "warn" | "danger" | "accent", icon}
export const Badge = ({label, type, icon}) => (
  <span class={`chip ${type || ""}`} title={label}>
    {icon && <Icon name={icon} size={12} />}
    <span class="lbl">{label}</span>
  </span>
);

// Carte sans image, comme sur le site : son logo sur la texture de la rareté (si ces fichiers du site
// manquent, la couleur de la rareté). searching : image de Wikimedia en cours de recherche.
export const CardPlaceholder = ({rarity, searching, class: cls = ""}) => (
  <div class={`ph ${cls}${searching ? " searching" : ""}`} style={{"--tx": `url("${rarityTexture(rarity)}")`}} aria-hidden="true">
    <img src={siteLogo()} alt="" onError={(e) => (e.currentTarget.hidden = true)} />
  </div>
);

// Au-delà de ce rapport largeur / hauteur (logo, bandeau), l'image est montrée en entier
const WIDE = 1.8;

// Image d'une carte : la sienne, sinon celle de Wikimedia, sinon la carte sans image du site (aussi
// quand l'image ne se charge pas)
export function CardArt({card, rarity, class: cls = ""}) {
  const fallback = useWikiImage(card);
  const image = card?.image_url || fallback;
  const [loaded, setLoaded] = useState({}); // {src, wide, broken}
  const mine = loaded.src === image;
  if (!image || (mine && loaded.broken)) return <CardPlaceholder rarity={rarity} class={cls} searching={!image && fallback === undefined} />;
  return (
    <img
      class={`${cls}${mine && loaded.wide ? " wide" : ""}`}
      src={image}
      alt=""
      loading="lazy"
      referrerpolicy="no-referrer"
      onLoad={(e) => setLoaded({src: image, wide: e.currentTarget.naturalWidth / e.currentTarget.naturalHeight > WIDE})}
      onError={() => setLoaded({src: image, broken: true})}
    />
  );
}

// Titre d'une carte : onTitle (bouton, ouvre la carte ailleurs), sinon lien vers l'article Wikipédia (wiki)
function CardTitle({card, onTitle, wiki}) {
  const name = card?.wikipedia_title || card?.title;
  const href = wiki && !onTitle ? card?.wikipedia_url || (card?.wikipedia_title ? `https://fr.wikipedia.org/wiki/${encodeURIComponent(card.wikipedia_title.replace(/ /g, "_"))}` : null) : null;
  return (
    <div class="t" title={card?.wikipedia_title}>
      {onTitle ? (
        <button
          type="button"
          class="t-link"
          onClick={(e) => {
            e.stopPropagation();
            onTitle();
          }}
        >
          {name}
        </button>
      ) : href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" style={{color: "inherit", textDecoration: "none"}} onClick={(e) => e.stopPropagation()}>
          {name}
        </a>
      ) : (
        name
      )}
    </div>
  );
}

// Attributs communs aux cartes : couleur de rareté, clic, et carte à cocher (selected avec onClick)
// d'un clic, ou par Espace / Entrée au clavier
function cardProps({card, rarity, selected, onClick}) {
  const keys = (e) => {
    if (e.target !== e.currentTarget || (e.key !== " " && e.key !== "Enter")) return;
    e.preventDefault();
    onClick();
  };
  return {
    style: {"--rc": `var(--r-${rarity || "C"})`, cursor: onClick ? "pointer" : "default"},
    onClick,
    ...(selected !== undefined && onClick && {role: "checkbox", "aria-checked": Boolean(selected), "aria-label": card?.wikipedia_title || card?.title, tabIndex: 0, onKeyDown: keys}),
  };
}

const Picked = () => (
  <span class="picked" aria-hidden="true">
    <Icon name="check" size={12} />
  </span>
);

const Badges = ({badges}) =>
  badges.filter(Boolean).map((b) => <Badge key={b.label} {...b} />);

// Mini-carte : image, titre, description, rareté, thème, prix, badges.
// selected (avec onClick) : carte à cocher ; onTitle : clic sur le titre (ouvre la carte ailleurs) ;
// wiki : sinon, titre lié à l'article Wikipédia
// price : prix du marché ; uncertain : explication quand ce prix n'est qu'indicatif (state/prices.js → pricing)
export function CardRow({card, rarity, theme, price, uncertain, badges = [], selected, onClick, onTitle, action, wiki = true}) {
  const r = rarity || card?.rarity;
  return (
    <div class={`card${selected ? " sel" : ""}`} {...cardProps({card, rarity: r, selected, onClick})}>
      {selected && <Picked />}
      <CardArt card={card} rarity={r} class="thumb" />
      <div class="body">
        {/* Le titre s'arrête avant les boutons d'action, en haut à droite */}
        <div class="head">
          <CardTitle card={card} onTitle={onTitle} wiki={wiki} />
          {action && <div class="act" onClick={(e) => e.stopPropagation()}>{action}</div>}
        </div>
        {card?.category && <div class="d" title={card.category}>{card.category}</div>}
        <div class="meta">
          <Rarity r={r} />
          {theme && <ThemeChip theme={theme} />}
          <Badges badges={badges} />
          {price != null && <Money v={price} class="price" approx={Boolean(uncertain)} title={uncertain || undefined} />}
        </div>
      </div>
    </div>
  );
}

// Carte en grand, comme dans la grille du site : image en haut (rareté et coche par-dessus), titre,
// description, thème et badges, puis prix et actions en bas. Mêmes propriétés que CardRow ;
// à afficher dans une liste Paged de classe « tiles ».
export function CardTile({card, rarity, theme, price, uncertain, badges = [], selected, onClick, onTitle, action, wiki = true}) {
  const r = rarity || card?.rarity;
  const meta = theme || badges.some(Boolean);
  return (
    <div class={`card tile${selected ? " sel" : ""}`} {...cardProps({card, rarity: r, selected, onClick})}>
      <div class="tile-art">
        <CardArt card={card} rarity={r} class="art" />
        <Rarity r={r} />
        {selected && <Picked />}
      </div>
      <div class="body">
        <CardTitle card={card} onTitle={onTitle} wiki={wiki} />
        {card?.category && <div class="d" title={card.category}>{card.category}</div>}
        {meta && (
          <div class="meta">
            {theme && <ThemeChip theme={theme} />}
            <Badges badges={badges} />
          </div>
        )}
        {(price != null || action) && (
          <div class="foot">
            {price != null && <Money v={price} class="price" approx={Boolean(uncertain)} title={uncertain || undefined} />}
            {action && <div class="act" onClick={(e) => e.stopPropagation()}>{action}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// Liste paginée côté client (évite de rendre des milliers de cartes d'un coup)
export function Paged({items, pageSize = 60, render, empty = "Aucune carte.", class: cls = ""}) {
  const [shown, setShown] = useState(pageSize);
  useEffect(() => setShown(pageSize), [items, pageSize]);
  if (!items.length) return <div class="empty">{empty}</div>;
  return (
    <div class="stack">
      <div class={`cards${cls ? ` ${cls}` : ""}`}>{items.slice(0, shown).map(render)}</div>
      {shown < items.length && (
        <div class="row" style={{justifyContent: "center"}}>
          <button class="btn" onClick={() => setShown(shown + pageSize * 2)}>
            Afficher plus ({fmt(items.length - shown)} restantes)
          </button>
        </div>
      )}
    </div>
  );
}

export function Copyable({text}) {
  const [copied, setCopied] = useState(false);
  return (
    <div class="stack" style={{gap: "8px"}}>
      <textarea readOnly class="mono" value={text} rows={4} onFocus={(e) => e.currentTarget.select()} />
      <div class="row">
        <button
          class="btn primary sm"
          onClick={async (e) => {
            const button = e.currentTarget;
            try {
              await navigator.clipboard.writeText(text);
            } catch {
              // Presse-papiers refusé par le navigateur : copie via la sélection du texte
              const area = button.closest(".stack")?.querySelector("textarea");
              area?.select();
              if (!document.execCommand?.("copy")) return;
            }
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <><Icon name="check" size={14} /> Copié</> : "Copier"}
        </button>
        <span class="small muted">{fmt(text.length)} caractères</span>
      </div>
    </div>
  );
}
