// Éditeur des thèmes de tri (onglet Réglages) : noms, couleurs, mots-clés, ajout, suppression,
// retour aux thèmes par défaut, import / export en JSON. Les modifications restent un brouillon jusqu'à « Enregistrer » ;
// les étiquettes WikiMasters ne changent qu'au tri suivant (voir core/theme-set.js).
import {useState, useEffect, useMemo} from "preact/hooks";
import {useStore} from "../lib/store";
import {settings} from "../state/settings";
import {saveThemes, settleThemeTags} from "../state/themes";
import {Notice, Toggle, Copyable, FileButton, downloadFile, datedFilename, fmt} from "./components";
import {confirmAction, toast} from "./feedback";
import {L} from "../../shared/i18n";
import {
  defaultThemeList,
  resolveThemes,
  storeThemes,
  trackTagChanges,
  newTheme,
  splitPattern,
  joinPattern,
  validateThemes,
  exportThemes,
  importThemes,
  compileThemes,
  explain,
  DOUBLON,
  DOUBLON_COLOR,
} from "../../../../core";

const ROLE_HELP = {
  disambig: L("Reçoit aussi les pages d'homonymie, les noms de famille et les prénoms.", "Also receives disambiguation pages, surnames and given names."),
  species: L("Reçoit aussi les cartes sans description dont le titre est un nom latin.", "Also receives cards with no description whose title is a Latin name."),
  person: L("Reçoit aussi les biographies qu'aucun autre thème ne reconnaît.", "Also receives biographies that no other theme recognizes."),
};
const FIELDS = ["name", "color", "kw", "head", "split"];
const DEFAULTS = new Map(defaultThemeList().themes.map((t) => [t.id, t]));
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const STATUS_LABEL = {added: L("ajouté", "added"), modified: L("modifié", "modified")};

function status(theme) {
  const base = DEFAULTS.get(theme.id);
  if (!base) return "added";
  return FIELDS.some((k) => !same(theme[k] || null, base[k] || null)) ? "modified" : null;
}

// Mots-clés : une expression par ligne. Le texte saisi est gardé tel quel pendant la frappe
// (lignes vides, majuscules) ; l'alternance enregistrée est recalculée à chaque saisie.
function PatternField({label, help, value, onChange, rows = 6}) {
  const [text, setText] = useState(() => splitPattern(value).join("\n"));
  useEffect(() => {
    if (joinPattern(text) !== value) setText(splitPattern(value).join("\n"));
  }, [value]);
  return (
    <label class="field">
      <span>{label}</span>
      <textarea
        class="mono"
        rows={rows}
        spellcheck={false}
        value={text}
        onInput={(e) => {
          setText(e.currentTarget.value);
          onChange(joinPattern(e.currentTarget.value));
        }}
      />
      <span class="small">{help}</span>
    </label>
  );
}

function TagName({label, part, onChange}) {
  return (
    <div class="row">
      <input type="color" value={part.color} aria-label={L(`Couleur : ${label}`, `Color: ${label}`)} onInput={(e) => onChange({...part, color: e.currentTarget.value})} />
      <input type="text" style={{flex: 1, minWidth: 0}} aria-label={label} value={part.name} onInput={(e) => onChange({...part, name: e.currentTarget.value})} />
    </div>
  );
}

