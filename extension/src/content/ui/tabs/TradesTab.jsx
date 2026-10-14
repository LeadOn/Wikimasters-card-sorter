// Onglet « Échanges » : trouver quoi échanger avec un ami, proposition équilibrée, échanges en cours.
import {useState, useEffect, useMemo, useRef} from "preact/hooks";
import {useStore} from "../../lib/store";
import {readSession} from "../../lib/session";
import {friendsState, tradeState, loadFriends, findTradesWith, activeTrades, refreshTrades} from "../../features/trades";
import {profileFor} from "../../state/profiles";
import {priceOf, priceVersion, loadPrices} from "../../state/prices";
import {CardRow, Paged, Progress, Notice, fmt, plural, timeAgo} from "../components";
import {toast, errorMessage} from "../feedback";
import {THEME_COLORS, RARITIES, balanceOffer} from "../../../../../core";

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
        <input type="search" placeholder="Filtrer…" style={{maxWidth: "220px"}} value={q} onInput={(e) => setQ(e.currentTarget.value)} />
      </div>
      <div class="chips">
        {countBy(items, (c) => c.theme).map(([t, n]) => (
          <button key={t} class={`chip${theme === t ? " on" : ""}`} onClick={() => setTheme(theme === t ? null : t)}>
            {t} · {n}
          </button>
        ))}
      </div>
      <Paged items={filtered} render={render} empty="Aucune carte ne correspond." />
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
        <h3 style={{flex: 1}}>Échanges en cours</h3>
        <span class="small muted">{at ? `mis à jour ${timeAgo(at)}` : ""}</span>
        <button class="btn sm" onClick={() => refreshTrades().catch((e) => toast(errorMessage(e), {type: "error"}))}>Actualiser</button>
      </div>
      {!pending.length && <p class="help">Aucun échange en attente.</p>}
      {pending.map((t) => {
        const other = t.initiator_id === me ? t.recipient : t.initiator;
        const mineSide = side(t, me);
        const theirSide = side(t, other?.id);
        const diff = theirSide.total - mineSide.total;
        return (
          <div key={t.id} class="stack" style={{gap: "6px", paddingTop: "8px", borderTop: "1px solid var(--line)"}}>
            <div class="row">
              <strong style={{flex: 1}}>{t.initiator_id === me ? `Envoyé à ${other?.username}` : `Reçu de ${other?.username}`}</strong>
              <span class={`chip ${diff >= 0 ? "ok" : "warn"}`}>{diff >= 0 ? "+" : ""}{fmt(diff)} ₩ pour moi</span>
            </div>
            <div class="grid-2" style={{gap: "8px"}}>
              <div class="small">
                <div class="muted">Je donne · {fmt(mineSide.total)} ₩{mineSide.unknown ? ` (${mineSide.unknown} sans prix fiable)` : ""}</div>
                {mineSide.items.map((i) => <div key={i.id}>{i.card?.wikipedia_title || i.card_id} <span class="muted">{i.snapshot_rarity}{i.is_shiny ? " shiny" : ""}</span> · {fmt(itemPrice(i))} ₩</div>)}
                {mineSide.bidous > 0 && <div>+ {fmt(mineSide.bidous)} WikiBidous</div>}
              </div>
              <div class="small">
                <div class="muted">Je reçois · {fmt(theirSide.total)} ₩{theirSide.unknown ? ` (${theirSide.unknown} sans prix fiable)` : ""}</div>
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
    toast(`Chargement des prix de ${plural(new Set(items.map((x) => x.id)).size, "carte")}…`);
  };

  return (
    <div class="stack">
      <div class="page-head">
        <div>
          <h2>Échanges</h2>
          <p>Les cartes d'un ami qui vous intéressent (votre profil ou votre liste de souhaits), et les vôtres qui l'intéressent (son profil, sinon vos doublons qu'il n'a pas).</p>
        </div>
      </div>

      <div class="box stack">
        <div class="row" style={{alignItems: "flex-end"}}>
          <label class="field" style={{minWidth: "220px", flex: 1}}>
            <span>Ami</span>
            <select value={friend} onChange={(e) => setFriend(e.currentTarget.value)}>
              <option value="">{friends.loading ? "Chargement…" : "Choisir un ami"}</option>
              {(friends.list || []).map((f) => (
                <option key={f.id} value={f.username}>
                  {f.username}
                  {profileFor(f.username) ? "" : " (sans profil)"}
                </option>
              ))}
            </select>
          </label>
          <div class="field">
            <span style={{fontWeight: 600, fontSize: "13px"}}>Raretés lues (vide = toutes)</span>
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
          Chercher des thèmes précis plutôt que mon profil{!profileFor(me) && !useThemes ? " (vous n'avez pas encore de profil)" : ""}
        </label>
        {useThemes && (
          <div class="chips">
            {Object.keys(THEME_COLORS).map((t) => (
              <button key={t} class={`chip${themes.includes(t) ? " on" : ""}`} onClick={() => setThemes(themes.includes(t) ? themes.filter((x) => x !== t) : [...themes, t])}>
                {t}
              </button>
            ))}
          </div>
        )}
        <div class="row">
          {!s.running ? (
            <>
              <button class="btn primary" disabled={!friend || (useThemes && !themes.length)} onClick={() => start(false)}>Chercher</button>
              {r && r.friend === friend && <button class="btn ghost" onClick={() => start(true)}>Relire sa collection</button>}
            </>
          ) : (
            <button class="btn danger" onClick={() => abort.current?.abort()}>Arrêter</button>
          )}
          <span class="small muted">
            La collection d'un ami est lue page par page (jusqu'à 30 s par page côté serveur) puis gardée 12 h. Une lecture interrompue reprend où elle s'était arrêtée. Filtrer les raretés accélère beaucoup.
          </span>
        </div>
        {s.running && <Progress done={s.progress?.done || 0} total={s.progress?.total} label={s.step} />}
        {s.error && !s.running && <Notice type="error">{s.error}</Notice>}
      </div>

      {r && !s.running && (
        <>
          <div class="row small muted">
            Collection de {r.friend} lue {timeAgo(r.fetchedAt)} ({fmt(r.total)} cartes{r.rarities.length ? `, raretés ${r.rarities.join(", ")}` : ""}) · recherché : {r.wanted.join(", ")}
            <span class="spacer" />
            <button class="btn sm" onClick={loadVisiblePrices}>Charger les prix</button>
          </div>
          {selected.size > 0 && (
            <div class="box row">
              <span style={{flex: 1}}>
                {plural(selected.size, "carte sélectionnée", "cartes sélectionnées")} · valeur {fmt(target)} ₩
                {balance && ` · offre proposée : ${plural(balance.chosen.length, "carte")} pour ${fmt(balance.total)} ₩`}
              </span>
              <button class="btn sm ghost" onClick={() => (setSelected(new Set()), setBalance(null))}>Effacer</button>
              <button class="btn sm primary" disabled={!target} onClick={() => setBalance(balanceOffer(target, r.toOffer.map((c) => ({...c, price: price(c)}))))}>
                Proposer une offre équilibrée
              </button>
            </div>
          )}
          <Section
            title={`À demander à ${r.friend}`}
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
                badges={[c.wished && {label: "souhaitée", type: "danger", icon: "heart"}, c.spare && {label: `${c.count} ex.`, type: "ok"}, c.is_shiny && {label: "shiny", type: "warn", icon: "shine"}, c.pending && {label: "échange en cours", type: "warn"}]}
              />
            )}
          />
          <Section
            title={`À proposer à ${r.friend}${r.friendTag ? "" : " (mes doublons qu'il n'a pas)"}`}
            items={offerItems}
            render={(c) => (
              <CardRow key={c.card_id} card={c.card} theme={c.theme} price={price(c)} selected={chosen.has(c.card_id)} badges={[c.spare && {label: `${c.copies} ex. chez moi`, type: "ok"}]} />
            )}
          />
        </>
      )}

      <ActiveTrades />
    </div>
  );
}
