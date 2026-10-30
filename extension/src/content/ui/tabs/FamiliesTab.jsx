// Onglet « Familles » : groupes de cartes à collectionner, manuels ou intelligents.
import {useState, useEffect, useRef} from "preact/hooks";
import {useStore} from "../../lib/store";
import {owned, loadMyCollection} from "../../state/collection";
import {priceVersion, pricing} from "../../state/prices";
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
import {RARITIES, familyProgress} from "../../../../../core";
import {themeNames} from "../../state/themes";
import {L} from "../../../shared/i18n";

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
    <Modal title={L(`Règle de « ${family.name} »`, `Rule for "${family.name}"`)} wide onClose={onClose}>
      <label class="field">
        <span>{L("Recherche dans le catalogue", "Catalog search")}</span>
        <input type="text" value={query} onInput={(e) => setQuery(e.currentTarget.value)} placeholder={L("ex. Star Wars", "e.g. Star Wars")} />
        <span class="small">
          {L(
            "Envoyée à la recherche du site (titre, description). Le catalogue compte des millions de cartes : la recherche est obligatoire.",
            "Sent to the site's search (title, description). The catalog has millions of cards: a search is required.",
          )}
        </span>
      </label>
      <label class="field">
        <span>{L("Mots-clés obligatoires (facultatif)", "Required keywords (optional)")}</span>
        <input type="text" value={keywords} onInput={(e) => setKeywords(e.currentTarget.value)} placeholder={L("ex. jedi, sith, skywalker", "e.g. jedi, sith, skywalker")} />
      </label>
      <label class="field">
        <span>{L("Exclusions (facultatif)", "Exclusions (optional)")}</span>
        <input type="text" value={exclude} onInput={(e) => setExclude(e.currentTarget.value)} placeholder={L("ex. jeu vidéo", "e.g. jeu vidéo")} />
      </label>
      <div class="field">
        <span style={{fontWeight: 600}}>{L("Thèmes (facultatif)", "Themes (optional)")}</span>
        <div class="chips" style={{marginTop: "6px"}}>
          {[...new Set([...themeNames(), ...themes])].map((t) => <button key={t} class={`chip${themes.includes(t) ? " on" : ""}`} onClick={() => toggle(themes, setThemes, t)}>{t}</button>)}
        </div>
      </div>
      <div class="field">
        <span style={{fontWeight: 600}}>{L("Raretés (facultatif)", "Rarities (optional)")}</span>
        <div class="chips" style={{marginTop: "6px"}}>
          {RARITIES.map((x) => <button key={x} class={`chip${rarities.includes(x) ? " on" : ""}`} onClick={() => toggle(rarities, setRarities, x)}>{x}</button>)}
        </div>
      </div>
      <div class="actions">
        <button class="btn ghost" onClick={onClose}>{L("Annuler", "Cancel")}</button>
        <button
          class="btn primary"
          disabled={!query.trim()}
          onClick={() => {
            setRule(family.id, {query, keywords, exclude, themes, rarities});
            onClose();
          }}
        >
          {L("Enregistrer", "Save")}
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
    <Modal title={L(`Ajouter des cartes à « ${fam.name} »`, `Add cards to "${fam.name}"`)} wide onClose={onClose}>
      <form class="row" onSubmit={(e) => (e.preventDefault(), search(0))}>
        <input type="search" style={{flex: 1}} placeholder={L("Titre, description…", "Title, description…")} value={q} onInput={(e) => setQ(e.currentTarget.value)} />
        <button class="btn primary" disabled={busy || q.trim().length < 2}>{L("Rechercher", "Search")}</button>
      </form>
      {busy && <Progress label={L("Recherche", "Searching")} done={0} />}
      {res && (
        <div class="cards" style={{maxHeight: "55vh", overflow: "auto"}}>
          {res.cards.map((c) => (
            <CardRow
              key={c.id}
              card={c}
              action={inFamily.has(c.id) ? <button class="btn sm ghost" onClick={() => removeCard(fam.id, c.id)}>{L("Retirer", "Remove")}</button> : <button class="btn sm primary" onClick={() => addCard(fam.id, c)}>{L("Ajouter", "Add")}</button>}
            />
          ))}
        </div>
      )}
      {res && (
        <div class="row">
          <button class="btn sm" disabled={!page || busy} onClick={() => search(page - 1)}>{L("Précédent", "Previous")}</button>
          <span class="small muted">{L("Page", "Page")} {page + 1}</span>
          <button class="btn sm" disabled={!res.hasMore || busy} onClick={() => search(page + 1)}>{L("Suivant", "Next")}</button>
          <span class="spacer" />
          <span class="small muted">{L(`${plural(fam.cards.length, "carte")} dans la famille`, `${plural(fam.cards.length, "card")} in the family`)}</span>
        </div>
      )}
      <div class="actions"><button class="btn" onClick={onClose}>{L("Terminé", "Done")}</button></div>
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
    <Modal title={L(`Cartes manquantes en vente · ${family.name}`, `Missing cards for sale · ${family.name}`)} wide onClose={onClose}>
      {!state.offers && !state.error && <Progress label={L("Recherche sur le marché", "Searching the market")} done={state.progress.done} total={state.progress.total} />}
      {state.error && <Notice type="error">{state.error}</Notice>}
      {state.offers && !state.offers.length && <p class="help">{L("Aucune carte manquante en vente pour l'instant.", "No missing cards for sale right now.")}</p>}
      {state.offers?.length > 0 && (
        <div class="cards" style={{maxHeight: "55vh", overflow: "auto"}}>
          {state.offers.map(({card, auction}) => (
            <CardRow
              key={auction.id}
              card={{...auction.card, wikipedia_title: card.title}}
              rarity={auction.snapshot_rarity}
              badges={[{label: `${fmt(auction.current_bid ?? auction.base_amount)} ₩`, type: "accent"}, {label: duration(new Date(auction.end_at) - Date.now())}]}
              action={<a class="btn sm" href={`/marketplace/${auction.id}`}>{L("Voir", "View")}</a>}
            />
          ))}
        </div>
      )}
      <p class="small muted">
        {L("Recherche limitée aux 40 premières cartes manquantes, pour ne pas surcharger le site.", "Search limited to the first 40 missing cards, so as not to overload the site.")}
      </p>
      <div class="actions"><button class="btn" onClick={onClose}>{L("Fermer", "Close")}</button></div>
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
      toast(`${plural(n, L("carte trouvée", "card found"), L("cartes trouvées", "cards found"))}.`, {type: "ok"});
    } catch (e) {
      toast(errorMessage(e), {type: "error"});
    } finally {
      setRefresh(null);
    }
  };
  const toTag = async () => {
    const ok = await confirmAction({
      title: L(`Créer l'étiquette « ${family.name} » ?`, `Create the tag "${family.name}"?`),
      body: L(
        `Vos ${plural(p.owned, "exemplaire")} des cartes de cette famille recevront une étiquette personnelle « ${family.name} » sur WikiMasters. Le tri automatique ne la modifiera jamais.`,
        `Your ${plural(p.owned, "copy", "copies")} of this family's cards will get a personal tag "${family.name}" on WikiMasters. Automatic sorting will never change it.`,
      ),
      confirm: L("Créer l'étiquette", "Create tag"),
    });
    if (!ok) return;
    try {
      const r = await familyToTag(family);
      toast(
        L(
          `Étiquette « ${r.tag} » ajoutée à ${plural(r.count, "exemplaire")}${r.failed ? ` (${r.failed} refusé(s) par le serveur)` : ""}.`,
          `Tag "${r.tag}" added to ${plural(r.count, "copy", "copies")}${r.failed ? ` (${r.failed} rejected by the server)` : ""}.`,
        ),
        {type: r.failed ? "error" : "ok"},
      );
    } catch (e) {
      toast(errorMessage(e), {type: "error"});
    }
  };

  return (
    <div class="stack">
      <div class="row">
        <button class="btn ghost" onClick={onBack}>
          <Icon name="back" size={16} /> {L("Familles", "Families")}
        </button>
        <h2 class="section-title" style={{flex: 1, fontSize: "20px"}}>{family.name}</h2>
        <span class="chip accent">{family.kind === "smart" ? L("Intelligente", "Smart") : L("Manuelle", "Manual")}</span>
      </div>
      <div class="box stack">
        <div class="row">
          <strong style={{flex: 1}}>
            {fmt(p.owned)} / {fmt(p.total)} {L(`possédées (${p.percent} %)`, `owned (${p.percent}%)`)}
          </strong>
          {family.kind === "smart" ? (
            <>
              <button class="btn sm" onClick={() => setModal("rule")}>{L("Règle", "Rule")}</button>
              <button class="btn sm primary" disabled={Boolean(refresh) || !family.rule?.query} onClick={doRefresh}>{L("Actualiser", "Refresh")}</button>
            </>
          ) : (
            <button class="btn sm primary" onClick={() => setModal("add")}>{L("Ajouter des cartes", "Add cards")}</button>
          )}
          <button class="btn sm" disabled={!p.missing} onClick={() => setModal("market")}>{L("Manquantes en vente", "Missing for sale")}</button>
          <button class="btn sm" disabled={!p.owned} onClick={toTag}>{L("En faire une étiquette", "Turn into a tag")}</button>
          <button class="btn sm" onClick={() => setModal("export")}>{L("Partager", "Share")}</button>
          <button
            class="btn sm ghost"
            onClick={async () => {
              const name = prompt(L("Nouveau nom de la famille", "New family name"), family.name);
              if (name?.trim()) renameFamily(family.id, name.trim());
            }}
          >
            {L("Renommer", "Rename")}
          </button>
          <button
            class="btn sm ghost"
            onClick={async () =>
              (await confirmAction({title: L(`Supprimer « ${family.name} » ?`, `Delete "${family.name}"?`), confirm: L("Supprimer", "Delete"), danger: true})) && (deleteFamily(family.id), onBack())
            }
          >
            {L("Supprimer", "Delete")}
          </button>
        </div>
        <div class="progress"><div style={{width: `${p.percent}%`}} /></div>
        {family.kind === "smart" && family.rule?.query && (
          <p class="small muted">
            {L(`Recherche « ${family.rule.query} »`, `Search "${family.rule.query}"`)}
            {family.rule.keywords ? L(` · mots-clés : ${family.rule.keywords}`, ` · keywords: ${family.rule.keywords}`) : ""}
            {family.rule.themes?.length ? L(` · thèmes : ${family.rule.themes.join(", ")}`, ` · themes: ${family.rule.themes.join(", ")}`) : ""}
            {family.rule.rarities?.length ? L(` · raretés : ${family.rule.rarities.join(", ")}`, ` · rarities: ${family.rule.rarities.join(", ")}`) : ""}
          </p>
        )}
        {refresh && <Progress label={L(`Recherche dans le catalogue · ${plural(refresh.found, "carte retenue", "cartes retenues")}`, `Searching the catalog · ${plural(refresh.found, "card kept", "cards kept")}`)} done={refresh.page} total={refresh.maxPages} />}
      </div>
      <div class="chips">
        {[["all", L(`Toutes (${p.total})`, `All (${p.total})`)], ["owned", L(`Possédées (${p.owned})`, `Owned (${p.owned})`)], ["missing", L(`Manquantes (${p.missing})`, `Missing (${p.missing})`)]].map(([k, label]) => (
          <button key={k} class={`chip${filter === k ? " on" : ""}`} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>
      <Paged
        items={cards}
        empty={family.kind === "smart" ? L("Définissez la règle puis cliquez sur « Actualiser ».", "Set the rule, then click \"Refresh\".") : L("Ajoutez des cartes depuis le catalogue.", "Add cards from the catalog.")}
        render={(c) => (
          <CardRow
            key={c.id}
            card={{...c, wikipedia_title: c.title}}
            {...pricing(c.id, c.rarity)}
            badges={[ids.has(c.id) ? {label: L("possédée", "owned"), type: "ok", icon: "check"} : {label: L("manquante", "missing"), type: "warn"}, family.cover === c.id && {label: L("couverture", "cover"), type: "accent", icon: "star"}]}
            action={
              <span class="row" style={{gap: "2px"}}>
                <button class="btn sm ghost" title={L("Image de la famille", "Family image")} aria-label={L("Image de la famille", "Family image")} onClick={() => setCover(family.id, c.id)}>
                  <Icon name="star" size={14} />
                </button>
                {family.kind === "manual" && (
                  <button class="btn sm ghost" title={L("Retirer", "Remove")} aria-label={L("Retirer", "Remove")} onClick={() => removeCard(family.id, c.id)}>
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
    <Modal title={L(`Partager « ${family.name} »`, `Share "${family.name}"`)} onClose={onClose}>
      <p class="help">
        {L(
          "Le code contient la liste des cartes (et la règle d'une famille intelligente), pas vos possessions.",
          "The code contains the list of cards (and a smart family's rule), not what you own.",
        )}
      </p>
      {error ? <Notice type="error">{error}</Notice> : code ? <Copyable text={code} /> : <div class="spinner" />}
      <div class="actions"><button class="btn" onClick={onClose}>{L("Fermer", "Close")}</button></div>
    </Modal>
  );
}

function CreateDialog({onClose, onCreated}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("manual");
  return (
    <Modal title={L("Nouvelle famille", "New family")} onClose={onClose}>
      <label class="field">
        <span>{L("Nom", "Name")}</span>
        <input type="text" value={name} onInput={(e) => setName(e.currentTarget.value)} placeholder={L("ex. Star Wars, Grands peintres…", "e.g. Star Wars, Great painters…")} />
      </label>
      <div class="stack" style={{gap: "8px"}}>
        <label class="check"><input type="radio" name="kind" checked={kind === "manual"} onChange={() => setKind("manual")} /> {L("Manuelle : je choisis les cartes une à une", "Manual: I pick cards one by one")}</label>
        <label class="check"><input type="radio" name="kind" checked={kind === "smart"} onChange={() => setKind("smart")} /> {L("Intelligente : remplie par une recherche et des filtres", "Smart: filled by a search and filters")}</label>
      </div>
      <div class="actions">
        <button class="btn ghost" onClick={onClose}>{L("Annuler", "Cancel")}</button>
        <button class="btn primary" disabled={!name.trim()} onClick={() => onCreated(createFamily({name, kind, rule: kind === "smart" ? {query: name.trim()} : null}))}>
          {L("Créer", "Create")}
        </button>
      </div>
    </Modal>
  );
}

function ImportDialog({onClose, onCreated}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  return (
    <Modal title={L("Importer une famille", "Import a family")} onClose={onClose}>
      <textarea class="mono" rows={5} placeholder="WMT-F1.…" value={code} onInput={(e) => setCode(e.currentTarget.value)} />
      {error && <Notice type="error">{error}</Notice>}
      <div class="actions">
        <button class="btn ghost" onClick={onClose}>{L("Annuler", "Cancel")}</button>
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
          {L("Importer", "Import")}
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
    <Modal title={L("Famille à partir d'une étiquette", "Family from a tag")} onClose={onClose}>
      {!tags && <Progress label={L("Lecture de vos étiquettes", "Reading your tags")} done={0} />}
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
      {busy && <Progress label={L("Création de la famille", "Creating the family")} done={0} />}
      <div class="actions"><button class="btn" onClick={onClose}>{L("Annuler", "Cancel")}</button></div>
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
          <h2>{L("Familles", "Families")}</h2>
          <p>
            {L(
              "Des groupes de cartes à compléter : choisissez-les une à une, ou laissez une recherche les remplir. Partagez-les par code.",
              "Groups of cards to complete: pick them one by one, or let a search fill them. Share them by code.",
            )}
          </p>
        </div>
        <button class="btn" onClick={() => setModal("tag")}>{L("Depuis une étiquette", "From a tag")}</button>
        <button class="btn" onClick={() => setModal("import")}>{L("Importer", "Import")}</button>
        <button class="btn primary" onClick={() => setModal("create")}>{L("Nouvelle famille", "New family")}</button>
      </div>
      {!list.length && <div class="empty">{L("Aucune famille pour l'instant.", "No families yet.")}</div>}
      <div class="cards">
        {list.map((f) => {
          const p = familyProgress(f, ids);
          const cover = f.cards.find((c) => c.id === f.cover) || f.cards.find((c) => c.image_url);
          return (
            <div key={f.id} class="card" style={{cursor: "pointer"}} onClick={() => setOpenId(f.id)}>
              {cover?.image_url ? <img class="thumb" src={cover.image_url} alt="" referrerpolicy="no-referrer" /> : <div class="thumb" />}
              <div class="body">
                <div class="t">{f.name}</div>
                <div class="d">
                  {f.kind === "smart" ? L("Intelligente", "Smart") : L("Manuelle", "Manual")} · {fmt(p.owned)} / {fmt(p.total)}
                </div>
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