function ThemeDetail({theme, onChange, onReset}) {
  const set = (patch) => onChange({...theme, ...patch});
  const toggleSplit = (on) => {
    if (!on) return set({split: null});
    const base = DEFAULTS.get(theme.id)?.split;
    set({split: base ? JSON.parse(JSON.stringify(base)) : {fr: {name: `${theme.name} (France)`, color: theme.color}, intl: {name: `${theme.name} (international)`, color: theme.color}}});
  };
  return (
    <div class="stack" style={{padding: "6px 0 10px"}}>
      {theme.role && <p class="small muted">{ROLE_HELP[theme.role]} {L("Sans ce thème, ces cartes iraient dans la catégorie des cartes sans thème.", "Without this theme, these cards would go to the cards without a theme.")}</p>}
      <div class="setting">
        <div class="txt">
          <strong>{L("Séparer France / international", "Split France / international")}</strong>
          <span>{L("Deux étiquettes, selon la nationalité trouvée dans la description de la carte (comme la politique).", "Two tags, based on the nationality found in the card's description (like politics).")}</span>
        </div>
        <Toggle checked={Boolean(theme.split)} label={L("Séparer France / international", "Split France / international")} onChange={toggleSplit} />
      </div>
      {theme.split && (
        <div class="grid-2" style={{gap: "8px 14px"}}>
          <label class="field">
            <span>{L("Étiquette France", "France tag")}</span>
            <TagName label={L("Étiquette France", "France tag")} part={theme.split.fr} onChange={(fr) => set({split: {...theme.split, fr}})} />
          </label>
          <label class="field">
            <span>{L("Étiquette internationale", "International tag")}</span>
            <TagName label={L("Étiquette internationale", "International tag")} part={theme.split.intl} onChange={(intl) => set({split: {...theme.split, intl}})} />
          </label>
        </div>
      )}
      <PatternField
        label={L("Mots-clés", "Keywords")}
        value={theme.kw}
        onChange={(kw) => set({kw})}
        help={L(
          <>
            Une expression par ligne, cherchée comme mot entier dans la description, la première phrase et le titre. <code>s?</code> rend une lettre facultative (<code>requins?</code>), <code>(?:a|b)</code> propose deux variantes.
          </>,
          <>
            One expression per line, matched as a whole word in the description, the first sentence and the title. <code>s?</code> makes a letter optional (<code>sharks?</code>), <code>(?:a|b)</code> offers two variants.
          </>,
        )}
      />
      <PatternField
        label={L("Noms ambigus", "Ambiguous nouns")}
        rows={3}
        value={theme.head || ""}
        onChange={(head) => set({head})}
        help={L("Comptent seulement en tête de la description (« tour », « fort », « port ») : facultatif.", 'Only count at the start of the description ("tour", "fort", "port"): optional.')}
      />
      {status(theme) === "modified" && (
        <div class="row">
          <button class="btn sm ghost" onClick={onReset}>{L("Rétablir ce thème", "Restore this theme")}</button>
        </div>
      )}
    </div>
  );
}

// Essai du brouillon sur une description : thème obtenu et meilleurs scores
function Tester({list, valid}) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const result = useMemo(() => {
    if (!valid || !(title.trim() || desc.trim())) return null;
    const set = compileThemes(list);
    const r = explain({wikipedia_title: title, category: desc, summary: ""}, {themes: set});
    const top = Object.entries(r.scores).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return {theme: r.theme, color: set.tags[r.theme], top};
  }, [list, valid, title, desc]);
  return (
    <div class="stack" style={{gap: "8px"}}>
      <div class="eyebrow">{L("Essayer", "Try it")}</div>
      <div class="row">
        <input type="text" style={{flex: 1, minWidth: "140px"}} placeholder={L("Titre (facultatif)", "Title (optional)")} value={title} onInput={(e) => setTitle(e.currentTarget.value)} />
        <input type="text" style={{flex: 2, minWidth: "200px"}} placeholder={L("Description courte, ex. « footballeur danois »", 'Short description, e.g. "footballeur danois"')} value={desc} onInput={(e) => setDesc(e.currentTarget.value)} />
      </div>
      {result && (
        <div class="row small">
          <span class="chip theme" style={{"--c": result.color}}><span class="lbl">{result.theme}</span></span>
          {result.top.length > 0 && <span class="muted">{L("Scores : ", "Scores: ")}{result.top.map(([n, s]) => `${n} ${fmt(s)}`).join(" · ")}</span>}
        </div>
      )}
    </div>
  );
}

// Liste en JSON, à copier ou à enregistrer dans un fichier
function ExportDialog({list, onClose}) {
  const text = useMemo(() => JSON.stringify(exportThemes(list), null, 2), [list]);
  return (
    <div class="modal-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="modal">
        <h3>{L("Exporter les thèmes", "Export themes")}</h3>
        <p class="help">{L("La liste affichée, modifications non enregistrées comprises. Un autre joueur l'importe dans ses réglages, onglet Réglages → Thèmes de tri → « Importer ».", 'The list shown, unsaved changes included. Another player imports it in their settings: Settings tab → Sort themes → "Import".')}</p>
        <Copyable text={text} />
        <div class="actions">
          <button class="btn ghost" onClick={onClose}>{L("Fermer", "Close")}</button>
          <button class="btn" onClick={() => downloadFile(datedFilename("themes"), text)}>{L("Télécharger le fichier", "Download file")}</button>
        </div>
      </div>
    </div>
  );
}

