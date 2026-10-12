// Onglet « Réglages » : fonctionnalités, couleurs des étiquettes, caches.
import {useStore} from "../../lib/store";
import {keysWithPrefix, remove} from "../../lib/storage";
import {settings, FEATURES, DEFAULT_SETTINGS} from "../../state/settings";
import {clearPrices} from "../../state/prices";
import {Toggle} from "../components";
import {confirmAction, toast} from "../feedback";
import {THEME_COLORS, DOUBLON, DOUBLON_COLOR} from "../../../../../core";

export function SettingsTab() {
  const s = useStore(settings);
  const groups = [...new Set(FEATURES.map((f) => f.group))];
  const setFeature = (key, on) => settings.set((st) => ({...st, features: {...st.features, [key]: on}}));
  const setColor = (name, color) => settings.set((st) => ({...st, themeColors: {...st.themeColors, [name]: color}}));
  const colors = {...THEME_COLORS, [DOUBLON]: DOUBLON_COLOR};

  return (
    <div class="stack">
      <div class="page-head">
        <div>
          <h2>Réglages</h2>
          <p>Activez seulement ce qui vous sert. Les réglages sont enregistrés dans votre navigateur.</p>
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
          <h3>Délais</h3>
          <label class="field">
            <span>Durée de validité d'un prix (heures)</span>
            <input type="number" min="1" max="720" value={s.priceMaxAgeHours} onChange={(e) => settings.set({priceMaxAgeHours: Math.max(1, Number(e.currentTarget.value) || 48)})} />
          </label>
          <label class="field">
            <span>Alerte de fin d'enchère (minutes avant la fin)</span>
            <input type="number" min="1" max="60" value={s.bidAlertMinutes} onChange={(e) => settings.set({bidAlertMinutes: Math.max(1, Number(e.currentTarget.value) || 2)})} />
          </label>
        </div>
      </div>

      <div class="box stack">
        <div class="row">
          <h3 style={{flex: 1}}>Couleurs des étiquettes</h3>
          <button class="btn sm ghost" onClick={() => settings.set({themeColors: {}})}>Couleurs d'origine</button>
        </div>
        <p class="help">Appliquées aux étiquettes WikiMasters au prochain tri.</p>
        <div class="grid-2" style={{gap: "6px 14px"}}>
          {Object.entries(colors).map(([name, color]) => (
            <label class="row" key={name} style={{gap: "8px"}}>
              <input type="color" value={s.themeColors[name] || color} onInput={(e) => setColor(name, e.currentTarget.value)} />
              <span>{name}</span>
            </label>
          ))}
        </div>
      </div>

      <div class="box stack">
        <h3>Données</h3>
        <div class="row">
          <button
            class="btn"
            onClick={async () => {
              if (!(await confirmAction({title: "Vider le cache des prix ?", confirm: "Vider"}))) return;
              await clearPrices();
              toast("Cache des prix vidé.", {type: "ok"});
            }}
          >
            Vider le cache des prix
          </button>
          <button
            class="btn"
            onClick={async () => {
              const keys = await keysWithPrefix("friend:");
              for (const k of keys) await remove(k);
              toast(`${keys.length} collection(s) d'amis oubliée(s).`, {type: "ok"});
            }}
          >
            Oublier les collections d'amis
          </button>
          <button
            class="btn ghost"
            onClick={async () => (await confirmAction({title: "Réinitialiser les réglages ?", confirm: "Réinitialiser", danger: true})) && settings.set(DEFAULT_SETTINGS)}
          >
            Réinitialiser les réglages
          </button>
        </div>
        <p class="small muted">WikiMasters Toolbox {__VERSION__} · données gardées dans votre navigateur uniquement, aucun serveur tiers.</p>
      </div>
    </div>
  );
}
