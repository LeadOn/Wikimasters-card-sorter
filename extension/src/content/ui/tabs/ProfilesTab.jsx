// Onglet « Profils » : mon profil d'intérêts et ceux de mes amis (tags « Pour : … »).
import {useState, useEffect} from "preact/hooks";
import {useStore} from "../../lib/store";
import {readSession} from "../../lib/session";
import {profiles, newId} from "../../state/profiles";
import {loadMyCollection} from "../../state/collection";
import {friendsState, loadFriends} from "../../features/trades";
import {Notice, Copyable, CardRow, fmt, plural} from "../components";
import {confirmAction, toast, errorMessage} from "../feedback";
import {
  THEME_COLORS,
  BUILTIN_PROFILES,
  simpleToProfile,
  validateProfile,
  profileTags,
  extractFields,
  categorize,
  tagForProfile,
  encodeShareCode,
  decodeShareCode,
} from "../../../../../core";

const THEMES = Object.keys(THEME_COLORS);
const PALETTE = ["#0ea5e9", "#ec4899", "#22c55e", "#eab308", "#dc2626", "#8b5cf6", "#14b8a6", "#f97316", "#64748b", "#4c1d95"];

function describeRules(p) {
  if (p.simple) {
    const parts = [];
    if (p.simple.themes?.length) parts.push(p.simple.themes.join(", "));
    if (p.simple.keywords) parts.push(`mots-clés : ${p.simple.keywords.split(/[,;\n]/).filter((k) => k.trim()).slice(0, 8).join(", ")}${p.simple.keywords.split(/[,;\n]/).length > 8 ? "…" : ""}`);
    return parts.join(" · ") || "Aucune règle";
  }
  return p.about || `${plural(p.rules?.length || 0, "règle")} avancée${(p.rules?.length || 0) > 1 ? "s" : ""}`;
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
      throw new Error(`Règles illisibles (JSON) : ${e.message}`);
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
        <h3>{isMine ? "Mon profil d'intérêts" : initial ? `Profil de ${initial.name}` : "Nouveau profil d'ami"}</h3>
        <p class="help">
          Les cartes qui correspondent reçoivent l'étiquette <strong>{name ? tagForProfile({name}) : "Pour : …"}</strong> lors du tri.
          {isMine ? " Il sert aussi à chercher les cartes à demander à vos amis." : " Il sert aussi à savoir quelles cartes lui proposer."}
        </p>
        <div class="row" style={{alignItems: "flex-end"}}>
          {!isMine && (
            <label class="field" style={{flex: 1, minWidth: "200px"}}>
              <span>Pseudo de l'ami (sur WikiMasters)</span>
              <input type="text" list="wmt-friends" value={name} onInput={(e) => setName(e.currentTarget.value)} placeholder="ex. Oaffew" />
              <datalist id="wmt-friends">{(friends || []).map((f) => <option key={f.id} value={f.username} />)}</datalist>
            </label>
          )}
          <label class="field">
            <span>Couleur</span>
            <input type="color" value={color} onInput={(e) => setColor(e.currentTarget.value)} />
          </label>
          <label class="field" style={{flex: 2, minWidth: "220px"}}>
            <span>Description</span>
            <input type="text" value={about} onInput={(e) => setAbout(e.currentTarget.value)} placeholder="ex. Serpents, Star Wars, rap français" />
          </label>
        </div>
        <div class="chips">
          <button class={`chip${mode === "simple" ? " on" : ""}`} onClick={() => switchMode("simple")}>Éditeur simple</button>
          <button class={`chip${mode === "advanced" ? " on" : ""}`} onClick={() => switchMode("advanced")}>Règles avancées</button>
        </div>
        {mode === "simple" ? (
          <div class="stack">
            <div class="field">
              <span style={{fontWeight: 600}}>Thèmes entiers</span>
              <div class="chips" style={{marginTop: "6px"}}>
                {THEMES.map((t) => (
                  <button key={t} class={`chip${themes.includes(t) ? " on" : ""}`} onClick={() => setThemes(themes.includes(t) ? themes.filter((x) => x !== t) : [...themes, t])}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <label class="field">
              <span>Mots-clés</span>
              <textarea value={keywords} onInput={(e) => setKeywords(e.currentTarget.value)} placeholder="requin, plongée, Star Wars, haltérophil*" />
              <span class="small">Séparés par des virgules. Cherchés dans le titre, la description et la 1re phrase de l'article. Un mot seul accepte son pluriel ; « * » en fin de mot accepte toutes les terminaisons.</span>
            </label>
            <label class="field">
              <span>Exclusions</span>
              <input type="text" value={exclude} onInput={(e) => setExclude(e.currentTarget.value)} placeholder="ex. Monty Python, langage" />
            </label>
            <label class="check">
              <input type="checkbox" checked={imageOnly} onChange={(e) => setImageOnly(e.currentTarget.checked)} /> Mots-clés : seulement les cartes qui ont une image
            </label>
          </div>
        ) : (
          <label class="field">
            <span>Règles (JSON)</span>
            <textarea class="mono" rows={12} value={rulesText} onInput={(e) => setRulesText(e.currentTarget.value)} />
            <span class="small">
              Chaque règle combine : <code>theme</code> (thème ou liste), <code>kw</code> (expression régulière, mots entiers), <code>field</code> ("title"), <code>with</code>, <code>unless</code>,{" "}
              <code>image</code> (true), <code>match</code> ("musicAlbum"). Le profil s'applique si une règle s'applique.
            </span>
          </label>
        )}
        {error && <Notice type="error">{error}</Notice>}
        <div class="actions">
          <button class="btn ghost" onClick={onClose}>Annuler</button>
          <button class="btn primary" onClick={save} disabled={!name.trim()}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

function ExportDialog({profile, onClose}) {
  const [code, setCode] = useState(null);
  useEffect(() => {
    const {id, enabled, ...rest} = profile;
    encodeShareCode("P", rest).then(setCode);
  }, []);
  return (
    <div class="modal-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="modal">
        <h3>Partager le profil « {profile.name} »</h3>
        <p class="help">Envoyez ce code à vos amis : dans leur Toolbox, onglet Profils, « Importer un code ».</p>
        {code ? <Copyable text={code} /> : <div class="spinner" />}
        <div class="actions"><button class="btn" onClick={onClose}>Fermer</button></div>
      </div>
    </div>
  );
}

function ImportDialog({onClose}) {
  const me = readSession()?.username;
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  const run = async () => {
    try {
      const {payload} = await decodeShareCode(code, "P");
      const problems = validateProfile(payload);
      if (problems.length) throw new Error(problems.join(" "));
      const p = {...payload, id: newId(), enabled: true};
      if (me && p.name.toLowerCase() === me.toLowerCase()) {
        profiles.set({mine: p});
        toast("Profil importé comme votre profil.", {type: "ok"});
      } else {
        profiles.set((s) => ({friends: [...s.friends.filter((f) => f.name.toLowerCase() !== p.name.toLowerCase()), p]}));
        toast(`Profil de ${p.name} importé.`, {type: "ok"});
      }
      onClose();
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <div class="modal-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="modal">
        <h3>Importer un profil</h3>
        <textarea class="mono" rows={5} placeholder="WMT-P1.…" value={code} onInput={(e) => setCode(e.currentTarget.value)} />
        {error && <Notice type="error">{error}</Notice>}
        <div class="actions">
          <button class="btn ghost" onClick={onClose}>Annuler</button>
          <button class="btn primary" onClick={run} disabled={!code.trim()}>Importer</button>
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
          const theme = categorize(c.card)[0];
          if (profileTags([profile], c.card, f, theme).length) matches.push({...c, theme});
        }
        setState({matches, total: seen.size});
      })
      .catch((e) => setState({error: errorMessage(e)}));
  }, []);
  return (
    <div class="modal-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="modal wide">
        <h3>Test du profil « {profile.name} » sur ma collection</h3>
        {state.loading && <div class="row"><div class="spinner" /> Lecture de la collection…</div>}
        {state.error && <Notice type="error">{state.error}</Notice>}
        {state.matches && (
          <>
            <p>{plural(state.matches.length, "carte")} sur {fmt(state.total)} recevraient l'étiquette « {tagForProfile(profile)} ».</p>
            <div class="cards" style={{maxHeight: "50vh", overflow: "auto"}}>
              {state.matches.slice(0, 120).map((c) => <CardRow key={c.id} card={c.card} rarity={c.rarity} theme={c.theme} />)}
            </div>
          </>
        )}
        <div class="actions"><button class="btn" onClick={onClose}>Fermer</button></div>
      </div>
    </div>
  );
}

function ProfileCard({p, isMine, onEdit, onDelete, onToggle, onExport, onTest}) {
  return (
    <div class="box stack" style={{borderLeft: `4px solid ${p.color || "#64748b"}`, gap: "8px"}}>
      <div class="row">
        <strong style={{flex: 1}}>{tagForProfile(p)}</strong>
        {!isMine && (
          <label class="check small muted">
            <input type="checkbox" checked={p.enabled !== false} onChange={(e) => onToggle(e.currentTarget.checked)} /> actif
          </label>
        )}
      </div>
      <p class="small muted">{describeRules(p)}</p>
      <div class="row">
        <button class="btn sm" onClick={onEdit}>Modifier</button>
        <button class="btn sm" onClick={onTest}>Tester</button>
        <button class="btn sm" onClick={onExport}>Partager</button>
        <span class="spacer" />
        <button class="btn sm ghost" onClick={onDelete}>Supprimer</button>
      </div>
    </div>
  );
}

export function ProfilesTab() {
  const {mine, friends} = useStore(profiles);
  const me = readSession()?.username;
  const [modal, setModal] = useState(null);
  const builtinMine = me && BUILTIN_PROFILES.find((p) => p.name.toLowerCase() === me.toLowerCase());
  const missingBuiltins = BUILTIN_PROFILES.filter((b) => b.name.toLowerCase() !== me?.toLowerCase() && !friends.some((f) => f.name.toLowerCase() === b.name.toLowerCase()));

  const saveFriend = (p) => {
    profiles.set((s) => ({friends: s.friends.some((f) => f.id === p.id) ? s.friends.map((f) => (f.id === p.id ? p : f)) : [...s.friends, p]}));
    setModal(null);
  };
  const importBuiltins = () => {
    profiles.set((s) => ({friends: [...s.friends, ...missingBuiltins.map((b) => ({...b, id: newId(), enabled: true}))]}));
    toast(`${plural(missingBuiltins.length, "profil importé", "profils importés")}.`, {type: "ok"});
  };

  return (
    <div class="stack">
      <div class="page-head">
        <div>
          <h2>Profils d'intérêts</h2>
          <p>Ce que chacun collectionne. Chaque profil donne une étiquette « Pour : pseudo » lors du tri, et guide la recherche d'échanges. Partagez votre profil par code avec vos amis.</p>
        </div>
      </div>

      <div class="box stack">
        <h3>Mon profil{me ? ` (${me})` : ""}</h3>
        {mine ? (
          <ProfileCard
            p={{...mine, name: me || mine.name}}
            isMine
            onEdit={() => setModal({type: "edit", profile: mine, isMine: true})}
            onTest={() => setModal({type: "test", profile: {...mine, name: me || mine.name}})}
            onExport={() => setModal({type: "export", profile: {...mine, name: me || mine.name}})}
            onDelete={async () => (await confirmAction({title: "Supprimer mon profil ?", confirm: "Supprimer", danger: true})) && profiles.set({mine: null})}
          />
        ) : (
          <div class="row">
            <p class="help" style={{flex: 1}}>Décrivez ce que vous collectionnez : vos amis pourront importer votre profil pour savoir quoi vous proposer.</p>
            {builtinMine && <button class="btn" onClick={() => profiles.set({mine: {...builtinMine, id: newId()}})}>Reprendre le profil de la bande</button>}
            <button class="btn primary" onClick={() => setModal({type: "edit", profile: null, isMine: true})}>Créer mon profil</button>
          </div>
        )}
      </div>

      <div class="row">
        <h3 style={{flex: 1, fontSize: "16px"}}>Profils de mes amis</h3>
        {missingBuiltins.length > 0 && <button class="btn" onClick={importBuiltins}>Profils de la bande ({missingBuiltins.length})</button>}
        <button class="btn" onClick={() => setModal({type: "import"})}>Importer un code</button>
        <button class="btn primary" onClick={() => setModal({type: "edit", profile: null, isMine: false})}>Ajouter</button>
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
                (await confirmAction({title: `Supprimer le profil de ${p.name} ?`, body: "L'étiquette existante n'est pas supprimée : le prochain retri complet ne la gérera simplement plus.", confirm: "Supprimer", danger: true})) &&
                profiles.set((s) => ({friends: s.friends.filter((f) => f.id !== p.id)}))
              }
            />
          ))}
        </div>
      ) : (
        <div class="empty">Aucun profil d'ami. Importez le code d'un ami, ou créez son profil vous-même.</div>
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
      {modal?.type === "test" && <TestDialog profile={modal.profile} onClose={() => setModal(null)} />}
    </div>
  );
}
