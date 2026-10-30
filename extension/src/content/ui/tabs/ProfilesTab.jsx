// Onglet « Profils » : mon profil d'intérêts et ceux de mes amis (tags « Pour : … »).
import {useState, useEffect} from "preact/hooks";
import {useStore} from "../../lib/store";
import {readSession} from "../../lib/session";
import {profiles, newId} from "../../state/profiles";
import {loadMyCollection} from "../../state/collection";
import {friendsState, loadFriends} from "../../features/trades";
import {Notice, Copyable, CardRow, FileButton, downloadFile, datedFilename, fmt, plural} from "../components";
import {confirmAction, toast, errorMessage} from "../feedback";
import {
  simpleToProfile,
  validateProfile,
  profileTags,
  extractFields,
  tagForProfile,
  encodeShareCode,
  decodeShareCode,
  exportProfiles,
  importProfiles,
  mergeProfiles,
} from "../../../../../core";
import {themeNames, classify, aliasesOf} from "../../state/themes";
import {L} from "../../../shared/i18n";

const PALETTE = ["#0ea5e9", "#ec4899", "#22c55e", "#eab308", "#dc2626", "#8b5cf6", "#14b8a6", "#f97316", "#64748b", "#4c1d95"];

function describeRules(p) {
  if (p.simple) {
    const parts = [];
    if (p.simple.themes?.length) parts.push(p.simple.themes.join(", "));
    if (p.simple.keywords) {
      const list = `${p.simple.keywords.split(/[,;\n]/).filter((k) => k.trim()).slice(0, 8).join(", ")}${p.simple.keywords.split(/[,;\n]/).length > 8 ? "…" : ""}`;
      parts.push(L(`mots-clés : ${list}`, `keywords: ${list}`));
    }
    return parts.join(" · ") || L("Aucune règle", "No rules");
  }
  const n = p.rules?.length || 0;
  return p.about || L(`${plural(n, "règle")} avancée${n > 1 ? "s" : ""}`, plural(n, "advanced rule"));
}