// JSON collé ou fichier choisi → liste chargée dans l'éditeur (rien n'est enregistré)
function ImportDialog({onImport, onClose}) {
  const [text, setText] = useState("");
  const [error, setError] = useState(null);
  const run = () => {
    const {list, problems} = importThemes(text);
    if (!list) return setError(problems.join(" "));
    onImport(list, problems);
    onClose();
  };
  return (
    <div class="modal-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="modal">
        <h3>{L("Importer des thèmes", "Import themes")}</h3>
        <p class="help">{L("Collez le JSON exporté par la Toolbox, ou choisissez le fichier. La liste importée remplace celle de l'éditeur ; rien n'est enregistré avant « Enregistrer ».", 'Paste the JSON exported by the Toolbox, or choose the file. The imported list replaces the one in the editor; nothing is saved until you click "Save".')}</p>
        <textarea class="mono" rows={6} placeholder='{"format": "wikimasters-toolbox/themes", …}' spellcheck={false} value={text} onInput={(e) => setText(e.currentTarget.value)} />
        {error && <Notice type="error">{error}</Notice>}
        <div class="actions">
          <FileButton
            maxSize={500000}
            onError={setError}
            onText={(t) => {
              setText(t);
              setError(null);
            }}
          />
          <button class="btn ghost" onClick={onClose}>{L("Annuler", "Cancel")}</button>
          <button class="btn primary" onClick={run} disabled={!text.trim()}>{L("Importer", "Import")}</button>
        </div>
      </div>
    </div>
  );
}

