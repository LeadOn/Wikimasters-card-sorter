// Onglet « Familles » : groupes de cartes à collectionner, manuels ou intelligents.
import {useState, useEffect, useRef} from "preact/hooks";
import {useStore} from "../../lib/store";
import {owned, loadMyCollection} from "../../state/collection";
import {priceVersion, priceOf} from "../../state/prices";
import {
  families,
  createFamily,
  renameFamily,
  setRule,
  setCover,
  deleteFamily,
  addCard,
  removeCard,
  searchCatalog,
  refreshSmartFamily,
  missingOnMarket,
  exportFamily,
  importFamily,
  familyToTag,
  familyFromTag,
  myTags,
} from "../../features/families";
import {CardRow, Icon, Paged, Progress, Notice, Copyable, fmt, plural, duration} from "../components";
import {confirmAction, toast, errorMessage} from "../feedback";
import {THEME_COLORS, RARITIES, familyProgress} from "../../../../../core";

function Modal({title, wide, onClose, children}) {
  return (
    <div class="modal-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class={`modal${wide ? " wide" : ""}`}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function RuleEditor({family, onClose}) {
  const r = family.rule || {};
  const [query, setQuery] = useState(r.query || "");
  const [keywords, setKeywords] = useState(r.keywords || "");
  const [exclude, setExclude] = useState(r.exclude || "");
  const [themes, setThemes] = useState(r.themes || []);
  const [rarities, setRarities] = useState(r.rarities || []);
  const toggle = (list, set, x) => set(list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
  return (
    <Modal title={`Règle de « ${family.name} »`} wide onClose={onClose}>
      <label class="field">
        <span>Recherche dans le catalogue</span>
        <input type="text" value={query} onInput={(e) => setQuery(e.currentTarget.value)} placeholder="ex. Star Wars" />
        <span class="small">Envoyée à la recherche du site (titre, description). Le catalogue compte des millions de cartes : la recherche est obligatoire.</span>
      </label>
      <label class="field">
        <span>Mots-clés obligatoires (facultatif)</span>
        <input type="text" value={keywords} onInput={(e) => setKeywords(e.currentTarget.value)} placeholder="ex. jedi, sith, skywalker" />
      </label>
      <label class="field">
        <span>Exclusions (facultatif)</span>
        <input type="text" value={exclude} onInput={(e) => setExclude(e.currentTarget.value)} placeholder="ex. jeu vidéo" />
      </label>
      <div class="field">
        <span style={{fontWeight: 600}}>Thèmes (facultatif)</span>
        <div class="chips" style={{marginTop: "6px"}}>
          {Object.keys(THEME_COLORS).map((t) => <button key={t} class={`chip${themes.includes(t) ? " on" : ""}`} onClick={() => toggle(themes, setThemes, t)}>{t}</button>)}
        </div>
      </div>
      <div class="field">
        <span style={{fontWeight: 600}}>Raretés (facultatif)</span>
        <div class="chips" style={{marginTop: "6px"}}>
          {RARITIES.map((x) => <button key={x} class={`chip${rarities.includes(x) ? " on" : ""}`} onClick={() => toggle(rarities, setRarities, x)}>{x}</button>)}
        </div>
      </div>
      <div class="actions">
        <button class="btn ghost" onClick={onClose}>Annuler</button>
        <button
          class="btn primary"
          disabled={!query.trim()}
          onClick={() => {
            setRule(family.id, {query, keywords, exclude, themes, rarities});
            onClose();
          }}
        >
          Enregistrer
        </button>
      </div>
    </Modal>
  );
}

function AddCards({family, onClose}) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const fam = useStore(families).list.find((f) => f.id === family.id) || family;
  const inFamily = new Set(fam.cards.map((c) => c.id));
  const search = async (p = 0) => {
    if (q.trim().length < 2) return;
    setBusy(true);
    try {
      setRes(await searchCatalog(q.trim(), {page: p}));
      setPage(p);
    } catch (e) {
      toast(errorMessage(e), {type: "error"});
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`Ajouter des cartes à « ${fam.name} »`} wide onClose={onClose}>
      <form class="row" onSubmit={(e) => (e.preventDefault(), search(0))}>
        <input type="search" style={{flex: 1}} placeholder="Titre, description…" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
        <button class="btn primary" disabled={busy || q.trim().length < 2}>Rechercher</button>
      </form>
      {busy && <Progress label="Recherche" done={0} />}
      {res && (
        <div class="cards" style={{maxHeight: "55vh", overflow: "auto"}}>
          {res.cards.map((c) => (
            <CardRow
              key={c.id}
              card={c}
              action={inFamily.has(c.id) ? <button class="btn sm ghost" onClick={() => removeCard(fam.id, c.id)}>Retirer</button> : <button class="btn sm primary" onClick={() => addCard(fam.id, c)}>Ajouter</button>}
            />
          ))}
        </div>
      )}
      {res && (
        <div class="row">
          <button class="btn sm" disabled={!page || busy} onClick={() => search(page - 1)}>Précédent</button>
          <span class="small muted">Page {page + 1}</span>
          <button class="btn sm" disabled={!res.hasMore || busy} onClick={() => search(page + 1)}>Suivant</button>
          <span class="spacer" />
          <span class="small muted">{plural(fam.cards.length, "carte")} dans la famille</span>
        </div>
      )}
      <div class="actions"><button class="btn" onClick={onClose}>Terminé</button></div>
    </Modal>
  );
}

function MarketDialog({family, onClose}) {
  const ids = useStore(owned).ids;
  const [state, setState] = useState({progress: {done: 0, total: 0}});
  const abort = useRef(new AbortController());
  useEffect(() => {
    missingOnMarket(family, ids, {signal: abort.current.signal, onProgress: (done, total) => setState((s) => ({...s, progress: {done, total}}))})
      .then((offers) => setState((s) => ({...s, offers})))
      .catch((e) => setState({error: errorMessage(e)}));
    return () => abort.current.abort();
  }, []);
  return (
    <Modal title={`Cartes manquantes en vente · ${family.name}`} wide onClose={onClose}>
      {!state.offers && !state.error && <Progress label="Recherche sur le marché" done={state.progress.done} total={state.progress.total} />}
      {state.error && <Notice type="error">{state.error}</Notice>}
      {state.offers && !state.offers.length && <p class="help">Aucune carte manquante en vente pour l'instant.</p>}
      {state.offers?.length > 0 && (
        <div class="cards" style={{maxHeight: "55vh", overflow: "auto"}}>
          {state.offers.map(({card, auction}) => (
            <CardRow
              key={auction.id}
              card={{...auction.card, wikipedia_title: card.title}}
              rarity={auction.snapshot_rarity}
              badges={[{label: `${fmt(auction.current_bid ?? auction.base_amount)} ₩`, type: "accent"}, {label: duration(new Date(auction.end_at) - Date.now())}]}
              action={<a class="btn sm" href={`/marketplace/${auction.id}`}>Voir</a>}
            />
          ))}
        </div>
      )}
      <p class="small muted">Recherche limitée aux 40 premières cartes manquantes, pour ne pas surcharger le site.</p>
      <div class="actions"><button class="btn" onClick={onClose}>Fermer</button></div>
    </Modal>
  );
}

function FamilyDetail({family, onBack}) {
  const ids = useStore(owned).ids;
  useStore(priceVersion);
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState(null);
  const [refresh, setRefresh] = useState(null);
  const p = familyProgress(family, ids);
  const cards = family.cards.filter((c) => (filter === "owned" ? ids.has(c.id) : filter === "missing" ? !ids.has(c.id) : true));

  const doRefresh = async () => {
    setRefresh({page: 0, maxPages: 10, found: 0});
    try {
      const n = await refreshSmartFamily(family.id, {onProgress: setRefresh});
      toast(`${plural(n, "carte trouvée", "cartes trouvées")}.`, {type: "ok"});
    } catch (e) {
      toast(errorMessage(e), {type: "error"});
    } finally {
      setRefresh(null);
    }
  };
  const toTag = async () => {
    const ok = await confirmAction({
      title: `Créer l'étiquette « ${family.name} » ?`,
      body: `Vos ${plural(p.owned, "exemplaire")} des cartes de cette famille recevront une étiquette personnelle « ${family.name} » sur WikiMasters. Le tri automatique ne la modifiera jamais.`,
      confirm: "Créer l'étiquette",
    });
    if (!ok) return;
    try {
      const r = await familyToTag(family);
      toast(`Étiquette « ${r.tag} » ajoutée à ${plural(r.count, "exemplaire")}${r.failed ? ` (${r.failed} refusé(s) par le serveur)` : ""}.`, {type: r.failed ? "error" : "ok"});
    } catch (e) {
      toast(errorMessage(e), {type: "error"});
    }
  };

  return (
    <div class="stack">
      <div class="row">
        <button class="btn ghost" onClick={onBack}>
          <Icon name="back" size={16} /> Familles
        </button>
        <h2 class="section-title" style={{flex: 1, fontSize: "20px"}}>{family.name}</h2>
        <span class="chip accent">{family.kind === "smart" ? "Intelligente" : "Manuelle"}</span>
      </div>
      <div class="box stack">
        <div class="row">
          <strong style={{flex: 1}}>{fmt(p.owned)} / {fmt(p.total)} possédées ({p.percent} %)</strong>
          {family.kind === "smart" ? (
            <>
              <button class="btn sm" onClick={() => setModal("rule")}>Règle</button>
              <button class="btn sm primary" disabled={Boolean(refresh) || !family.rule?.query} onClick={doRefresh}>Actualiser</button>
            </>
          ) : (
            <button class="btn sm primary" onClick={() => setModal("add")}>Ajouter des cartes</button>
          )}
          <button class="btn sm" disabled={!p.missing} onClick={() => setModal("market")}>Manquantes en vente</button>
          <button class="btn sm" disabled={!p.owned} onClick={toTag}>En faire une étiquette</button>
          <button class="btn sm" onClick={() => setModal("export")}>Partager</button>
          <button
            class="btn sm ghost"
            onClick={async () => {
              const name = prompt("Nouveau nom de la famille", family.name);
              if (name?.trim()) renameFamily(family.id, name.trim());
            }}
          >
            Renommer
          </button>
          <button class="btn sm ghost" onClick={async () => (await confirmAction({title: `Supprimer « ${family.name} » ?`, confirm: "Supprimer", danger: true})) && (deleteFamily(family.id), onBack())}>
            Supprimer
          </button>
        </div>
        <div class="progress"><div style={{width: `${p.percent}%`}} /></div>
        {family.kind === "smart" && family.rule?.query && <p class="small muted">Recherche « {family.rule.query} »{family.rule.keywords ? ` · mots-clés : ${family.rule.keywords}` : ""}{family.rule.themes?.length ? ` · thèmes : ${family.rule.themes.join(", ")}` : ""}{family.rule.rarities?.length ? ` · raretés : ${family.rule.rarities.join(", ")}` : ""}</p>}
        {refresh && <Progress label={`Recherche dans le catalogue · ${plural(refresh.found, "carte retenue", "cartes retenues")}`} done={refresh.page} total={refresh.maxPages} />}
      </div>
      <div class="chips">
        {[["all", `Toutes (${p.total})`], ["owned", `Possédées (${p.owned})`], ["missing", `Manquantes (${p.missing})`]].map(([k, label]) => (
          <button key={k} class={`chip${filter === k ? " on" : ""}`} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>
      <Paged
        items={cards}
        empty={family.kind === "smart" ? "Définissez la règle puis cliquez sur « Actualiser »." : "Ajoutez des cartes depuis le catalogue."}
        render={(c) => (
          <CardRow
            key={c.id}
            card={{...c, wikipedia_title: c.title}}
            price={priceOf(c.id, c.rarity)}
            badges={[ids.has(c.id) ? {label: "possédée", type: "ok", icon: "check"} : {label: "manquante", type: "warn"}, family.cover === c.id && {label: "couverture", type: "accent", icon: "star"}]}
            action={
              <span class="row" style={{gap: "2px"}}>
                <button class="btn sm ghost" title="Image de la famille" aria-label="Image de la famille" onClick={() => setCover(family.id, c.id)}>
                  <Icon name="star" size={14} />
                </button>
                {family.kind === "manual" && (
                  <button class="btn sm ghost" title="Retirer" aria-label="Retirer" onClick={() => removeCard(family.id, c.id)}>
                    <Icon name="close" size={14} />
                  </button>
                )}
              </span>
            }
          />
        )}
      />
      {modal === "rule" && <RuleEditor family={family} onClose={() => setModal(null)} />}
      {modal === "add" && <AddCards family={family} onClose={() => setModal(null)} />}
      {modal === "market" && <MarketDialog family={family} onClose={() => setModal(null)} />}
      {modal === "export" && <ExportFamily family={family} onClose={() => setModal(null)} />}
    </div>
  );
}

function ExportFamily({family, onClose}) {
  const [code, setCode] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    exportFamily(family)
      .then(setCode)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  return (
    <Modal title={`Partager « ${family.name} »`} onClose={onClose}>
      <p class="help">Le code contient la liste des cartes (et la règle d'une famille intelligente), pas vos possessions.</p>
      {error ? <Notice type="error">{error}</Notice> : code ? <Copyable text={code} /> : <div class="spinner" />}
      <div class="actions"><button class="btn" onClick={onClose}>Fermer</button></div>
    </Modal>
  );
}

function CreateDialog({onClose, onCreated}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("manual");
  return (
    <Modal title="Nouvelle famille" onClose={onClose}>
      <label class="field">
        <span>Nom</span>
        <input type="text" value={name} onInput={(e) => setName(e.currentTarget.value)} placeholder="ex. Star Wars, Grands peintres…" />
      </label>
      <div class="stack" style={{gap: "8px"}}>
        <label class="check"><input type="radio" name="kind" checked={kind === "manual"} onChange={() => setKind("manual")} /> Manuelle : je choisis les cartes une à une</label>
        <label class="check"><input type="radio" name="kind" checked={kind === "smart"} onChange={() => setKind("smart")} /> Intelligente : remplie par une recherche et des filtres</label>
      </div>
      <div class="actions">
        <button class="btn ghost" onClick={onClose}>Annuler</button>
        <button class="btn primary" disabled={!name.trim()} onClick={() => onCreated(createFamily({name, kind, rule: kind === "smart" ? {query: name.trim()} : null}))}>Créer</button>
      </div>
    </Modal>
  );
}

function ImportDialog({onClose, onCreated}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  return (
    <Modal title="Importer une famille" onClose={onClose}>
      <textarea class="mono" rows={5} placeholder="WMT-F1.…" value={code} onInput={(e) => setCode(e.currentTarget.value)} />
      {error && <Notice type="error">{error}</Notice>}
      <div class="actions">
        <button class="btn ghost" onClick={onClose}>Annuler</button>
        <button
          class="btn primary"
          disabled={!code.trim()}
          onClick={async () => {
            try {
              onCreated(await importFamily(code));
            } catch (e) {
              setError(errorMessage(e));
            }
          }}
        >
          Importer
        </button>
      </div>
    </Modal>
  );
}

function FromTagDialog({onClose, onCreated}) {
  const [tags, setTags] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    myTags().then(setTags).catch((e) => toast(errorMessage(e), {type: "error"}));
  }, []);
  return (
    <Modal title="Famille à partir d'une étiquette" onClose={onClose}>
      {!tags && <Progress label="Lecture de vos étiquettes" done={0} />}
      {tags && (
        <div class="chips">
          {tags.map((t) => (
            <button
              key={t.id}
              class="chip"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  onCreated(await familyFromTag(t));
                } catch (e) {
                  toast(errorMessage(e), {type: "error"});
                  setBusy(false);
                }
              }}
            >
              <span class="swatch" style={{"--c": t.color}} />
              {t.name}
            </button>
          ))}
        </div>
      )}
      {busy && <Progress label="Création de la famille" done={0} />}
      <div class="actions"><button class="btn" onClick={onClose}>Annuler</button></div>
    </Modal>
  );
}

export function FamiliesTab() {
  const {list} = useStore(families);
  const ids = useStore(owned).ids;
  const [openId, setOpenId] = useState(null);
  const [modal, setModal] = useState(null);
  useEffect(() => {
    loadMyCollection().catch(() => {});
  }, []);
  const open = list.find((f) => f.id === openId);
  if (open) return <FamilyDetail family={open} onBack={() => setOpenId(null)} />;
  const created = (f) => {
    setModal(null);
    setOpenId(f.id);
  };
  return (
    <div class="stack">
      <div class="page-head">
        <div style={{flex: 1}}>
          <h2>Familles</h2>
          <p>Des groupes de cartes à compléter : choisissez-les une à une, ou laissez une recherche les remplir. Partagez-les par code.</p>
        </div>
        <button class="btn" onClick={() => setModal("tag")}>Depuis une étiquette</button>
        <button class="btn" onClick={() => setModal("import")}>Importer</button>
        <button class="btn primary" onClick={() => setModal("create")}>Nouvelle famille</button>
      </div>
      {!list.length && <div class="empty">Aucune famille pour l'instant.</div>}
      <div class="cards">
        {list.map((f) => {
          const p = familyProgress(f, ids);
          const cover = f.cards.find((c) => c.id === f.cover) || f.cards.find((c) => c.image_url);
          return (
            <div key={f.id} class="card" style={{cursor: "pointer"}} onClick={() => setOpenId(f.id)}>
              {cover?.image_url ? <img class="thumb" src={cover.image_url} alt="" referrerpolicy="no-referrer" /> : <div class="thumb" />}
              <div class="body">
                <div class="t">{f.name}</div>
                <div class="d">{f.kind === "smart" ? "Intelligente" : "Manuelle"} · {fmt(p.owned)} / {fmt(p.total)}</div>
                <div class="progress" style={{marginTop: "auto"}}><div style={{width: `${p.percent}%`}} /></div>
              </div>
            </div>
          );
        })}
      </div>
      {modal === "create" && <CreateDialog onClose={() => setModal(null)} onCreated={created} />}
      {modal === "import" && <ImportDialog onClose={() => setModal(null)} onCreated={created} />}
      {modal === "tag" && <FromTagDialog onClose={() => setModal(null)} onCreated={created} />}
    </div>
  );
}
