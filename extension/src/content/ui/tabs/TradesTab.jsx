// Onglet « Échanges » : trouver quoi échanger avec un ami, proposition équilibrée, échanges en cours.
import {useState, useEffect, useMemo, useRef} from "preact/hooks";
import {useStore} from "../../lib/store";
import {readSession} from "../../lib/session";
import {friendsState, tradeState, loadFriends, findTradesWith, activeTrades, refreshTrades} from "../../features/trades";
import {profileFor} from "../../state/profiles";
import {priceOf, priceVersion, loadPrices} from "../../state/prices";
import {CardRow, Paged, Progress, Notice, fmt, plural, timeAgo} from "../components";
import {toast, errorMessage} from "../feedback";
import {RARITIES, balanceOffer} from "../../../../../core";
import {themeNames} from "../../state/themes";
import {L} from "../../../shared/i18n";

function countBy(list, key) {
  const m = new Map();
  for (const x of list) m.set(key(x), (m.get(key(x)) || 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]);
}

function Section({title, items, render, extra}) {
  const [theme, setTheme] = useState(null);
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    return items.filter((c) => (!theme || c.theme === theme) && (!text || `${c.card.wikipedia_title} ${c.card.category || ""}`.toLowerCase().includes(text)));
  }, [items, theme, q]);
  return (
    <div class="box stack">
      <div class="row">
        <h3 style={{flex: 1}}>{title} <span class="muted">({fmt(items.length)})</span></h3>
        {extra}
        <input type="search" placeholder={L("Filtrer…", "Filter…")} style={{maxWidth: "220px"}} value={q} onInput={(e) => setQ(e.currentTarget.value)} />
      </div>
      <div class="chips">
        {countBy(items, (c) => c.theme).map(([t, n]) => (
          <button key={t} class={`chip${theme === t ? " on" : ""}`} onClick={() => setTheme(theme === t ? null : t)}>
            {t} · {n}
          </button>
        ))}
      </div>
      <Paged items={filtered} render={render} empty={L("Aucune carte ne correspond.", "No matching cards.")} />
    </div>
  );
}

