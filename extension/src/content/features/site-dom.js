// Intégration dans les pages du site : entrée « Toolbox » dans le menu, badges sur les cartes,
// bouton « Tout ouvrir » sur la page Paquets, images de remplacement, et blocs de la Toolbox
// (« îlots ») dans les pages : collection, fiche d'une carte, enchère, profil d'un joueur.
// Tous les sélecteurs du site sont ici : si le site change, c'est le seul fichier à adapter.
import {emit} from "../lib/bus";
import {ext} from "../lib/ext";
import {lookupTitle, registryVersion, normTitle} from "../lib/registry";
import {settings, isOn} from "../state/settings";
import {owned} from "../state/collection";
import {priceOf, summaryOf, requestPrice, priceVersion} from "../state/prices";
import {wikiThumbnail} from "./wiki-images";
import {recapState, markRevealed, dismissRecap, pullStats, collectionRarity, refreshCollectionRarity} from "./packs";
import {auctionById, auctionVersion, nextBid, msLeft} from "./market";
import {resolveCard} from "./card-lookup";
import {mountPackRecap} from "../ui/PackRecap";
import {mountDropRates} from "../ui/DropRates";
import {mountIsland} from "../ui/islands/mount";
import {CollectionBar} from "../ui/islands/CollectionBar";
import {CardInsight} from "../ui/islands/CardInsight";
import {AuctionInsight} from "../ui/islands/AuctionInsight";
import {FriendTrades} from "../ui/islands/FriendTrades";
import {readSession} from "../lib/session";
import {categorize, THEME_COLORS} from "../../../../core";
import {iconSvg, markSvg, markOutlineSvg} from "../../shared/brand.mjs";
import fontsCss from "../../shared/fonts.css";
import siteCss from "../ui/site.css";

const SEL = {
  nav: "nav",
  navLink: 'a[href="/collection"]',
  tile: 'div[class*="glow-"][class*="rounded-2xl"]',
  tileTitle: "h3",
  placeholderImg: 'img[alt="WikiMasters"]',
  pullsOpenButton: "main button",
  // Bouton du bas de la révélation des cartes : « Encore 3 cartes », puis « Continuer »
  revealButtonText: /^(Continuer|Encore \d+ cartes?)$/,
  pageTitle: "main h1",
  collectionSearch: 'main input[placeholder^="Rechercher par titre"]',
  // Fenêtre d'une carte : voile plein écran, titre en h2, carte en grand (classe glow-<rareté>)
  modal: "div.fixed.inset-0",
  modalTitle: "h2",
  modalTile: 'div[class*="glow-"]',
  modalActionText: /^(Mettre aux enchères|Défausser)/,
  // Onglets du profil d'un joueur
  profileTabText: /^(Vitrine|Collection)$/,
};
// « Bonne affaire » : seulement dans les dernières minutes d'une enchère
const DEAL_WINDOW = 15 * 60 * 1000;
const AUCTION_PATH = /^\/marketplace\/([0-9a-f-]{36})\/?$/;
const PROFILE_PATH = /^\/profile\/([^/]+)\/?$/;
const RARITY_CLASS = /\bglow-(l|ur|sr|r|pc|c)\b/;
// Bouton de la page dont le texte passe le test (hors boutons de l'extension)
const findButton = (test) => [...document.querySelectorAll(SEL.pullsOpenButton)].find((b) => !b.className.includes("wmt-") && test(b.textContent.trim()));

export const currentPath = () => location.pathname;

// --- Changements de page (navigation côté client de Next.js)
export function watchRoute() {
  let last = location.href;
  setInterval(() => {
    if (location.href !== last) {
      last = location.href;
      emit("route", location.pathname);
    }
  }, 400);
}

// SVG (texte) → élément
function svgElement(markup) {
  const tpl = document.createElement("template");
  tpl.innerHTML = markup;
  return tpl.content.firstElementChild;
}

