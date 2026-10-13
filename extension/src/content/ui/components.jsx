// Composants d'interface réutilisables.
import {useState, useEffect} from "preact/hooks";
import {RARITY_LABEL, THEME_COLORS} from "../../../../core";
import {settings} from "../state/settings";
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

// Montant en WikiBidous : chiffres alignés, symbole en retrait
export const Money = ({v, class: cls = ""}) => (
  <span class={`money${cls ? ` ${cls}` : ""}`}>
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
    <span class="chip theme" style={{"--c": color}}>
      {theme}
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

// Badge d'une carte : {label, type: "ok" | "warn" | "danger" | "accent", icon}
export const Badge = ({label, type, icon}) => (
  <span class={`chip ${type || ""}`}>
    {icon && <Icon name={icon} size={12} />}
    {label}
  </span>
);

// Mini-carte : image, titre, description, rareté, thème, prix, badges
export function CardRow({card, rarity, theme, price, badges = [], selected, onClick, action}) {
  const r = rarity || card?.rarity;
  const href = card?.wikipedia_url || (card?.wikipedia_title ? `https://fr.wikipedia.org/wiki/${encodeURIComponent(card.wikipedia_title.replace(/ /g, "_"))}` : null);
  return (
    <div class={`card${selected ? " sel" : ""}`} style={{"--rc": `var(--r-${r || "C"})`, cursor: onClick ? "pointer" : "default"}} onClick={onClick}>
      {card?.image_url ? <img class="thumb" src={card.image_url} alt="" loading="lazy" referrerpolicy="no-referrer" /> : <div class="thumb" />}
      <div class="body">
        <div class="t" title={card?.wikipedia_title}>
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer" style={{color: "inherit", textDecoration: "none"}} onClick={(e) => e.stopPropagation()}>
              {card?.wikipedia_title || card?.title}
            </a>
          ) : (
            card?.wikipedia_title || card?.title
          )}
        </div>
        {card?.category && <div class="d" title={card.category}>{card.category}</div>}
        <div class="meta">
          <Rarity r={r} />
          {theme && <ThemeChip theme={theme} />}
          {badges.filter(Boolean).map((b) => (
            <Badge key={b.label} {...b} />
          ))}
          {price != null && <Money v={price} class="price" />}
        </div>
      </div>
      {action && <div class="act" onClick={(e) => e.stopPropagation()}>{action}</div>}
    </div>
  );
}

// Liste paginée côté client (évite de rendre des milliers de cartes d'un coup)
export function Paged({items, pageSize = 60, render, empty = "Aucune carte."}) {
  const [shown, setShown] = useState(pageSize);
  useEffect(() => setShown(pageSize), [items, pageSize]);
  if (!items.length) return <div class="empty">{empty}</div>;
  return (
    <div class="stack">
      <div class="cards">{items.slice(0, shown).map(render)}</div>
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
