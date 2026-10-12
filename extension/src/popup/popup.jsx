// Popup de l'extension : actions rapides sur l'onglet WikiMasters actif.
import {render} from "preact";
import {useEffect, useState} from "preact/hooks";
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
        <div class="logo">WM</div>
        <div>
          <div class="title">WikiMasters Toolbox</div>
          <div class="sub">{onSite ? (status?.connected ? `Connecté : ${status.username || "joueur"}` : status ? "Non connecté à WikiMasters" : "…") : "Ouvrez WikiMasters pour commencer"}</div>
        </div>
      </div>
      {!onSite && (
        <button class="primary" onClick={() => ext.tabs.create({url: SITE}).then(() => window.close())}>
          Ouvrir WikiMasters
        </button>
      )}
      {onSite && status?.connected && (
        <>
          <button class="primary" onClick={() => send({type: "sort-new"})}>🗂️ Trier mes nouvelles cartes</button>
          <button onClick={() => send({type: "open-panel"})}>🧰 Ouvrir la Toolbox</button>
          <div class="grid">
            <button onClick={() => send({type: "open-panel", tab: "trades"})}>🔁 Échanges</button>
            <button onClick={() => send({type: "open-panel", tab: "market"})}>🔨 Enchères</button>
            <button onClick={() => send({type: "open-panel", tab: "prices"})}>💰 Prix</button>
            <button onClick={() => send({type: "open-panel", tab: "families"})}>🧩 Familles</button>
          </div>
          <button onClick={() => send({type: "open-all"})}>🎴 Tout ouvrir{status.packs != null ? ` (${status.packs})` : ""}</button>
        </>
      )}
      {error && <div class="note">{error}</div>}
    </div>
  );
}

const style = document.createElement("style");
style.textContent = css;
document.head.append(style);
render(<Popup />, document.getElementById("app"));
