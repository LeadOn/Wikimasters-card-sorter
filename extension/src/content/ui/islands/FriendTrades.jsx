// Bloc de la Toolbox sur le profil d'un autre joueur : ses cartes qui m'intéressent et les miennes
// qui l'intéressent, cherchées sur place (même recherche que l'onglet « Échanges », état partagé).
import {useRef, useState} from "preact/hooks";
import {useStore} from "../../lib/store";
import {emit} from "../../lib/bus";
import {readSession} from "../../lib/session";
import {tradeState, findTradesWith} from "../../features/trades";
import {profiles, profileFor, newId} from "../../state/profiles";
import {priceOf, priceVersion} from "../../state/prices";
import {CardRow, Progress, Notice, fmt, timeAgo} from "../components";
import {RARITIES, BUILTIN_PROFILES} from "../../../../../core";

const SHOWN = 6;
const openTab = (tab) => emit("open-panel", {tab});

function Column({title, items, empty, badges}) {
  return (
    <div class="stack" style={{gap: "8px", minWidth: 0}}>
      <div class="row">
        <strong>{title}</strong>
        <span class="muted small">({fmt(items.length)})</span>
      </div>
      {items.length ? (
        <div class="cards mini">
          {items.slice(0, SHOWN).map((c) => (
            <CardRow key={c.id || c.card_id} card={c.card} theme={c.theme} price={c.price ?? priceOf(c.card_id, c.card.rarity)} badges={badges(c)} />
          ))}
        </div>
      ) : (
        <p class="small muted">{empty}</p>
      )}
      {items.length > SHOWN && <span class="small muted">… et {fmt(items.length - SHOWN)} autres dans la Toolbox</span>}
    </div>
  );
}

export function FriendTrades({username}) {
  const s = useStore(tradeState);
  useStore(profiles);
  useStore(priceVersion);
  const [rarities, setRarities] = useState([]);
  const abort = useRef(null);
  const same = (name) => (name || "").toLowerCase() === username.toLowerCase();
  const running = s.running && same(s.friend);
  const busyElsewhere = s.running && !running;
  const r = s.result && same(s.result.friend) ? s.result : null;
  const me = readSession()?.username;
  const hasMyProfile = Boolean(profileFor(me));
  const theirProfile = profileFor(username);
  // Profil fourni avec l'extension pour ce joueur : ajouté en un clic (réglage local, rien n'est écrit sur le site)
  const builtin = !theirProfile && BUILTIN_PROFILES.find((p) => p.name.toLowerCase() === username.toLowerCase());
  const useBuiltin = () =>
    profiles.set((st) => ({friends: [...st.friends.filter((f) => f.name.toLowerCase() !== username.toLowerCase()), {...builtin, id: newId(), enabled: true}]}));

  const start = (refresh = false) => {
    abort.current = new AbortController();
    findTradesWith({username}, {rarities, refresh, signal: abort.current.signal}).catch(() => {});
  };

  return (
    <section class="island" aria-label="Échanges WikiMasters Toolbox">
      <div class="island-head">
        <div class="logo">WM</div>
        <div>
          <div class="island-title">Échanges avec {username}</div>
          <div class="island-sub">
            {theirProfile ? `Son profil d'intérêts : ${theirProfile.about || "défini"}` : "Pas de profil d'intérêts : vos doublons qu'il n'a pas lui seront proposés"}
            {hasMyProfile ? "" : " · Vous n'avez pas encore de profil"}
          </div>
        </div>
        <div class="island-actions">
          {builtin ? (
            <button class="btn sm" onClick={useBuiltin} title={builtin.about || ""}>
              Utiliser son profil de la bande
            </button>
          ) : (
            !theirProfile && (
              <button class="btn sm ghost" onClick={() => openTab("profiles")}>
                Ajouter son profil
              </button>
            )
          )}
          {running ? (
            <button class="btn sm danger" onClick={() => abort.current?.abort()}>
              Arrêter
            </button>
          ) : (
            <button class="btn sm primary" disabled={busyElsewhere} title={busyElsewhere ? "Une autre recherche est en cours" : ""} onClick={() => start(false)}>
              {r ? "Relancer" : "Chercher les cartes à échanger"}
            </button>
          )}
        </div>
      </div>
      {!running && !r && (
        <div class="row small muted">
          Raretés lues :
          <div class="chips">
            {RARITIES.map((x) => (
              <button key={x} class={`chip${rarities.includes(x) ? " on" : ""}`} onClick={() => setRarities(rarities.includes(x) ? rarities.filter((y) => y !== x) : [...rarities, x])}>
                {x}
              </button>
            ))}
          </div>
          <span>{rarities.length ? "" : "toutes (une grosse collection peut prendre plusieurs minutes ; une lecture interrompue reprend où elle s'était arrêtée)"}</span>
        </div>
      )}
      {running && <Progress done={s.progress?.done || 0} total={s.progress?.total} label={s.step || "Préparation"} />}
      {s.error && !s.running && same(s.friend) && (
        <div class="row">
          <Notice type="error">{s.error}</Notice>
          {!hasMyProfile && (
            <button class="btn sm" onClick={() => openTab("profiles")}>
              Créer mon profil
            </button>
          )}
        </div>
      )}
      {r && !running && (
        <>
          <p class="small muted">
            Collection lue {timeAgo(r.fetchedAt)} ({fmt(r.total)} cartes{r.rarities.length ? `, raretés ${r.rarities.join(", ")}` : ""}) · recherché : {r.wanted.join(", ")}
          </p>
          <div class="grid-2" style={{gap: "12px"}}>
            <Column
              title="À lui demander"
              items={r.toAsk}
              empty="Aucune de ses cartes ne correspond à ce que vous cherchez."
              badges={(c) => [c.wished && {label: "♥ souhaitée", type: "danger"}, c.spare && {label: `${c.count} ex.`, type: "ok"}, c.pending && {label: "échange en cours", type: "warn"}]}
            />
            <Column
              title="À lui proposer"
              items={r.toOffer}
              empty={r.friendTag ? "Aucune de vos cartes ne correspond à son profil." : "Aucun de vos doublons ne lui manque."}
              badges={(c) => [c.spare && {label: `${c.copies} ex. chez vous`, type: "ok"}]}
            />
          </div>
          <div class="row">
            <button class="btn sm" onClick={() => openTab("trades")}>
              Tout voir et composer une offre équilibrée
            </button>
            <button class="btn sm ghost" onClick={() => start(true)}>
              Relire sa collection
            </button>
          </div>
        </>
      )}
    </section>
  );
}
