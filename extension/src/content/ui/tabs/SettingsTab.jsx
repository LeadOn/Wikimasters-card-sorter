// Onglet « Réglages » : fonctionnalités, thèmes de tri, caches.
import {useStore} from "../../lib/store";
import {keysWithPrefix, remove} from "../../lib/storage";
import {settings, FEATURES, DEFAULT_SETTINGS} from "../../state/settings";
import {clearPrices} from "../../state/prices";
import {Toggle} from "../components";
import {confirmAction, toast} from "../feedback";
import {ThemeEditor} from "../ThemeEditor";
import {defaultThemeList, storeThemes} from "../../../../../core";
import {L} from "../../../shared/i18n";

// Nombre entier saisi, borné ; champ vide ou illisible : valeur par défaut
const count = (value, min, max, fallback) => {
  const n = Math.round(Number(value));
  return value === "" || !Number.isFinite(n) ? fallback : Math.min(max, Math.max(min, n));
};

export function SettingsTab() {
  const s = useStore(settings);
  const groups = [...new Set(FEATURES.map((f) => f.group))];
  const setFeature = (key, on) => settings.set((st) => ({...st, features: {...st.features, [key]: on}}));

  return (
    <div class="stack">
      <div class="page-head">
        <div>
          <h2>{L("Réglages", "Settings")}</h2>
          <p>{L("Activez seulement ce qui vous sert. Les réglages sont enregistrés dans votre navigateur.", "Turn on only what you need. Settings are stored in your browser.")}</p>
        </div>
      </div>
      <div class="grid-2">
        {groups.map((g) => (
          <div class="box" key={g}>
            <h3>{g}</h3>
            {FEATURES.filter((f) => f.group === g).map((f) => (
              <div class="setting" key={f.key}>
                <div class="txt">
                  <strong>{f.label}</strong>
                  <span>{f.help}</span>
                </div>
                <Toggle checked={s.features[f.key] !== false} label={f.label} onChange={(on) => setFeature(f.key, on)} />
              </div>
            ))}
          </div>
        ))}
        <div class="box stack">
          <h3>{L("Prix et délais", "Prices and timing")}</h3>
          <label class="field">
            <span>{L("Durée de validité d'un prix (heures)", "How long a price stays valid (hours)")}</span>
            <input type="number" min="1" max="720" value={s.priceMaxAgeHours} onChange={(e) => settings.set({priceMaxAgeHours: Math.max(1, Number(e.currentTarget.value) || 48)})} />
          </label>
          <label class="field">
            <span>{L("Ventes minimum pour un prix fiable", "Minimum sales for a reliable price")}</span>
            <input type="number" min="1" max="50" value={s.minSales} onChange={(e) => settings.set({minSales: count(e.currentTarget.value, 1, 50, DEFAULT_SETTINGS.minSales)})} />
          </label>
          <label class="field">
            <span>{L("Premières ventes ignorées, par carte et par rareté", "First sales ignored, per card and rarity")}</span>
            <input type="number" min="0" max="20" value={s.skipFirstSales} onChange={(e) => settings.set({skipFirstSales: count(e.currentTarget.value, 0, 20, DEFAULT_SETTINGS.skipFirstSales)})} />
          </label>
          <p class="help">
            {L(
              "Une carte vendue une ou deux fois n'a pas de prix représentatif, et ses toutes premières ventes se font souvent à un prix sans rapport avec le marché. En dessous du minimum, le prix est affiché « ≈ » à titre indicatif : il ne compte ni dans les totaux, ni dans les mises de départ proposées, ni dans les bonnes affaires.",
              'A card sold once or twice has no representative price, and its very first sales often go at a price unrelated to the market. Below the minimum, the price is shown with "≈" as a rough guide: it does not count in totals, suggested starting bids or deals.',
            )}
          </p>
          <label class="field">
            <span>{L("Alerte de fin d'enchère (minutes avant la fin)", "Auction ending alert (minutes before the end)")}</span>
            <input type="number" min="1" max="60" value={s.bidAlertMinutes} onChange={(e) => settings.set({bidAlertMinutes: Math.max(1, Number(e.currentTarget.value) || 2)})} />
          </label>
        </div>
      </div>

      <ThemeEditor />

      <div class="box stack">
        <h3>{L("Données", "Data")}</h3>
        <div class="row">
          <button
            class="btn"
            onClick={async () => {
              if (!(await confirmAction({title: L("Vider le cache des prix ?", "Clear the price cache?"), confirm: L("Vider", "Clear")}))) return;
              await clearPrices();
              toast(L("Cache des prix vidé.", "Price cache cleared."), {type: "ok"});
            }}
          >
            {L("Vider le cache des prix", "Clear the price cache")}
          </button>
          <button
            class="btn"
            onClick={async () => {
              const keys = await keysWithPrefix("friend:");
              for (const k of keys) await remove(k);
              toast(L(`${keys.length} collection(s) d'amis oubliée(s).`, `${keys.length} friend collection(s) forgotten.`), {type: "ok"});
            }}
          >
            {L("Oublier les collections d'amis", "Forget friend collections")}
          </button>
          <button
            class="btn ghost"
            onClick={async () =>
              (await confirmAction({
                title: L("Réinitialiser les réglages ?", "Reset settings?"),
                body: L("Les thèmes de tri reviennent aussi à la liste par défaut ; leurs étiquettes suivent au prochain tri.", "Sort themes also revert to the default list; their tags follow at the next sort."),
                confirm: L("Réinitialiser", "Reset"),
                danger: true,
              })) &&
              // Les étiquettes des thèmes renommés ou supprimés restent notées pour le prochain tri
              settings.set((st) => ({...DEFAULT_SETTINGS, themes: storeThemes(defaultThemeList(), st.themes)}))
            }
          >
            {L("Réinitialiser les réglages", "Reset settings")}
          </button>
        </div>
        <p class="small muted">WikiMasters Toolbox {__VERSION__} · {L("données gardées dans votre navigateur uniquement, aucun serveur tiers.", "data kept in your browser only, no third-party server.")}</p>
      </div>
    </div>
  );
}
