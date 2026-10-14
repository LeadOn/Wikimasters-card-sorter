// Composants d'interface réutilisables.
import {useState, useEffect} from "preact/hooks";
import {RARITY_LABEL, THEME_COLORS} from "../../../../core";
import {settings, isOn} from "../state/settings";
import {wikiImage, knownWikiImage} from "../features/wiki-images";
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

// Mini-carte : image, titre, description, rareté, thème, prix, badges.
// selected (avec onClick) : carte à cocher d'un clic, ou par Espace / Entrée au clavier ; onTitle : clic
// sur le titre (ouvre la carte ailleurs) ; wiki : sinon, titre lié à l'article Wikipédia
// price : prix du marché ; uncertain : explication quand ce prix n'est qu'indicatif (state/prices.js → pricing)
export function CardRow({card, rarity, theme, price, uncertain, badges = [], selected, onClick, onTitle, action, wiki = true}) {
  const r = rarity || card?.rarity;
  const fallback = useWikiImage(card);
  const image = card?.image_url || fallback;
  const name = card?.wikipedia_title || card?.title;
  const href = wiki && !onTitle ? card?.wikipedia_url || (card?.wikipedia_title ? `https://fr.wikipedia.org/wiki/${encodeURIComponent(card.wikipedia_title.replace(/ /g, "_"))}` : null) : null;
  const pickable = selected !== undefined && Boolean(onClick);
  const keys = (e) => {
    if (e.target !== e.currentTarget || (e.key !== " " && e.key !== "Enter")) return;
    e.preventDefault();
    onClick();
  };
  return (
    <div
      class={`card${selected ? " sel" : ""}`}
      style={{"--rc": `var(--r-${r || "C"})`, cursor: onClick ? "pointer" : "default"}}
      onClick={onClick}
      {...(pickable && {role: "checkbox", "aria-checked": Boolean(selected), "aria-label": name, tabIndex: 0, onKeyDown: keys})}
    >
      {selected && (
        <span class="picked" aria-hidden="true">
          <Icon name="check" size={12} />
        </span>
      )}
      {image ? (
        <img class="thumb" src={image} alt="" loading="lazy" referrerpolicy="no-referrer" />
      ) : (
        // Sans image (ou en attendant celle de Wikimedia) : l'initiale du titre, comme sur les cartes du site
        <div class={`thumb initial${fallback === undefined ? " searching" : ""}`} aria-hidden="true">
          {((card?.wikipedia_title || card?.title || "").match(/[\p{L}\p{N}]/u)?.[0] || "W").toUpperCase()}
        </div>
      )}
      <div class="body">
        {/* Le titre s'arrête avant les boutons d'action, en haut à droite */}
        <div class="head">
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
          {action && <div class="act" onClick={(e) => e.stopPropagation()}>{action}</div>}
        </div>
        {card?.category && <div class="d" title={card.category}>{card.category}</div>}
        <div class="meta">
          <Rarity r={r} />
          {theme && <ThemeChip theme={theme} />}
          {badges.filter(Boolean).map((b) => (
            <Badge key={b.label} {...b} />
          ))}
          {price != null && <Money v={price} class="price" approx={Boolean(uncertain)} title={uncertain || undefined} />}
        </div>
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