export function ThemeEditor() {
  const s = useStore(settings);
  const saved = useMemo(() => resolveThemes(s.themes), [s.themes]);
  const [draft, setDraft] = useState(saved);
  const [open, setOpen] = useState(null);
  const [modal, setModal] = useState(null);
  const dirty = !same(storeThemes(draft, s.themes), s.themes);
  // Réglage modifié ailleurs (autre onglet, tri terminé) : le brouillon suit s'il n'a pas été touché
  useEffect(() => {
    if (!dirty) setDraft(saved);
  }, [saved]);

  const problems = validateThemes(draft);
  const problemsOf = (id) => problems.filter((p) => p.id === id);
  const setTheme = (theme) => setDraft((d) => ({...d, themes: d.themes.map((t) => (t.id === theme.id ? theme : t))}));
  const pending = {renames: s.themes?.renames || {}, removed: s.themes?.removed || []};

  const add = () => {
    const theme = newTheme(L(`Nouveau thème ${draft.themes.length + 1}`, `New theme ${draft.themes.length + 1}`));
    setDraft((d) => ({...d, themes: [...d.themes, theme]}));
    setOpen(theme.id);
  };
  const remove = async (theme) => {
    const ok = await confirmAction({
      title: L(`Supprimer le thème « ${theme.name} » ?`, `Delete the "${theme.name}" theme?`),
      body: `${theme.role ? `${ROLE_HELP[theme.role]} ` : ""}${L("Après enregistrement, ses cartes seront reclassées par le prochain retri complet, qui retirera aussi son étiquette (avec confirmation).", "Once saved, its cards will be re-sorted by the next full re-sort, which will also remove its tag (with confirmation).")}`,
      confirm: L("Supprimer", "Delete"),
      danger: true,
    });
    if (ok) setDraft((d) => ({...d, themes: d.themes.filter((t) => t.id !== theme.id)}));
  };
  const imported = (list, issues) => {
    setDraft(list);
    setOpen(null);
    toast(issues.length ? L(`Thèmes chargés, ${issues.length} problème(s) à corriger avant d'enregistrer.`, `Themes loaded, ${issues.length} problem(s) to fix before saving.`) : L("Thèmes chargés : vérifiez-les, puis cliquez sur « Enregistrer ».", 'Themes loaded: check them, then click "Save".'), {type: issues.length ? "error" : "ok"});
  };
  const resetAll = async () => {
    if (await confirmAction({title: L("Revenir aux thèmes par défaut ?", "Revert to the default themes?"), body: L("Vos thèmes ajoutés, renommés ou modifiés sont remplacés par la liste d'origine (à enregistrer ensuite).", "Your added, renamed or modified themes are replaced by the original list (save afterwards)."), confirm: L("Rétablir", "Restore")}))
      setDraft(defaultThemeList());
  };
  const save = async () => {
    const changes = trackTagChanges(saved, draft);
    const renamed = Object.entries(changes.renames);
    if (renamed.length || changes.removed.length) {
      const lines = [
        renamed.length && L(`Renommées au prochain tri : ${renamed.map(([a, b]) => `${a} → ${b}`).join(", ")}.`, `Renamed at the next sort: ${renamed.map(([a, b]) => `${a} → ${b}`).join(", ")}.`),
        changes.removed.length && L(`Retirées au prochain retri complet, après confirmation : ${changes.removed.join(", ")}.`, `Removed at the next full re-sort, after confirmation: ${changes.removed.join(", ")}.`),
      ].filter(Boolean);
      if (!(await confirmAction({title: L("Enregistrer les thèmes ?", "Save the themes?"), body: `${lines.join(" ")} ${L("Rien n'est écrit tant que vous ne lancez pas de tri.", "Nothing is written until you run a sort.")}`, confirm: L("Enregistrer", "Save")}))) return;
    }
    saveThemes(draft);
    toast(L("Thèmes enregistrés : ils s'appliquent au prochain tri.", "Themes saved: they apply at the next sort."), {type: "ok"});
  };

  return (
    <div class="box stack">
      <div class="row">
        <div style={{flex: 1, minWidth: "200px"}}>
          <h3>{L("Thèmes de tri", "Sort themes")}</h3>
          <p class="help">{L("Chaque carte reçoit le thème dont les mots-clés correspondent le mieux à sa description. Renommez, recolorez, modifiez ou ajoutez des thèmes : les étiquettes WikiMasters suivent au prochain tri.", "Each card gets the theme whose keywords best match its description. Rename, recolor, edit or add themes: the WikiMasters tags follow at the next sort.")}</p>
        </div>
        <button class="btn sm" onClick={add}>{L("Ajouter un thème", "Add a theme")}</button>
        <button class="btn sm ghost" onClick={() => setModal("import")}>{L("Importer", "Import")}</button>
        <button class="btn sm ghost" disabled={problems.length > 0} title={problems.length ? L("Corrigez d'abord les problèmes signalés", "Fix the reported problems first") : undefined} onClick={() => setModal("export")}>{L("Exporter", "Export")}</button>
        <button class="btn sm ghost" onClick={resetAll}>{L("Thèmes par défaut", "Default themes")}</button>
      </div>
      {modal === "export" && <ExportDialog list={draft} onClose={() => setModal(null)} />}
      {modal === "import" && <ImportDialog onImport={imported} onClose={() => setModal(null)} />}

      <table class="list">
        <tbody>
          {draft.themes.map((t) => {
            const st = status(t);
            const own = problemsOf(t.id);
            const isOpen = open === t.id;
            return [
              <tr key={t.id}>
                <td style={{width: "46px"}}>
                  {t.split ? (
                    <span class="stack" style={{gap: "3px"}}>
                      {["fr", "intl"].map((k) => (
                        <input
                          key={k}
                          type="color"
                          style={{height: "18px", padding: "1px"}}
                          value={t.split[k].color}
                          title={t.split[k].name}
                          aria-label={L(`Couleur : ${t.split[k].name}`, `Color: ${t.split[k].name}`)}
                          onInput={(e) => setTheme({...t, split: {...t.split, [k]: {...t.split[k], color: e.currentTarget.value}}})}
                        />
                      ))}
                    </span>
                  ) : (
                    <input type="color" value={t.color} aria-label={L(`Couleur : ${t.name}`, `Color: ${t.name}`)} onInput={(e) => setTheme({...t, color: e.currentTarget.value})} />
                  )}
                </td>
                <td>
                  <input type="text" style={{width: "100%"}} aria-label={L("Nom du thème", "Theme name")} value={t.name} onInput={(e) => setTheme({...t, name: e.currentTarget.value})} />
                  {t.split && <div class="small muted" style={{marginTop: "4px"}}>{L("Étiquettes : ", "Tags: ")}{t.split.fr.name} · {t.split.intl.name}</div>}
                  {own.map((p) => (
                    <div key={p.message} class="small" style={{color: "var(--danger)", marginTop: "4px"}}>{p.message}</div>
                  ))}
                </td>
                <td style={{width: "1%", whiteSpace: "nowrap"}}>
                  <span class="row" style={{gap: "4px", flexWrap: "nowrap"}}>
                    {st && <span class="chip">{STATUS_LABEL[st]}</span>}
                    <button class="btn sm ghost" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : t.id)}>{isOpen ? L("Fermer", "Close") : L("Mots-clés", "Keywords")}</button>
                    <button class="btn sm ghost" onClick={() => remove(t)}>{L("Supprimer", "Delete")}</button>
                  </span>
                </td>
              </tr>,
              isOpen && (
                <tr key={`${t.id}-detail`}>
                  <td />
                  <td colSpan={2}>
                    <ThemeDetail theme={t} onChange={setTheme} onReset={() => setTheme(JSON.parse(JSON.stringify(DEFAULTS.get(t.id))))} />
                  </td>
                </tr>
              ),
            ];
          })}
          <tr>
            <td>
              <input type="color" value={draft.other.color} aria-label={L("Couleur des cartes sans thème", "Color of cards without a theme")} onInput={(e) => setDraft((d) => ({...d, other: {...d.other, color: e.currentTarget.value}}))} />
            </td>
            <td>
              <input type="text" style={{width: "100%"}} aria-label={L("Étiquette des cartes sans thème", "Tag for cards without a theme")} value={draft.other.name} onInput={(e) => setDraft((d) => ({...d, other: {...d.other, name: e.currentTarget.value}}))} />
              {problemsOf(null).map((p) => (
                <div key={p.message} class="small" style={{color: "var(--danger)", marginTop: "4px"}}>{p.message}</div>
              ))}
            </td>
            <td class="small muted">{L("Cartes sans thème reconnu", "Cards with no recognized theme")}</td>
          </tr>
          <tr>
            <td>
              <input type="color" value={s.themeColors[DOUBLON] || DOUBLON_COLOR} aria-label={L(`Couleur de ${DOUBLON}`, `${DOUBLON} color`)} onInput={(e) => settings.set((st) => ({...st, themeColors: {...st.themeColors, [DOUBLON]: e.currentTarget.value}}))} />
            </td>
            <td>{DOUBLON}</td>
            <td class="small muted">{L("Cartes en plusieurs exemplaires", "Cards owned in several copies")}</td>
          </tr>
        </tbody>
      </table>

      <Tester list={draft} valid={!problems.length} />

      {(Object.keys(pending.renames).length > 0 || pending.removed.length > 0) && (
        <Notice>
          <div class="stack" style={{gap: "6px"}}>
            {Object.keys(pending.renames).length > 0 && <div>{L("Étiquettes renommées au prochain tri : ", "Tags renamed at the next sort: ")}{Object.entries(pending.renames).map(([a, b]) => `${a} → ${b}`).join(", ")}.</div>}
            {pending.removed.length > 0 && (
              <div>
                {L("Étiquettes de thèmes supprimés, retirées au prochain retri complet (après confirmation) :", "Tags of deleted themes, removed at the next full re-sort (after confirmation):")}
                <div class="chips" style={{marginTop: "6px"}}>
                  {pending.removed.map((name) => (
                    <span key={name} class="chip">
                      {name}
                      <button class="btn sm ghost" title={L("L'étiquette reste sur vos cartes et n'est plus touchée par le tri", "The tag stays on your cards and is no longer touched by sorting")} onClick={() => settleThemeTags([name])}>
                        {L("Garder comme étiquette personnelle", "Keep as a personal tag")}
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Notice>
      )}

      <div class="row">
        <span class="small muted" style={{flex: 1}}>{dirty ? (problems.length ? L(`${problems.length} problème(s) à corriger avant d'enregistrer.`, `${problems.length} problem(s) to fix before saving.`) : L("Modifications non enregistrées.", "Unsaved changes.")) : L("Thèmes enregistrés.", "Themes saved.")}</span>
        {dirty && <button class="btn ghost" onClick={() => setDraft(saved)}>{L("Annuler", "Cancel")}</button>}
        <button class="btn primary" disabled={!dirty || problems.length > 0} onClick={save}>{L("Enregistrer", "Save")}</button>
      </div>
    </div>
  );
}
