// Bloc de la Toolbox sur le profil d'un autre joueur : ses cartes qui m'intéressent et les miennes
// qui l'intéressent, cherchées sur place (même recherche que l'onglet « Échanges », état partagé).
import {useRef, useState} from "preact/hooks";
import {useStore} from "../../lib/store";
import {emit} from "../../lib/bus";
import {readSession} from "../../lib/session";
import {tradeState, findTradesWith} from "../../features/trades";
import {profiles, profileFor} from "../../state/profiles";
import {priceOf, priceVersion} from "../../state/prices";
import {CardRow, Mark, Progress, Notice, fmt, timeAgo} from "../components";
import {RARITIES} from "../../../../../core";
import {L} from "../../../shared/i18n";

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
            <CardRow key={c.id || c.card_id} card={c.card} theme={c.theme} price={priceOf(c.card_id, c.card.rarity, {shiny: c.is_shiny})} badges={badges(c)} />
          ))}
        </div>
      ) : (
        <p class="small muted">{empty}</p>
      )}
      {items.length > SHOWN && <span class="small muted">{L(`… et ${fmt(items.length - SHOWN)} autres dans la Toolbox`, `… and ${fmt(items.length - SHOWN)} more in the Toolbox`)}</span>}
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

  const start = (refresh = false) => {
    abort.current = new AbortController();
    findTradesWith({username}, {rarities, refresh, signal: abort.current.signal}).catch(() => {});
  };

  return (
    <section class="island" aria-label={L("Échanges WikiMasters Toolbox", "WikiMasters Toolbox trades")}>
      <div class="island-head">
        <Mark size={22} />
        <div>
          <div class="island-title">{L(`Échanges avec ${username}`, `Trades with ${username}`)}</div>
          <div class="island-sub">
            {theirProfile
              ? L(`Son profil d'intérêts : ${theirProfile.about || "défini"}`, `Their interest profile: ${theirProfile.about || "set"}`)
              : L("Pas de profil d'intérêts : vos doublons qu'il n'a pas lui seront proposés", "No interest profile: you will offer your duplicates they don't have")}
            {hasMyProfile ? "" : L(" · Vous n'avez pas encore de profil", " · You don't have a profile yet")}
          </div>
        </div>
        <div class="island-actions">
          {!theirProfile && (
            <button class="btn sm ghost" onClick={() => openTab("profiles")}>
              {L("Ajouter son profil", "Add their profile")}
            </button>
          )}
          {running ? (
            <button class="btn sm danger" onClick={() => abort.current?.abort()}>
              {L("Arrêter", "Stop")}
            </button>
          ) : (
            <button class="btn sm primary" disabled={busyElsewhere} title={busyElsewhere ? L("Une autre recherche est en cours", "Another search is in progress") : ""} onClick={() => start(false)}>
              {r ? L("Relancer", "Run again") : L("Chercher les cartes à échanger", "Find cards to trade")}
            </button>
          )}
        </div>
      </div>
      {!running && !r && (
        <div class="row small muted">
          {L("Raretés lues :", "Rarities read:")}
          <div class="chips">
            {RARITIES.map((x) => (
              <button key={x} class={`chip${rarities.includes(x) ? " on" : ""}`} onClick={() => setRarities(rarities.includes(x) ? rarities.filter((y) => y !== x) : [...rarities, x])}>
                {x}
              </button>
            ))}
          </div>
          <span>{rarities.length ? "" : L("toutes (une grosse collection peut prendre plusieurs minutes ; une lecture interrompue reprend où elle s'était arrêtée)", "all (a large collection can take several minutes; an interrupted read resumes where it left off)")}</span>
        </div>
      )}
      {running && <Progress done={s.progress?.done || 0} total={s.progress?.total} label={s.step || L("Préparation", "Preparing")} />}
      {s.error && !s.running && same(s.friend) && (
        <div class="row">
          <Notice type="error">{s.error}</Notice>
          {!hasMyProfile && (
            <button class="btn sm" onClick={() => openTab("profiles")}>
              {L("Créer mon profil", "Create my profile")}
            </button>
          )}
        </div>
      )}
      {r && !running && (
        <>
          <p class="small muted">
            {L(
              `Collection lue ${timeAgo(r.fetchedAt)} (${fmt(r.total)} cartes${r.rarities.length ? `, raretés ${r.rarities.join(", ")}` : ""}) · recherché : ${r.wanted.join(", ")}`,
              `Collection read ${timeAgo(r.fetchedAt)} (${fmt(r.total)} cards${r.rarities.length ? `, rarities ${r.rarities.join(", ")}` : ""}) · looking for: ${r.wanted.join(", ")}`,
            )}
          </p>
          <div class="grid-2" style={{gap: "12px"}}>
            <Column
              title={L("À lui demander", "To ask for")}
              items={r.toAsk}
              empty={L("Aucune de ses cartes ne correspond à ce que vous cherchez.", "None of their cards match what you are looking for.")}
              badges={(c) => [
                c.wished && {label: L("souhaitée", "wishlisted"), type: "danger", icon: "heart"},
                c.spare && {label: L(`${c.count} ex.`, `${c.count} copies`), type: "ok"},
                c.pending && {label: L("échange en cours", "trade pending"), type: "warn"},
              ]}
            />
            <Column
              title={L("À lui proposer", "To offer")}
              items={r.toOffer}
              empty={r.friendTag ? L("Aucune de vos cartes ne correspond à son profil.", "None of your cards match their profile.") : L("Aucun de vos doublons ne lui manque.", "They already have all your duplicates.")}
              badges={(c) => [c.spare && {label: L(`${c.copies} ex. chez vous`, `${c.copies} copies on your side`), type: "ok"}]}
            />
          </div>
          <div class="row">
            <button class="btn sm" onClick={() => openTab("trades")}>
              {L("Tout voir et composer une offre équilibrée", "See all and build a balanced offer")}
            </button>
            <button class="btn sm ghost" onClick={() => start(true)}>
              {L("Relire sa collection", "Reload their collection")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