function ActiveTrades() {
  const {list, at} = useStore(activeTrades);
  useStore(priceVersion);
  const me = readSession()?.userId;
  useEffect(() => {
    if (!list) refreshTrades().catch(() => {});
  }, []);
  const pending = (list || []).filter((t) => t.status === "pending");
  useEffect(() => {
    const items = pending.flatMap((t) => (t.items || []).map((i) => ({id: i.card_id, rarity: i.snapshot_rarity || i.card?.rarity})));
    if (items.length) loadPrices(items);
  }, [list]);
  // Prix fiable de l'exemplaire échangé (shiny ou non), null sinon
  const itemPrice = (i) => priceOf(i.card_id, i.snapshot_rarity || i.card?.rarity, {shiny: i.is_shiny});
  const side = (t, userId) => {
    const items = (t.items || []).filter((i) => i.offered_by === userId);
    const total = items.reduce((n, i) => n + (itemPrice(i) || 0), 0);
    const bidous = userId === t.initiator_id ? t.initiator_wikibidous || 0 : t.recipient_wikibidous || 0;
    return {items, total: total + bidous, bidous, unknown: items.filter((i) => itemPrice(i) == null).length};
  };
  return (
    <div class="box stack">
      <div class="row">
        <h3 style={{flex: 1}}>{L("Échanges en cours", "Active trades")}</h3>
        <span class="small muted">{at ? L(`mis à jour ${timeAgo(at)}`, `updated ${timeAgo(at)}`) : ""}</span>
        <button class="btn sm" onClick={() => refreshTrades().catch((e) => toast(errorMessage(e), {type: "error"}))}>{L("Actualiser", "Refresh")}</button>
      </div>
      {!pending.length && <p class="help">{L("Aucun échange en attente.", "No pending trades.")}</p>}
      {pending.map((t) => {
        const other = t.initiator_id === me ? t.recipient : t.initiator;
        const mineSide = side(t, me);
        const theirSide = side(t, other?.id);
        const diff = theirSide.total - mineSide.total;
        return (
          <div key={t.id} class="stack" style={{gap: "6px", paddingTop: "8px", borderTop: "1px solid var(--line)"}}>
            <div class="row">
              <strong style={{flex: 1}}>{t.initiator_id === me ? L(`Envoyé à ${other?.username}`, `Sent to ${other?.username}`) : L(`Reçu de ${other?.username}`, `Received from ${other?.username}`)}</strong>
              <span class={`chip ${diff >= 0 ? "ok" : "warn"}`}>{diff >= 0 ? "+" : ""}{fmt(diff)} ₩ {L("pour moi", "for me")}</span>
            </div>
            <div class="grid-2" style={{gap: "8px"}}>
              <div class="small">
                <div class="muted">{L("Je donne", "I give")} · {fmt(mineSide.total)} ₩{mineSide.unknown ? L(` (${mineSide.unknown} sans prix fiable)`, ` (${mineSide.unknown} without a reliable price)`) : ""}</div>
                {mineSide.items.map((i) => <div key={i.id}>{i.card?.wikipedia_title || i.card_id} <span class="muted">{i.snapshot_rarity}{i.is_shiny ? " shiny" : ""}</span> · {fmt(itemPrice(i))} ₩</div>)}
                {mineSide.bidous > 0 && <div>+ {fmt(mineSide.bidous)} WikiBidous</div>}
              </div>
              <div class="small">
                <div class="muted">{L("Je reçois", "I get")} · {fmt(theirSide.total)} ₩{theirSide.unknown ? L(` (${theirSide.unknown} sans prix fiable)`, ` (${theirSide.unknown} without a reliable price)`) : ""}</div>
                {theirSide.items.map((i) => <div key={i.id}>{i.card?.wikipedia_title || i.card_id} <span class="muted">{i.snapshot_rarity}{i.is_shiny ? " shiny" : ""}</span> · {fmt(itemPrice(i))} ₩</div>)}
                {theirSide.bidous > 0 && <div>+ {fmt(theirSide.bidous)} WikiBidous</div>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TradesTab() {
  const friends = useStore(friendsState);
  const s = useStore(tradeState);
  useStore(priceVersion);
  const [friend, setFriend] = useState("");
  const [useThemes, setUseThemes] = useState(false);
  const [themes, setThemes] = useState([]);
  const [rarities, setRarities] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [balance, setBalance] = useState(null);
  const abort = useRef(null);
  const me = readSession()?.username;

  useEffect(() => {
    if (!friends.list && !friends.loading) loadFriends().catch(() => {});
  }, []);
  useEffect(() => {
    setSelected(new Set());
    setBalance(null);
  }, [s.result]);

  const start = async (refresh = false) => {
    const f = friends.list?.find((x) => x.username === friend);
    if (!f) return;
    abort.current = new AbortController();
    try {
      await findTradesWith(f, {themes: useThemes ? themes : null, rarities, refresh, signal: abort.current.signal});
    } catch (e) {
      if (e.name !== "AbortError") toast(errorMessage(e), {type: "error"});
    }
  };

  const r = s.result;
  // Prix recalculé à chaque affichage : les prix arrivent après la recherche, et les réglages peuvent changer
  const price = (c) => priceOf(c.card_id, c.card.rarity, {shiny: c.is_shiny});
  const target = r ? r.toAsk.filter((c) => selected.has(c.id)).reduce((n, c) => n + (price(c) || 0), 0) : 0;
  const chosen = useMemo(() => new Set(balance?.chosen.map((c) => c.card_id) || []), [balance]);
  const offerItems = useMemo(() => (r && balance ? [...r.toOffer].sort((a, b) => chosen.has(b.card_id) - chosen.has(a.card_id)) : r?.toOffer || []), [r, balance]);

  const loadVisiblePrices = () => {
    const items = [...r.toAsk, ...r.toOffer].map((c) => ({id: c.card_id, rarity: c.card.rarity}));
    loadPrices(items);
    const n = new Set(items.map((x) => x.id)).size;
    toast(L(`Chargement des prix de ${plural(n, "carte")}…`, `Loading prices for ${plural(n, "card")}…`));
  };

  return (
    <div class="stack">
      <div class="page-head">
        <div>
          <h2>{L("Échanges", "Trades")}</h2>
          <p>
            {L(
              "Les cartes d'un ami qui vous intéressent (votre profil ou votre liste de souhaits), et les vôtres qui l'intéressent (son profil, sinon vos doublons qu'il n'a pas).",
              "A friend's cards that interest you (your profile or wishlist), and yours that interest them (their profile, or else your duplicates they don't have).",
            )}
          </p>
        </div>
      </div>

      <div class="box stack">
        <div class="row" style={{alignItems: "flex-end"}}>
          <label class="field" style={{minWidth: "220px", flex: 1}}>
            <span>{L("Ami", "Friend")}</span>
            <select value={friend} onChange={(e) => setFriend(e.currentTarget.value)}>
              <option value="">{friends.loading ? L("Chargement…", "Loading…") : L("Choisir un ami", "Choose a friend")}</option>
              {(friends.list || []).map((f) => (
                <option key={f.id} value={f.username}>
                  {f.username}
                  {profileFor(f.username) ? "" : L(" (sans profil)", " (no profile)")}
                </option>
              ))}
            </select>
          </label>
          <div class="field">
            <span style={{fontWeight: 600, fontSize: "13px"}}>{L("Raretés lues (vide = toutes)", "Rarities to read (empty = all)")}</span>
            <div class="chips" style={{marginTop: "5px"}}>
              {RARITIES.map((x) => (
                <button key={x} class={`chip${rarities.includes(x) ? " on" : ""}`} onClick={() => setRarities(rarities.includes(x) ? rarities.filter((y) => y !== x) : [...rarities, x])}>
                  {x}
                </button>
              ))}
            </div>
          </div>
        </div>
        <label class="check">
          <input type="checkbox" checked={useThemes} onChange={(e) => setUseThemes(e.currentTarget.checked)} />
          {L("Chercher des thèmes précis plutôt que mon profil", "Search for specific themes instead of my profile")}
          {!profileFor(me) && !useThemes ? L(" (vous n'avez pas encore de profil)", " (you don't have a profile yet)") : ""}
        </label>
        {useThemes && (
          <div class="chips">
            {themeNames().map((t) => (
              <button key={t} class={`chip${themes.includes(t) ? " on" : ""}`} onClick={() => setThemes(themes.includes(t) ? themes.filter((x) => x !== t) : [...themes, t])}>
                {t}
              </button>
            ))}
          </div>
        )}
        <div class="row">
          {!s.running ? (
            <>
              <button class="btn primary" disabled={!friend || (useThemes && !themes.length)} onClick={() => start(false)}>{L("Chercher", "Search")}</button>
              {r && r.friend === friend && <button class="btn ghost" onClick={() => start(true)}>{L("Relire sa collection", "Reload their collection")}</button>}
            </>
          ) : (
            <button class="btn danger" onClick={() => abort.current?.abort()}>{L("Arrêter", "Stop")}</button>
          )}
          <span class="small muted">
            {L(
              "La collection d'un ami est lue page par page (jusqu'à 30 s par page côté serveur) puis gardée 12 h. Une lecture interrompue reprend où elle s'était arrêtée. Filtrer les raretés accélère beaucoup.",
              "A friend's collection is read page by page (up to 30 s per page on the server side), then kept for 12 hours. An interrupted read resumes where it stopped. Filtering rarities speeds things up a lot.",
            )}
          </span>
        </div>
        {s.running && <Progress done={s.progress?.done || 0} total={s.progress?.total} label={s.step} />}
        {s.error && !s.running && <Notice type="error">{s.error}</Notice>}
      </div>

      {r && !s.running && (
        <>
          <div class="row small muted">
            {L(
              `Collection de ${r.friend} lue ${timeAgo(r.fetchedAt)} (${fmt(r.total)} cartes${r.rarities.length ? `, raretés ${r.rarities.join(", ")}` : ""}) · recherché : ${r.wanted.join(", ")}`,
              `${r.friend}'s collection read ${timeAgo(r.fetchedAt)} (${fmt(r.total)} cards${r.rarities.length ? `, rarities ${r.rarities.join(", ")}` : ""}) · searched for: ${r.wanted.join(", ")}`,
            )}
            <span class="spacer" />
            <button class="btn sm" onClick={loadVisiblePrices}>{L("Charger les prix", "Load prices")}</button>
          </div>
          {selected.size > 0 && (
            <div class="box row">
              <span style={{flex: 1}}>
                {L(`${plural(selected.size, "carte sélectionnée", "cartes sélectionnées")} · valeur ${fmt(target)} ₩`, `${plural(selected.size, "card")} selected · value ${fmt(target)} ₩`)}
                {balance &&
                  L(
                    ` · offre proposée : ${plural(balance.chosen.length, "carte")} pour ${fmt(balance.total)} ₩`,
                    ` · suggested offer: ${plural(balance.chosen.length, "card")} for ${fmt(balance.total)} ₩`,
                  )}
              </span>
              <button class="btn sm ghost" onClick={() => (setSelected(new Set()), setBalance(null))}>{L("Effacer", "Clear")}</button>
              <button class="btn sm primary" disabled={!target} onClick={() => setBalance(balanceOffer(target, r.toOffer.map((c) => ({...c, price: price(c)}))))}>
                {L("Proposer une offre équilibrée", "Suggest a balanced offer")}
              </button>
            </div>
          )}
          <Section
            title={L(`À demander à ${r.friend}`, `To ask ${r.friend} for`)}
            items={r.toAsk}
            render={(c) => (
              <CardRow
                key={c.id}
                card={c.card}
                theme={c.theme}
                price={price(c)}
                selected={selected.has(c.id)}
                onClick={() => {
                  const next = new Set(selected);
                  next.has(c.id) ? next.delete(c.id) : next.add(c.id);
                  setSelected(next);
                  setBalance(null);
                }}
                badges={[
                  c.wished && {label: L("souhaitée", "wishlisted"), type: "danger", icon: "heart"},
                  c.spare && {label: L(`${c.count} ex.`, `${c.count} copies`), type: "ok"},
                  c.is_shiny && {label: "shiny", type: "warn", icon: "shine"},
                  c.pending && {label: L("échange en cours", "trade pending"), type: "warn"},
                ]}
              />
            )}
          />
          <Section
            title={L(`À proposer à ${r.friend}${r.friendTag ? "" : " (mes doublons qu'il n'a pas)"}`, `To offer ${r.friend}${r.friendTag ? "" : " (my duplicates they don't have)"}`)}
            items={offerItems}
            render={(c) => (
              <CardRow key={c.card_id} card={c.card} theme={c.theme} price={price(c)} selected={chosen.has(c.card_id)} badges={[c.spare && {label: L(`${c.copies} ex. chez moi`, `I own ${c.copies}`), type: "ok"}]} />
            )}
          />
        </>
      )}

      <ActiveTrades />
    </div>
  );
}
