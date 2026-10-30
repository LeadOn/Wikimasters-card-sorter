// Racine de l'interface : panneau Toolbox, dialogues (confirmation, mise aux enchères), notifications,
// encart de valeur des échanges et confirmation de « Tout ouvrir ».
import {useState, useEffect} from "preact/hooks";
import {useStore, createStore} from "../lib/store";
import {on} from "../lib/bus";
import {readSession} from "../lib/session";
import {isOn, settings} from "../state/settings";
import {priceOf, priceVersion, loadPrices} from "../state/prices";
import {openAllPacks, openAllState, packsStatus} from "../features/packs";
import {activeTrades} from "../features/trades";
import {planSort, sortState} from "../features/sorter";
import {toasts, dismissToast, dialog, closeDialog, toast, confirmAction, errorMessage} from "./feedback";
import {Icon, Mark, fmt, plural} from "./components";
import {SortTab} from "./tabs/SortTab";
import {ProfilesTab} from "./tabs/ProfilesTab";
import {TradesTab} from "./tabs/TradesTab";
import {PricesTab} from "./tabs/PricesTab";
import {MarketTab} from "./tabs/MarketTab";
import {PacksTab} from "./tabs/PacksTab";
import {FamiliesTab} from "./tabs/FamiliesTab";
import {ImagesTab} from "./tabs/ImagesTab";
import {AchievementsTab, claimedMessage} from "./tabs/AchievementsTab";
import {SettingsTab} from "./tabs/SettingsTab";
import {SellDialogHost} from "./SellDialog";

// L'icône de chaque onglet porte le même nom dans shared/brand.mjs
const TABS = [
  {id: "sort", label: "Tri", Comp: SortTab},
  {id: "profiles", label: "Profils", Comp: ProfilesTab},
  {id: "trades", label: "Échanges", Comp: TradesTab},
  {id: "prices", label: "Prix", Comp: PricesTab},
  {id: "market", label: "Marché", Comp: MarketTab},
  {id: "packs", label: "Paquets", Comp: PacksTab},
  {id: "families", label: "Familles", Comp: FamiliesTab},
  {id: "images", label: "Images", Comp: ImagesTab},
  {id: "achievements", label: "Succès", Comp: AchievementsTab},
  {id: "settings", label: "Réglages", Comp: SettingsTab},
];

export const panel = createStore({open: false, tab: "sort"});
export const openPanel = (tab) => panel.set((s) => ({open: true, tab: tab || s.tab}));

function Panel() {
  const {tab} = useStore(panel);
  const session = readSession();
  const Current = (TABS.find((t) => t.id === tab) || TABS[0]).Comp;
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !dialog.get().current && panel.set({open: false});
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div class="overlay" onClick={(e) => e.target === e.currentTarget && panel.set({open: false})}>
      <div class="panel" role="dialog" aria-label="WikiMasters Toolbox">
        <div class="panel-head">
          <Mark size={24} />
          <div>
            <div class="panel-title">WikiMasters Toolbox</div>
            <div class="panel-sub">{session ? `connecté · ${session.username || "joueur"}` : "non connecté"}</div>
          </div>
          <span class="spacer" />
          <button class="icon-btn" aria-label="Fermer" onClick={() => panel.set({open: false})}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <nav class="nav">
          {TABS.map((t) => (
            <button key={t.id} class={`${t.id === tab ? "on" : ""}${t.id === "settings" ? " push" : ""}`} aria-current={t.id === tab ? "page" : undefined} onClick={() => panel.set({tab: t.id})}>
              <Icon name={t.id} size={18} />
              <span class="label">{t.label}</span>
            </button>
          ))}
          <span class="nav-version">v{__VERSION__}</span>
        </nav>
        <main class="content">{session ? <Current /> : <div class="empty">Connectez-vous à WikiMasters pour utiliser la Toolbox.</div>}</main>
      </div>
    </div>
  );
}

