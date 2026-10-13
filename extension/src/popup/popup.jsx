// Popup de l'extension : actions rapides sur l'onglet WikiMasters actif.
import {render} from "preact";
import {useEffect, useState} from "preact/hooks";
import {Icon, Mark} from "../shared/Brand";
import fontsCss from "../shared/fonts.css";
import css from "./popup.css";

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
        setError("Rechargez la page WikiMasters pour activer la Toolbox.");
      }
    });
  }, []);

  const send = async (msg) => {
    try {
      await ext.tabs.sendMessage(tab.id, msg);
      window.close();
    } catch {
      setError("Rechargez la page WikiMasters pour activer la Toolbox.");
    }
  };

  const onSite = tab && isSite(tab.url);
  return (
    <div class="wrap">
      <div class="head">
        <Mark size={24} />
        <div>
          <div class="title">WikiMasters Toolbox</div>
          <div class="sub">{onSite ? (status?.connected ? `connecté · ${status.username || "joueur"}` : status ? "non connecté à WikiMasters" : "…") : "ouvrez WikiMasters pour commencer"}</div>
        </div>
      </div>
      {!onSite && (
        <button class="primary" onClick={() => ext.tabs.create({url: SITE}).then(() => window.close())}>
          Ouvrir WikiMasters
        </button>
      )}
      {onSite && status?.connected && (
        <>
          <button class="primary" onClick={() => send({type: "sort-new"})}>
            <Icon name="sort" size={16} /> Trier mes nouvelles cartes
          </button>
          <button onClick={() => send({type: "open-panel"})}>
            <Mark size={16} /> Ouvrir la Toolbox
          </button>
          <div class="grid">
            <button onClick={() => send({type: "open-panel", tab: "trades"})}>
              <Icon name="trades" size={16} /> Échanges
            </button>
            <button onClick={() => send({type: "open-panel", tab: "market"})}>
              <Icon name="market" size={16} /> Enchères
            </button>
            <button onClick={() => send({type: "open-panel", tab: "prices"})}>
              <Icon name="prices" size={16} /> Prix
            </button>
            <button onClick={() => send({type: "open-panel", tab: "families"})}>
              <Icon name="families" size={16} /> Familles
            </button>
          </div>
          <button onClick={() => send({type: "open-all"})}>
            <Icon name="packs" size={16} /> Tout ouvrir
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
render(<Popup />, document.getElementById("app"));