// --- Entrée « Toolbox » dans le menu latéral
function ensureNavEntry() {
  const navs = [...document.querySelectorAll(SEL.nav)].filter((n) => n.querySelector(SEL.navLink));
  if (!navs.length) return false;
  // Le menu le plus fourni (le menu latéral, pas la barre du bas sur mobile)
  const nav = navs.sort((a, b) => b.querySelectorAll("a").length - a.querySelectorAll("a").length)[0];
  if (nav.querySelector(".wmt-nav-link")) return true;
  // Modèle : une entrée du menu (icône + libellé) qui n'est pas la page active ; pas le logo
  const items = [...nav.querySelectorAll("a[href^='/']")].filter((a) => a.querySelector("svg") && a.textContent.trim().length < 30);
  const inactive = items.filter((a) => a.getAttribute("aria-current") == null && !/accent/.test(a.className));
  const model = inactive.find((a) => a.getAttribute("href") === "/leaderboard") || inactive[inactive.length - 1];
  if (!model) return false;
  const link = model.cloneNode(true);
  link.classList.add("wmt-nav-link");
  link.removeAttribute("aria-current");
  link.setAttribute("href", "#toolbox");
  // Icône : la marque au trait, à la taille des icônes du menu (classes du modèle conservées)
  const svg = link.querySelector("svg");
  if (svg) {
    const icon = svgElement(markOutlineSvg());
    if (svg.getAttribute("class")) icon.setAttribute("class", svg.getAttribute("class"));
    svg.replaceWith(icon);
  }
  // Libellé : premier nœud texte non vide remplacé, les autres vidés (pastilles, compteurs)
  const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
  const texts = [];
  while (walker.nextNode()) if (walker.currentNode.nodeValue.trim()) texts.push(walker.currentNode);
  if (texts.length) texts.forEach((t, i) => (t.nodeValue = i ? "" : "Toolbox"));
  else link.append("Toolbox");
  link.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    emit("open-panel", {});
  });
  model.parentElement.insertBefore(link, model.nextSibling);
  return true;
}

// --- Badges sur les cartes
const themeCache = new Map();
function themeOf(info) {
  if (themeCache.has(info.title)) return themeCache.get(info.title);
  const theme = categorize({wikipedia_title: info.title, category: info.category, summary: info.summary || ""})[0];
  themeCache.set(info.title, theme);
  return theme;
}

const visible = new WeakSet();
// Cartes observées : celles que le site a retirées de la page sont oubliées (sinon l'observateur
// les garde en mémoire tout au long de la navigation)
const observed = new Set();
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) visible.add(e.target);
      else visible.delete(e.target);
    }
    schedule();
  },
  {rootMargin: "200px"},
);
function forgetDetached() {
  for (const tile of observed) {
    if (tile.isConnected) continue;
    io.unobserve(tile);
    observed.delete(tile);
  }
}

function chip(className, text, title, icon) {
  const el = document.createElement("span");
  el.className = `wmt-chip ${className}`;
  if (icon) el.append(svgElement(iconSvg(icon, 11)));
  if (text) el.append(text);
  if (title) el.title = title;
  return el;
}