function Dialog() {
  const {current} = useStore(dialog);
  if (!current) return null;
  return (
    <div class="modal-wrap" style={{zIndex: 2147483150}} onClick={(e) => e.target === e.currentTarget && closeDialog(false)}>
      <div class="modal" role="alertdialog">
        <h3>{current.title}</h3>
        {current.body && <p class="help" style={{fontSize: "14px"}}>{current.body}</p>}
        <div class="actions">
          <button class="btn ghost" onClick={() => closeDialog(false)}>Annuler</button>
          <button class={`btn ${current.danger ? "danger" : "primary"}`} autoFocus onClick={() => closeDialog(true)}>
            {current.confirm || "Confirmer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Toasts() {
  const {list} = useStore(toasts);
  return (
    <div class="toasts">
      {list.map((t) => (
        <div key={t.id} class={`toast ${t.type}`}>
          <Icon name={t.type === "ok" ? "check" : t.type === "error" ? "alert" : "info"} size={16} />
          <span style={{flex: 1}}>{t.message}</span>
          {t.action && (
            <button
              class="btn sm primary"
              onClick={() => {
                dismissToast(t.id);
                t.action.run();
              }}
            >
              {t.action.label}
            </button>
          )}
          <button class="btn sm ghost" aria-label="Fermer" onClick={() => dismissToast(t.id)}>
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// Encart flottant sur la page Échanges : valeur de chaque côté des échanges en attente
function TradeValuesWidget({path}) {
  const {list} = useStore(activeTrades);
  useStore(priceVersion);
  const [hidden, setHidden] = useState(false);
  const me = readSession()?.userId;
  const visible = path.startsWith("/trades") && isOn("tradeValues") && !hidden;
  const pending = (list || []).filter((t) => t.status === "pending");
  useEffect(() => {
    if (visible && pending.length) loadPrices(pending.flatMap((t) => (t.items || []).map((i) => ({id: i.card_id, rarity: i.snapshot_rarity || i.card?.rarity}))));
  }, [visible, list]);
  if (!visible) return null;
  if (!pending.length) return null;
  // Valeur d'un côté : null si aucune de ses cartes n'a de prix connu
  const sideValue = (t, uid) => {
    const items = (t.items || []).filter((i) => i.offered_by === uid);
    const prices = items.map((i) => priceOf(i.card_id, i.snapshot_rarity || i.card?.rarity, {shiny: i.is_shiny})).filter((p) => p != null);
    if (items.length && !prices.length) return null;
    return prices.reduce((n, p) => n + p, 0) + (uid === t.initiator_id ? t.initiator_wikibidous || 0 : t.recipient_wikibidous || 0);
  };
  return (
    <div class="widget">
      <div class="widget-head">
        <Mark size={18} />
        <span style={{flex: 1}}>Valeur des échanges</span>
        <button class="btn sm ghost" onClick={() => openPanel("trades")}>Détail</button>
        <button class="btn sm ghost" aria-label="Masquer" onClick={() => setHidden(true)}>
          <Icon name="close" size={14} />
        </button>
      </div>
      {pending.map((t) => {
        const other = t.initiator_id === me ? t.recipient : t.initiator;
        const give = sideValue(t, me);
        const get = sideValue(t, other?.id);
        return (
          <div key={t.id} class="row small" style={{justifyContent: "space-between"}}>
            <span>{other?.username}</span>
            <span class="muted">je donne {give == null ? "?" : fmt(give)} ₩ · je reçois {get == null ? "?" : fmt(get)} ₩</span>
            {give != null && get != null && <span class={`chip ${get - give >= 0 ? "ok" : "warn"}`}>{get - give >= 0 ? "+" : ""}{fmt(get - give)}</span>}
          </div>
        );
      })}
      <span class="small muted">Prix du marché fiables seulement (onglet Échanges pour les charger).</span>
    </div>
  );
}

export function App() {
  const {open} = useStore(panel);
  const [path, setPath] = useState(location.pathname);
  useStore(settings);
  useEffect(() => {
    const offs = [
      on("route", setPath),
      on("open-panel", ({tab} = {}) => openPanel(tab)),
      on("confirm-open-all", async () => {
        if (openAllState.get().running) return;
        const remaining = packsStatus.get().remaining;
        const ok = await confirmAction({
          title: "Ouvrir tous les paquets ?",
          body: `${remaining != null ? `${plural(remaining, "paquet disponible", "paquets disponibles")}. ` : ""}Ils seront ouverts d'un coup, sans animation. Cette action consomme vos paquets.`,
          confirm: "Tout ouvrir",
        });
        if (!ok) return;
        try {
          const r = await openAllPacks();
          if (openAllState.get().error) toast(openAllState.get().error, {type: "error", duration: 10000});
          else if (!r.packs) toast("Aucun paquet ouvert.");
        } catch (e) {
          toast(errorMessage(e), {type: "error"});
        }
      }),
      on("extension-stale", () =>
        toast("La Toolbox a été mise à jour : rechargez la page WikiMasters pour qu'elle continue d'enregistrer vos données.", {
          type: "error",
          duration: 0,
          action: {label: "Recharger", run: () => location.reload()},
        }),
      ),
      on("bid-alert", (a) =>
        toast(`Enchère bientôt terminée et vous êtes dépassé : ${a.card?.wikipedia_title}`, {
          type: "error",
          duration: 15000,
          action: {label: "Voir", run: () => openPanel("market")},
        }),
      ),
      on("achievements-claimed", (r) => toast(claimedMessage(r), {type: "ok", action: {label: "Voir", run: () => openPanel("achievements")}})),
      // Sans récapitulatif (désactivé), un message propose de trier les nouvelles cartes
      on("cards-added", ({count, recap, sorted}) => {
        if (recap || sorted || !isOn("sortAfterPack") || sortState.get().running) return;
        toast(`${plural(count, "nouvelle carte", "nouvelles cartes")} dans votre collection.`, {
          action: {label: "Trier", run: () => (openPanel("sort"), planSort({newOnly: true}).catch((e) => toast(errorMessage(e), {type: "error"})))},
        });
      }),
    ];
    return () => offs.forEach((off) => off());
  }, []);
  return (
    <>
      {open && <Panel />}
      <TradeValuesWidget path={path} />
      <SellDialogHost />
      <Dialog />
      <Toasts />
    </>
  );
}
