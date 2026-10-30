// Point d'entrée de WikiMasters Toolbox dans les pages wiki-masters.com (monde isolé).
import {render} from "preact";
import {ext, extensionAlive} from "./lib/ext";
import {startHookBridge, emit} from "./lib/bus";
import {startRegistry} from "./lib/registry";
import {readSession} from "./lib/session";
import {settings} from "./state/settings";
import {profiles} from "./state/profiles";
import {packsStatus} from "./features/packs";
import {startBidAlerts} from "./features/market";
import {startAuctionTab} from "./features/auction-tab";
import {startAchievements} from "./features/achievements";
import {startSiteDom, watchRoute} from "./features/site-dom";
import {startNotificationSound} from "./features/notify";
import {startStonksRoute} from "./features/stonks";
import {planSort} from "./features/sorter";
import {App, openPanel} from "./ui/App";
import {toast, errorMessage} from "./ui/feedback";
import panelCss from "./ui/panel.css";

if (!window.__wmtContent) {
  window.__wmtContent = true;

  // À document_start : écouter le hook avant que le site ne fasse ses premières requêtes
  startHookBridge();
  startRegistry();
  startNotificationSound();

  const boot = async () => {
    await Promise.all([settings.ready, profiles.ready]);
    const host = document.createElement("div");
    host.id = "wikimasters-toolbox";
    const attach = () => host.isConnected || (document.body || document.documentElement).append(host);
    attach();
    const root = host.attachShadow({mode: "open"});
    const style = document.createElement("style");
    style.textContent = panelCss;
    root.append(style);
    const mount = document.createElement("div");
    root.append(mount);
    render(<App />, mount);
    // Si le site reconstruit le <body> (erreur de rendu, changement de mise en page), la Toolbox
    // est raccrochée telle quelle, avec son état
    setInterval(attach, 1500);
    startSiteDom();
    watchRoute();
    startStonksRoute();
    startBidAlerts();
    startAuctionTab();
    startAchievements();
  };
  // Après le chargement complet : le site (React) doit avoir fini d'hydrater la page avant
  // qu'on y ajoute quoi que ce soit, sinon React signale un décalage et re-rend tout.
  const start = () => setTimeout(() => boot().catch((e) => console.error("[WikiMasters Toolbox] démarrage impossible", e)), 300);
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, {once: true});

  // Messages de la popup d'extension
  if (extensionAlive())
    ext.runtime.onMessage.addListener((msg, _sender, reply) => {
      if (msg?.type === "status") {
        const s = readSession();
        reply({connected: Boolean(s), username: s?.username || null, packs: packsStatus.get().remaining});
        return;
      }
      if (msg?.type === "open-panel") {
        openPanel(msg.tab);
        reply({ok: true});
        return;
      }
      if (msg?.type === "sort-new") {
        openPanel("sort");
        planSort({newOnly: true}).catch((e) => toast(errorMessage(e), {type: "error"}));
        reply({ok: true});
        return;
      }
      if (msg?.type === "open-all") {
        emit("confirm-open-all", {});
        reply({ok: true});
      }
    });
}
