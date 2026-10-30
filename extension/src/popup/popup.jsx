// Popup de l'extension : actions rapides sur l'onglet WikiMasters actif.
import {render} from "preact";
import {useEffect, useState} from "preact/hooks";
import {Icon, Mark} from "../shared/Brand";
import fontsCss from "../shared/fonts.css";
import css from "./popup.css";
import {L, LANG} from "../shared/i18n";

const ext = globalThis.browser?.runtime?.id ? globalThis.browser : globalThis.chrome;
const SITE = "https://www.wiki-masters.com/";
const isSite = (url) => /^https:\/\/(www\.)?wiki-masters\.com\//.test(url || "");

function Popup() {
  const [tab, setTab] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    ext.tabs.query({active: true, currentWindow: true}).then(async ([t]) => {
      setTab(t || null);
      if (!t || !isSite(t.url)) return;
      try {
        setStatus(await ext.tabs.sendMessage(t.id, {type: "status"}));
      } catch {
        setError(L("Rechargez la page WikiMasters pour activer la Toolbox.", "Reload the WikiMasters page to enable the Toolbox."));
      }
    });
  }, []);

  const send = async (msg) => {
    try {
      await ext.tabs.sendMessage(tab.id, msg);
      window.close();
    } catch {
      setError(L("Rechargez la page WikiMasters pour activer la Toolbox.", "Reload the WikiMasters page to enable the Toolbox."));
    }
  };

  const onSite = tab && isSite(tab.url);
  return (
    <div class="wrap">
      <div class="head">
        <Mark size={24} />
        <div>
          <div class="title">WikiMasters Toolbox</div>
          <div class="sub">{onSite ? (status?.connected ? L(`connecté · ${status.username || "joueur"}`, `signed in · ${status.username || "player"}`) : status ? L("non connecté à WikiMasters", "not signed in to WikiMasters") : "…") : L("ouvrez WikiMasters pour commencer", "open WikiMasters to get started")}</div>
        </div>
      </div>
      {!onSite && (
        <button class="primary" onClick={() => ext.tabs.create({url: SITE}).then(() => window.close())}>
          {L("Ouvrir WikiMasters", "Open WikiMasters")}
        </button>
      )}
      {onSite && status?.connected && (
        <>
          <button class="primary" onClick={() => send({type: "sort-new"})}>
            <Icon name="sort" size={16} /> {L("Trier mes nouvelles cartes", "Sort my new cards")}
          </button>
          <button onClick={() => send({type: "open-panel"})}>
            <Mark size={16} /> {L("Ouvrir la Toolbox", "Open the Toolbox")}
          </button>
          <div class="grid">
            <button onClick={() => send({type: "open-panel", tab: "trades"})}>
              <Icon name="trades" size={16} /> {L("Échanges", "Trades")}
            </button>
            <button onClick={() => send({type: "open-panel", tab: "market"})}>
              <Icon name="market" size={16} /> {L("Enchères", "Auctions")}
            </button>
            <button onClick={() => send({type: "open-panel", tab: "prices"})}>
              <Icon name="prices" size={16} /> {L("Prix", "Prices")}
            </button>
            <button onClick={() => send({type: "open-panel", tab: "families"})}>
              <Icon name="families" size={16} /> {L("Familles", "Families")}
            </button>
          </div>
          <button onClick={() => send({type: "open-all"})}>
            <Icon name="packs" size={16} /> {L("Tout ouvrir", "Open all")}
            {status.packs != null && <span class="n">{status.packs}</span>}
          </button>
        </>
      )}
      {error && <div class="note">{error}</div>}
    </div>
  );
}

const style = document.createElement("style");
// Page de l'extension : les polices sont servies à côté de popup.html
style.textContent = fontsCss.replaceAll("__FONTS__", "fonts/") + css;
document.head.append(style);
document.documentElement.lang = LANG;
render(<Popup />, document.getElementById("app"));