function decorateTile(tile, version) {
  const titleEl = tile.querySelector(SEL.tileTitle);
  if (!titleEl) return;
  const title = normTitle(titleEl.textContent);
  const key = `${title}|${version}|${visible.has(tile) ? 1 : 0}`;
  if (tile.dataset.wmtKey === key) return;
  tile.dataset.wmtKey = key;
  if (!observed.has(tile)) {
    observed.add(tile);
    io.observe(tile);
  }

  // Sans réponse observée (page servie depuis le cache du site), le titre et la description
  // affichés suffisent pour le thème et le lien Wikipédia.
  const info = lookupTitle(title) || {title, category: titleEl.parentElement?.querySelector("p")?.textContent.trim() || "", dom: true};
  const rarity = (RARITY_CLASS.exec(tile.className)?.[1] || "").toUpperCase() || info?.rarity;
  const path = currentPath();
  const onMyCollection = path.startsWith("/collection");
  let box = tile.querySelector(":scope > .wmt-tile-badges");
  // Page Paquets : la carte révélée a ses propres contrôles et le récapitulatif donne déjà tout
  if (path.startsWith("/pulls")) {
    box?.remove();
    return;
  }
  if (!box) {
    box = document.createElement("div");
    box.className = "wmt-tile-badges";
    tile.append(box);
  }
  // La carte a ses propres boutons en haut (favori…) : les badges passent dessous
  box.classList.toggle("wmt-below-controls", Boolean(tile.querySelector("button:not(.wmt-chip)")));
  box.replaceChildren();

  if (info.id && isOn("priceBadges")) {
    const price = priceOf(info.id, rarity);
    if (price != null) box.append(chip("wmt-chip-price", `${price.toLocaleString("fr-FR")} ₩`, "Prix moyen de vente pour cette rareté"));
    else if (visible.has(tile)) requestPrice(info.id, {rarity});
  }
  // Marché : mise comparée au prix moyen (l'enchère est retrouvée par le lien de la carte).
  // Une mise de départ est presque toujours basse et l'enchère va monter : « bonne affaire »
  // seulement pour une enchère qui se termine bientôt ; « trop cher » dès que la mise minimale
  // dépasse nettement ce que la carte vaut d'habitude. Moyenne sur 3 ventes au moins.
  if (isOn("dealBadges") && path.startsWith("/marketplace")) {
    const auction = auctionById(AUCTION_PATH.exec(tile.closest("a[href]")?.getAttribute("href") || "")?.[1]);
    const cardId = auction && (auction.card_id || info.id);
    const auctionRarity = auction && (auction.snapshot_rarity || rarity);
    const bid = auction ? nextBid(auction) : null;
    const avg = auction && (summaryOf(cardId)?.[auctionRarity]?.count || 0) >= 3 ? priceOf(cardId, auctionRarity) : null;
    if (avg && bid) {
      const gap = Math.round((100 * (bid - avg)) / avg);
      const left = msLeft(auction);
      const fmt = (n) => n.toLocaleString("fr-FR");
      if (gap <= -25 && left > 0 && left < DEAL_WINDOW)
        box.append(chip("wmt-chip-deal", `−${-gap} %`, `Bonne affaire : se termine dans ${Math.ceil(left / 60000)} min, mise minimale ${fmt(bid)} ₩ pour un prix moyen de ${fmt(avg)} ₩`));
      else if (gap >= 50) box.append(chip("wmt-chip-pricey", `+${gap} %`, `Mise minimale ${fmt(bid)} ₩ pour un prix moyen de ${fmt(avg)} ₩`));
    }
  }
  // La collection globale affiche déjà « Possédée » : badge inutile là-bas
  if (isOn("ownedBadges") && !onMyCollection && !path.startsWith("/global-collection")) {
    const isOwned = info.owned ?? (info.id ? owned.get().ids.has(info.id) : undefined);
    if (isOwned === true) box.append(chip("wmt-chip-owned", "", "Vous possédez cette carte", "check"));
    else if (isOwned === false && (path.startsWith("/marketplace") || path.startsWith("/profile"))) box.append(chip("wmt-chip-new", "Nouvelle", "Vous n'avez pas cette carte"));
  }
  if (isOn("themeBadges") && !onMyCollection && (info.category || info.summary)) {
    const theme = themeOf(info);
    if (theme && theme !== "Autre") {
      const el = chip("wmt-chip-theme", theme.split(" ")[0], theme);
      el.style.setProperty("--wmt-theme", settings.get().themeColors[theme] || THEME_COLORS[theme] || "#64748b");
      box.append(el);
    }
  }
  if (isOn("wikiLink")) {
    const a = document.createElement("a");
    a.className = "wmt-chip wmt-chip-wiki";
    a.textContent = "W";
    a.title = "Ouvrir l'article Wikipédia";
    a.href = info.wikipedia_url || `https://fr.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.addEventListener("click", (e) => e.stopPropagation());
    box.append(a);
  }

  if (isOn("missingImages") && visible.has(tile)) {
    const placeholder = tile.querySelector(SEL.placeholderImg);
    const area = placeholder?.closest("div[class*='h-[45%]']") || placeholder?.parentElement?.parentElement;
    if (placeholder && area && !area.querySelector(".wmt-fallback-img") && !info.image_url) {
      wikiThumbnail(title).then((src) => {
        if (!src || !area.isConnected || area.querySelector(".wmt-fallback-img")) return;
        const img = document.createElement("img");
        img.className = "wmt-fallback-img";
        img.src = src;
        img.alt = "";
        img.referrerPolicy = "no-referrer";
        area.append(img);
      });
    }
  }
}

// --- Bouton « Tout ouvrir » à côté du bouton « Ouvrir » de la page Paquets
function ensureOpenAllButton() {
  const existing = document.querySelector(".wmt-open-all");
  // Seulement sur l'écran d'accueil des paquets, collé au bouton « Ouvrir » (absent pendant la révélation)
  const open = currentPath().startsWith("/pulls") && isOn("openAll") ? findButton((t) => t === "Ouvrir" || t.startsWith("Ouverture")) : null;
  if (!open || findButton((t) => SEL.revealButtonText.test(t))) {
    existing?.remove();
    return;
  }
  if (existing && existing.previousElementSibling === open) return;
  existing?.remove();
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "wmt-open-all";
  btn.append(svgElement(markSvg({size: 16})), "Tout ouvrir");
  btn.title = "WikiMasters Toolbox : ouvre tous les paquets disponibles, sans animation";
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    emit("confirm-open-all", {});
  });
  open.insertAdjacentElement("afterend", btn);
}

// --- Page Paquets : récapitulatif du paquet et graphique des taux de drop
// Pendant que le site révèle les cartes une à une, on attend ; quand le bouton du bas devient
// « Continuer » (toutes les cartes vues), le récapitulatif s'affiche dessous. Au retour sur l'écran
// « Ouvrir un paquet », il disparaît (sauf après « Tout ouvrir », qui n'a pas d'écran de révélation).
// Sur cet écran, sous le compteur de paquets : le graphique des taux de drop par rareté.
let recapHost = null;
let ratesHost = null;
let revealSeenFor = 0;

function place(host, anchor) {
  if (!host.isConnected || host.previousElementSibling !== anchor) anchor.insertAdjacentElement("afterend", host);
  return host;
}

// Élément de l'écran d'accueil sous lequel on s'insère : le compteur de paquets qui suit « Ouvrir »
function homeAnchor() {
  const open = findButton((t) => t === "Ouvrir" || t.startsWith("Ouverture"));
  if (!open) return null;
  let anchor = open.nextElementSibling;
  while (anchor?.classList.contains("wmt-open-all")) anchor = anchor.nextElementSibling;
  return anchor || open;
}

function ensurePullsWidgets() {
  const onPulls = currentPath().startsWith("/pulls");
  const reveal = onPulls ? findButton((t) => SEL.revealButtonText.test(t)) : null;
  const home = onPulls && !reveal ? homeAnchor() : null;
  const r = recapState.get();

  // Récapitulatif
  let recapAnchor = null;
  if (onPulls && isOn("packRecap") && r.cards.length && !r.dismissed) {
    if (r.source === "reveal") {
      if (reveal) revealSeenFor = r.at;
      if (reveal?.textContent.trim() === "Continuer") {
        markRevealed();
        recapAnchor = reveal;
      } else if (!reveal && revealSeenFor === r.at && home) {
        // « Continuer » cliqué : retour à l'accueil, on n'y laisse pas l'ancien récapitulatif
        dismissRecap();
      }
    } else if (home) {
      recapAnchor = home;
    }
  }
  if (recapAnchor) {
    if (!recapHost) {
      recapHost = document.createElement("div");
      recapHost.className = "wmt-recap-host";
      mountPackRecap(recapHost);
    }
    place(recapHost, recapAnchor);
  } else recapHost?.remove();

  // Taux de drop (écran d'accueil seulement)
  if (home && isOn("pullStats")) {
    if (!ratesHost) {
      ratesHost = document.createElement("div");
      ratesHost.className = "wmt-rates-host";
      mountDropRates(ratesHost);
    }
    refreshCollectionRarity();
    place(ratesHost, recapAnchor === home ? recapHost : home);
  } else ratesHost?.remove();
}

// --- Blocs de la Toolbox dans les pages (« îlots »)
// Chaque îlot est créé une fois, re-rendu seulement quand ses données changent, et replacé sous
// son ancre à chaque passage (le site re-rend ses pages) ; il est retiré quand la page ne s'y prête plus.
const islands = new Map(); // nom → {host, update, key}
function showIsland(name, Component, props, place) {
  let it = islands.get(name);
  if (!it) {
    const host = document.createElement("div");
    host.className = `wmt-island wmt-island-${name}`;
    it = {host, update: mountIsland(host, Component), key: null};
    islands.set(name, it);
  }
  const key = JSON.stringify(props);
  if (key !== it.key) {
    it.key = key;
    it.update(props);
  }
  place(it.host);
}
const hideIsland = (name) => islands.get(name)?.host.remove();
const after = (anchor) => (host) => (host.previousElementSibling !== anchor || !host.isConnected) && anchor.after(host);
const appendTo = (parent) => (host) => (host.parentElement !== parent || host.nextElementSibling) && parent.append(host);

// Bloc de la page qui contient `el`, au même niveau que `landmark` (premier ancêtre dont le parent
// contient aussi le repère) : ne dépend pas des classes du site, seulement de l'imbrication.
function sectionOf(el, landmark) {
  let block = el;
  while (block?.parentElement && !block.parentElement.contains(landmark)) block = block.parentElement;
  return block?.parentElement ? block : null;
}

// Collection : barre sous la recherche et les filtres de rareté
function ensureCollectionBar() {
  const title = currentPath() === "/collection" && isOn("collectionBar") ? document.querySelector(SEL.pageTitle) : null;
  const search = title && document.querySelector(SEL.collectionSearch);
  const filters = search && sectionOf(search, title);
  if (!filters) return hideIsland("collection");
  showIsland("collection", CollectionBar, {}, after(filters));
}

// Fenêtre d'une carte (collection, profils, toutes les cartes) : bloc sous les détails
function ensureCardInsight() {
  const modal = isOn("cardInsight")
    ? [...document.querySelectorAll(SEL.modal)].find((m) => m.querySelector(SEL.modalTitle) && m.querySelector(SEL.modalTile))
    : null;
  const titleEl = modal?.querySelector(SEL.modalTitle);
  const tile = modal?.querySelector(SEL.modalTile);
  // Colonne des détails : le bloc qui contient le titre, à côté de la grande carte
  const details = titleEl && tile && sectionOf(titleEl, tile);
  if (!details || details.contains(tile)) return hideIsland("card");
  const title = normTitle(titleEl.textContent);
  const info = lookupTitle(title) || {};
  if (!info.id) resolveCard(title);
  const rarity = (RARITY_CLASS.exec(tile.className)?.[1] || "").toUpperCase() || info.rarity || null;
  const card = {
    id: info.id || null,
    title,
    rarity,
    category: info.category || titleEl.parentElement?.parentElement?.querySelector("p")?.textContent.trim() || "",
    summary: info.summary || "",
    image_url: info.image_url || null,
    owned: info.owned ?? null,
    onMyCollection: currentPath().startsWith("/collection"),
  };
  showIsland("card", CardInsight, {card}, appendTo(details));
}

// Page d'une enchère : analyse sous le formulaire de mise
function ensureAuctionInsight() {
  const id = isOn("auctionInsight") ? AUCTION_PATH.exec(currentPath())?.[1] : null;
  const title = id && document.querySelector(SEL.pageTitle);
  const tile = title && document.querySelector(`main ${SEL.modalTile}`);
  const column = title && tile && sectionOf(title, tile);
  if (!column || column.contains(tile)) return hideIsland("auction");
  showIsland("auction", AuctionInsight, {auctionId: id}, appendTo(column));
}

// Profil d'un autre joueur : échanges sous l'en-tête du profil
function ensureFriendTrades() {
  const name = isOn("friendTrades") ? decodeURIComponent(PROFILE_PATH.exec(currentPath())?.[1] || "") : "";
  const me = readSession()?.username;
  const title = name && (!me || name.toLowerCase() !== me.toLowerCase()) ? document.querySelector(SEL.pageTitle) : null;
  const tab = title && [...document.querySelectorAll("main button")].find((b) => SEL.profileTabText.test(b.textContent.trim()));
  const header = tab && sectionOf(title, tab);
  if (!header) return hideIsland("friend");
  showIsland("friend", FriendTrades, {username: title.textContent.trim() || name}, after(header));
}

// --- Boucle de rafraîchissement (regroupée par image)
// Chaque étape est isolée : si le site change et qu'une étape échoue, les autres continuent
// (repli silencieux, une seule trace par étape dans la console).
let version = 0;
let scheduled = false;
let style = null;
const reported = new Set();
function attempt(label, fn) {
  try {
    fn();
  } catch (e) {
    if (reported.has(label)) return;
    reported.add(label);
    console.warn(`[WikiMasters Toolbox] ${label}`, e);
  }
}
function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(run);
}
function run() {
  scheduled = false;
  // Le site peut reconstruire le <head> en changeant de page
  if (style && !style.isConnected) (document.head || document.documentElement).append(style);
  attempt("menu", ensureNavEntry);
  attempt("bouton Tout ouvrir", ensureOpenAllButton);
  attempt("page Paquets", ensurePullsWidgets);
  attempt("barre de la collection", ensureCollectionBar);
  attempt("fiche d'une carte", ensureCardInsight);
  attempt("analyse d'enchère", ensureAuctionInsight);
  attempt("échanges sur un profil", ensureFriendTrades);
  for (const tile of document.querySelectorAll(SEL.tile)) attempt("badges des cartes", () => decorateTile(tile, version));
  forgetDetached();
}

// Règles @font-face des polices de l'interface, servies par l'extension (rien sans l'API d'extension :
// les polices de repli du système prennent le relais)
function fontFaces() {
  try {
    return fontsCss.replaceAll("__FONTS__", ext.runtime.getURL("fonts/"));
  } catch {
    return "";
  }
}

export function startSiteDom() {
  style = document.createElement("style");
  style.id = "wmt-site-style";
  style.textContent = fontFaces() + siteCss;
  (document.head || document.documentElement).append(style);
  const bump = () => {
    version++;
    schedule();
  };
  registryVersion.subscribe(bump);
  priceVersion.subscribe(bump);
  settings.subscribe(() => {
    themeCache.clear();
    bump();
  });
  owned.subscribe(bump);
  auctionVersion.subscribe(bump);
  // Les pastilles « bonne affaire » dépendent du temps restant
  setInterval(() => currentPath().startsWith("/marketplace") && bump(), 60000);
  recapState.subscribe(schedule);
  pullStats.subscribe(schedule);
  collectionRarity.subscribe(schedule);
  // Ignore nos propres ajouts (badges, images) pour ne pas boucler
  const ours = (n) => n.nodeType === 1 && /\bwmt-/.test(n.className || "");
  new MutationObserver((mutations) => {
    if (mutations.every((m) => m.target.closest?.(".wmt-tile-badges") || ([...m.addedNodes].every(ours) && !m.removedNodes.length))) return;
    schedule();
  }).observe(document.documentElement, {childList: true, subtree: true});
  schedule();
}