function ProfileEditor({initial, isMine, onSave, onClose}) {
  const me = readSession()?.username;
  const friends = useStore(friendsState).list;
  const [mode, setMode] = useState(initial?.rules?.length && !initial.simple ? "advanced" : "simple");
  const [name, setName] = useState(isMine ? me || "" : initial?.name || "");
  const [color, setColor] = useState(initial?.color || PALETTE[Math.floor(Math.random() * PALETTE.length)]);
  const [about, setAbout] = useState(initial?.about || "");
  const [themes, setThemes] = useState(initial?.simple?.themes || []);
  const [keywords, setKeywords] = useState(initial?.simple?.keywords || "");
  const [exclude, setExclude] = useState(initial?.simple?.exclude || "");
  const [imageOnly, setImageOnly] = useState(Boolean(initial?.simple?.imageOnly));
  const [rulesText, setRulesText] = useState(JSON.stringify(initial?.rules || [], null, 2));
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!isMine && !friends) loadFriends().catch(() => {});
  }, []);

  const build = () => {
    if (mode === "simple") return simpleToProfile({name: name.trim(), color, about, themes, keywords, exclude, imageOnly});
    let rules;
    try {
      rules = JSON.parse(rulesText);
    } catch (e) {
      throw new Error(L(`Règles illisibles (JSON) : ${e.message}`, `Unreadable rules (JSON): ${e.message}`));
    }
    return {name: name.trim(), color, about, rules};
  };

  const save = () => {
    try {
      const p = build();
      const problems = validateProfile(p);
      if (problems.length) throw new Error(problems.join(" "));
      onSave({...initial, ...p, id: initial?.id || newId(), enabled: initial?.enabled ?? true, simple: mode === "simple" ? p.simple : undefined});
    } catch (e) {
      setError(e.message);
    }
  };

  const switchMode = (next) => {
    if (next === "advanced" && mode === "simple") {
      try {
        setRulesText(JSON.stringify(build().rules, null, 2));
      } catch {}
    }
    setMode(next);
  };

  return (
    <div class="modal-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="modal wide">
        <h3>{isMine ? L("Mon profil d'intérêts", "My interest profile") : initial ? L(`Profil de ${initial.name}`, `${initial.name}'s profile`) : L("Nouveau profil d'ami", "New friend profile")}</h3>
        <p class="help">
          {L("Les cartes qui correspondent reçoivent l'étiquette ", "Matching cards get the tag ")}
          <strong>{name ? tagForProfile({name}) : "Pour : …"}</strong>
          {L(" lors du tri.", " when sorting.")}
          {isMine
            ? L(" Il sert aussi à chercher les cartes à demander à vos amis.", " It is also used to find cards to ask your friends for.")
            : L(" Il sert aussi à savoir quelles cartes lui proposer.", " It is also used to know which cards to offer them.")}
        </p>
        <div class="row" style={{alignItems: "flex-end"}}>
          {!isMine && (
            <label class="field" style={{flex: 1, minWidth: "200px"}}>
              <span>{L("Pseudo de l'ami (sur WikiMasters)", "Friend's username (on WikiMasters)")}</span>
              <input type="text" list="wmt-friends" value={name} onInput={(e) => setName(e.currentTarget.value)} placeholder={L("ex. Oaffew", "e.g. Oaffew")} />
              <datalist id="wmt-friends">{(friends || []).map((f) => <option key={f.id} value={f.username} />)}</datalist>
            </label>
          )}
          <label class="field">
            <span>{L("Couleur", "Color")}</span>
            <input type="color" value={color} onInput={(e) => setColor(e.currentTarget.value)} />
          </label>
          <label class="field" style={{flex: 2, minWidth: "220px"}}>
            <span>{L("Description", "Description")}</span>
            <input type="text" value={about} onInput={(e) => setAbout(e.currentTarget.value)} placeholder={L("ex. Serpents, Star Wars, rap français", "e.g. Snakes, Star Wars, French rap")} />
          </label>
        </div>
        <div class="chips">
          <button class={`chip${mode === "simple" ? " on" : ""}`} onClick={() => switchMode("simple")}>{L("Éditeur simple", "Simple editor")}</button>
          <button class={`chip${mode === "advanced" ? " on" : ""}`} onClick={() => switchMode("advanced")}>{L("Règles avancées", "Advanced rules")}</button>
        </div>
        {mode === "simple" ? (
          <div class="stack">
            <div class="field">
              <span style={{fontWeight: 600}}>{L("Thèmes entiers", "Whole themes")}</span>
              <div class="chips" style={{marginTop: "6px"}}>
                {[...new Set([...themeNames(), ...themes])].map((t) => (
                  <button key={t} class={`chip${themes.includes(t) ? " on" : ""}`} onClick={() => setThemes(themes.includes(t) ? themes.filter((x) => x !== t) : [...themes, t])}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <label class="field">
              <span>{L("Mots-clés", "Keywords")}</span>
              <textarea value={keywords} onInput={(e) => setKeywords(e.currentTarget.value)} placeholder={L("requin, plongée, Star Wars, haltérophil*", "shark, diving, Star Wars, weightlift*")} />
              <span class="small">
                {L(
                  "Séparés par des virgules. Cherchés dans le titre, la description et la 1re phrase de l'article. Un mot seul accepte son pluriel ; « * » en fin de mot accepte toutes les terminaisons.",
                  "Comma-separated. Searched in the title, the description and the first sentence of the article. A single word also matches its plural; \"*\" at the end of a word matches any ending.",
                )}
              </span>
            </label>
            <label class="field">
              <span>{L("Exclusions", "Exclusions")}</span>
              <input type="text" value={exclude} onInput={(e) => setExclude(e.currentTarget.value)} placeholder={L("ex. Monty Python, langage", "e.g. Monty Python, langage")} />
            </label>
            <label class="check">
              <input type="checkbox" checked={imageOnly} onChange={(e) => setImageOnly(e.currentTarget.checked)} /> {L("Mots-clés : seulement les cartes qui ont une image", "Keywords: only cards that have an image")}
            </label>
          </div>
        ) : (
          <label class="field">
            <span>{L("Règles (JSON)", "Rules (JSON)")}</span>
            <textarea class="mono" rows={12} value={rulesText} onInput={(e) => setRulesText(e.currentTarget.value)} />
            <span class="small">
              {L("Chaque règle combine : ", "Each rule combines: ")}
              <code>theme</code> {L("(thème ou liste)", "(theme or list)")}, <code>kw</code> {L("(expression régulière, mots entiers)", "(regular expression, whole words)")}, <code>field</code> ("title"), <code>with</code>,{" "}
              <code>unless</code>, <code>image</code> (true), <code>match</code> ("musicAlbum"). {L("Le profil s'applique si une règle s'applique.", "The profile applies if any rule applies.")}
            </span>
          </label>
        )}
        {error && <Notice type="error">{error}</Notice>}
        <div class="actions">
          <button class="btn ghost" onClick={onClose}>{L("Annuler", "Cancel")}</button>
          <button class="btn primary" onClick={save} disabled={!name.trim()}>{L("Enregistrer", "Save")}</button>
        </div>
      </div>
    </div>
  );
}

function ExportDialog({profile, onClose}) {
  const [code, setCode] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    const {id, enabled, ...rest} = profile;
    encodeShareCode("P", rest)
      .then(setCode)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  return (
    <div class="modal-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="modal">
        <h3>{L(`Partager le profil « ${profile.name} »`, `Share profile "${profile.name}"`)}</h3>
        <p class="help">
          {L(
            "Envoyez ce code à vos amis : dans leur Toolbox, onglet Profils, « Importer ». Le fichier JSON s'importe au même endroit.",
            "Send this code to your friends: in their Toolbox, Profiles tab, \"Import\". The JSON file is imported in the same place.",
          )}
        </p>
        {error ? <Notice type="error">{error}</Notice> : code ? <Copyable text={code} /> : <div class="spinner" />}
        <div class="actions">
          <button class="btn ghost" onClick={onClose}>{L("Fermer", "Close")}</button>
          <button class="btn" onClick={() => downloadFile(datedFilename(`profil-${profile.name}`), JSON.stringify(exportProfiles([profile]), null, 2))}>
            {L("Télécharger en JSON", "Download as JSON")}
          </button>
        </div>
      </div>
    </div>
  );
}

// Tous mes profils (le mien et ceux de mes amis) en JSON
function ExportAllDialog({list, onClose}) {
  const text = JSON.stringify(exportProfiles(list), null, 2);
  return (
    <div class="modal-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="modal">
        <h3>{L("Exporter les profils", "Export profiles")}</h3>
        <p class="help">
          {L(
            `${plural(list.length, "profil")} : le vôtre et ceux de vos amis. Pour les retrouver dans un autre navigateur, ou les donner à un ami : onglet Profils, « Importer ».`,
            `${plural(list.length, "profile")}: yours and your friends'. To get them back in another browser, or give them to a friend: Profiles tab, "Import".`,
          )}
        </p>
        <Copyable text={text} />
        <div class="actions">
          <button class="btn ghost" onClick={onClose}>{L("Fermer", "Close")}</button>
          <button class="btn" onClick={() => downloadFile(datedFilename("profils"), text)}>{L("Télécharger le fichier", "Download file")}</button>
        </div>
      </div>
    </div>
  );
}

// Code de partage (WMT-P1…), JSON collé ou fichier → résumé, puis import sur confirmation.
// Le profil qui porte mon pseudo devient le mien ; un ami déjà présent est remplacé.
function ImportDialog({onClose}) {
  const me = readSession()?.username;
  const [text, setText] = useState("");
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const read = async () => {
    setError(null);
    try {
      const input = text.trim();
      const result = input.startsWith("WMT-") ? importProfiles(JSON.stringify((await decodeShareCode(input, "P")).payload)) : importProfiles(input);
      if (result.error) throw new Error(result.error);
      if (!result.profiles.length) throw new Error(result.rejected.map((r) => L(`${r.name} : ${r.problems.join(" ")}`, `${r.name}: ${r.problems.join(" ")}`)).join(" "));
      setPreview({...result, merge: mergeProfiles(profiles.get(), result.profiles, me, newId)});
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const confirm = () => {
    const {merge} = preview;
    // Recalculé sur l'état actuel : un profil modifié entre-temps (autre onglet) n'est pas perdu
    profiles.set((st) => mergeProfiles(st, preview.profiles, me, newId).state);
    const n = merge.added.length + merge.replaced.length + (merge.mine ? 1 : 0);
    toast(`${plural(n, L("profil importé", "profile imported"), L("profils importés", "profiles imported"))}.`, {type: "ok"});
    onClose();
  };
  return (
    <div class="modal-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="modal">
        <h3>{L("Importer des profils", "Import profiles")}</h3>
        {preview ? (
          <div class="stack" style={{gap: "8px"}}>
            {preview.merge.mine && (
              <p>
                {preview.merge.mine === "replaced" ? L("Mon profil : remplacé.", "My profile: replaced.") : L("Mon profil : ajouté.", "My profile: added.")}
              </p>
            )}
            {preview.merge.added.length > 0 && <p>{L(`Ajoutés : ${preview.merge.added.join(", ")}.`, `Added: ${preview.merge.added.join(", ")}.`)}</p>}
            {preview.merge.replaced.length > 0 && (
              <p>{L(`Remplacés (même pseudo) : ${preview.merge.replaced.join(", ")}.`, `Replaced (same username): ${preview.merge.replaced.join(", ")}.`)}</p>
            )}
            {preview.rejected.length > 0 && (
              <Notice type="warn">
                {L(
                  `Écartés : ${preview.rejected.map((r) => `${r.name} (${r.problems.join(" ")})`).join(" ; ")}`,
                  `Skipped: ${preview.rejected.map((r) => `${r.name} (${r.problems.join(" ")})`).join("; ")}`,
                )}
              </Notice>
            )}
            <p class="small muted">
              {L("Les étiquettes « Pour : … » suivent au prochain tri. Rien n'est écrit sur le site.", "The \"Pour : …\" tags follow at the next sort. Nothing is written to the site.")}
            </p>
          </div>
        ) : (
          <>
            <p class="help">
              {L(
                "Collez le code d'un ami (WMT-P1…) ou un export JSON de la Toolbox, ou choisissez le fichier. Un résumé s'affiche avant l'import.",
                "Paste a friend's code (WMT-P1…) or a Toolbox JSON export, or pick the file. A summary is shown before importing.",
              )}
            </p>
            <textarea class="mono" rows={6} spellcheck={false} placeholder={L('WMT-P1.… ou {"format": "wikimasters-toolbox/profiles", …}', 'WMT-P1.… or {"format": "wikimasters-toolbox/profiles", …}')} value={text} onInput={(e) => setText(e.currentTarget.value)} />
          </>
        )}
        {error && <Notice type="error">{error}</Notice>}
        <div class="actions">
          {preview ? (
            <>
              <button class="btn ghost" onClick={() => setPreview(null)}>{L("Retour", "Back")}</button>
              <button class="btn primary" onClick={confirm}>{L("Importer", "Import")}</button>
            </>
          ) : (
            <>
              <FileButton
                maxSize={1000000}
                onError={setError}
                onText={(t) => {
                  setText(t);
                  setError(null);
                }}
              />
              <button class="btn ghost" onClick={onClose}>{L("Annuler", "Cancel")}</button>
              <button class="btn primary" onClick={read} disabled={!text.trim()}>{L("Continuer", "Continue")}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TestDialog({profile, onClose}) {
  const [state, setState] = useState({loading: true});
  useEffect(() => {
    loadMyCollection({withSummary: true})
      .then((copies) => {
        const seen = new Set();
        const matches = [];
        for (const c of copies) {
          if (seen.has(c.card_id)) continue;
          seen.add(c.card_id);
          const f = extractFields(c.card);
          const theme = classify(c.card)[0];
          if (profileTags([profile], c.card, f, aliasesOf(theme)).length) matches.push({...c, theme});
        }
        setState({matches, total: seen.size});
      })
      .catch((e) => setState({error: errorMessage(e)}));
  }, []);
  return (
    <div class="modal-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="modal wide">
        <h3>{L(`Test du profil « ${profile.name} » sur ma collection`, `Testing profile "${profile.name}" on my collection`)}</h3>
        {state.loading && <div class="row"><div class="spinner" /> {L("Lecture de la collection…", "Reading collection…")}</div>}
        {state.error && <Notice type="error">{state.error}</Notice>}
        {state.matches && (
          <>
            <p>
              {L(
                `${plural(state.matches.length, "carte")} sur ${fmt(state.total)} recevraient l'étiquette « ${tagForProfile(profile)} ».`,
                `${plural(state.matches.length, "card")} out of ${fmt(state.total)} would get the tag "${tagForProfile(profile)}".`,
              )}
            </p>
            <div class="cards" style={{maxHeight: "50vh", overflow: "auto"}}>
              {state.matches.slice(0, 120).map((c) => <CardRow key={c.id} card={c.card} rarity={c.rarity} theme={c.theme} />)}
            </div>
          </>
        )}
        <div class="actions"><button class="btn" onClick={onClose}>{L("Fermer", "Close")}</button></div>
      </div>
    </div>
  );
}

function ProfileCard({p, isMine, onEdit, onDelete, onToggle, onExport, onTest}) {
  return (
    <div class="box stack" style={{gap: "8px"}}>
      <div class="row">
        <span class="swatch" style={{"--c": p.color || "#64748b"}} />
        <strong style={{flex: 1}}>{tagForProfile(p)}</strong>
        {!isMine && (
          <label class="check small muted">
            <input type="checkbox" checked={p.enabled !== false} onChange={(e) => onToggle(e.currentTarget.checked)} /> {L("actif", "active")}
          </label>
        )}
      </div>
      <p class="small muted">{describeRules(p)}</p>
      <div class="row">
        <button class="btn sm" onClick={onEdit}>{L("Modifier", "Edit")}</button>
        <button class="btn sm" onClick={onTest}>{L("Tester", "Test")}</button>
        <button class="btn sm" onClick={onExport}>{L("Partager", "Share")}</button>
        <span class="spacer" />
        <button class="btn sm ghost" onClick={onDelete}>{L("Supprimer", "Delete")}</button>
      </div>
    </div>
  );
}

export function ProfilesTab() {
  const {mine, friends} = useStore(profiles);
  const me = readSession()?.username;
  const [modal, setModal] = useState(null);

  const saveFriend = (p) => {
    profiles.set((s) => ({friends: s.friends.some((f) => f.id === p.id) ? s.friends.map((f) => (f.id === p.id ? p : f)) : [...s.friends, p]}));
    setModal(null);
  };

  return (
    <div class="stack">
      <div class="page-head">
        <div style={{flex: 1}}>
          <h2>{L("Profils d'intérêts", "Interest profiles")}</h2>
          <p>
            {L(
              "Ce que chacun collectionne. Chaque profil donne une étiquette « Pour : pseudo » lors du tri, et guide la recherche d'échanges. Partagez votre profil par code ou en JSON avec vos amis.",
              "What everyone collects. Each profile gives a \"Pour : username\" tag when sorting, and guides the search for trades. Share your profile with your friends by code or as JSON.",
            )}
          </p>
        </div>
        <div class="row">
          <button class="btn" onClick={() => setModal({type: "import"})}>{L("Importer", "Import")}</button>
          <button class="btn" disabled={!mine && !friends.length} onClick={() => setModal({type: "export-all"})}>{L("Exporter", "Export")}</button>
        </div>
      </div>

      <div class="stack" style={{gap: "10px"}}>
        <h3 class="section-title">{L("Mon profil", "My profile")}{me ? ` (${me})` : ""}</h3>
        {mine ? (
          <ProfileCard
            p={{...mine, name: me || mine.name}}
            isMine
            onEdit={() => setModal({type: "edit", profile: mine, isMine: true})}
            onTest={() => setModal({type: "test", profile: {...mine, name: me || mine.name}})}
            onExport={() => setModal({type: "export", profile: {...mine, name: me || mine.name}})}
            onDelete={async () => (await confirmAction({title: L("Supprimer mon profil ?", "Delete my profile?"), confirm: L("Supprimer", "Delete"), danger: true})) && profiles.set({mine: null})}
          />
        ) : (
          <div class="box row">
            <p class="help" style={{flex: 1}}>
              {L(
                "Décrivez ce que vous collectionnez : vos amis pourront importer votre profil pour savoir quoi vous proposer.",
                "Describe what you collect: your friends can import your profile to know what to offer you.",
              )}
            </p>
            <button class="btn primary" onClick={() => setModal({type: "edit", profile: null, isMine: true})}>
              {L("Créer mon profil", "Create my profile")}
            </button>
          </div>
        )}
      </div>

      <div class="row">
        <h3 class="section-title" style={{flex: 1}}>
          {L("Profils de mes amis", "My friends' profiles")}
        </h3>
        <button class="btn primary" onClick={() => setModal({type: "edit", profile: null, isMine: false})}>
          {L("Ajouter", "Add")}
        </button>
      </div>
      {friends.length ? (
        <div class="grid-2">
          {friends.map((p) => (
            <ProfileCard
              key={p.id}
              p={p}
              onEdit={() => setModal({type: "edit", profile: p, isMine: false})}
              onTest={() => setModal({type: "test", profile: p})}
              onExport={() => setModal({type: "export", profile: p})}
              onToggle={(on) => profiles.set((s) => ({friends: s.friends.map((f) => (f.id === p.id ? {...f, enabled: on} : f))}))}
              onDelete={async () =>
                (await confirmAction({
                  title: L(`Supprimer le profil de ${p.name} ?`, `Delete ${p.name}'s profile?`),
                  body: L(
                    "L'étiquette existante n'est pas supprimée : le prochain retri complet ne la gérera simplement plus.",
                    "The existing tag is not deleted: the next full re-sort will simply stop managing it.",
                  ),
                  confirm: L("Supprimer", "Delete"),
                  danger: true,
                })) &&
                profiles.set((s) => ({friends: s.friends.filter((f) => f.id !== p.id)}))
              }
            />
          ))}
        </div>
      ) : (
        <div class="empty">
          {L(
            "Aucun profil d'ami. Importez le code ou le fichier JSON d'un ami, ou créez son profil vous-même.",
            "No friend profiles. Import a friend's code or JSON file, or create their profile yourself.",
          )}
        </div>
      )}

      {modal?.type === "edit" && (
        <ProfileEditor
          initial={modal.profile}
          isMine={modal.isMine}
          onClose={() => setModal(null)}
          onSave={(p) => {
            if (modal.isMine) {
              profiles.set({mine: p});
              setModal(null);
            } else saveFriend(p);
          }}
        />
      )}
      {modal?.type === "export" && <ExportDialog profile={modal.profile} onClose={() => setModal(null)} />}
      {modal?.type === "import" && <ImportDialog onClose={() => setModal(null)} />}
      {modal?.type === "export-all" && <ExportAllDialog list={[...(mine ? [{...mine, name: me || mine.name}] : []), ...friends]} onClose={() => setModal(null)} />}
      {modal?.type === "test" && <TestDialog profile={modal.profile} onClose={() => setModal(null)} />}
    </div>
  );
}
