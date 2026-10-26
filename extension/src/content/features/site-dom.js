// Intégration dans les pages du site : entrées « Toolbox » et « Stonks » dans le menu, badges sur les
// cartes, bouton « Tout ouvrir » sur la page Paquets, images de remplacement, blocs de la Toolbox
// (« îlots ») dans les pages : collection, fiche d'une carte, enchère, profil d'un joueur, bilan d'une
// proposition d'échange, et la page Stonks à la place du contenu de la page.
// Tous les sélecteurs du site sont ici : si le site change, c'est le seul fichier à adapter.
import {emit} from "../lib/bus";
import {sleep} from "../lib/http";
import {ext} from "../lib/ext";
import {lookupTitle, registryVersion, normTitle} from "../lib/registry";
import {settings, isOn} from "../state/settings";
import {owned} from "../state/collection";
import {priceOf, priceInfo, uncertainNote, requestPrice, priceVersion} from "../state/prices";
import {wikiImage} from "./wiki-images";
import {recapState, openAllState, markRevealed, dismissRecap, pullStats, collectionRarity, refreshCollectionRarity} from "./packs";
import {auctionById, auctionVersion, nextBid, msLeft} from "./market";
import {resolveCard} from "./card-lookup";
import {collectionView, setCollectionView} from "./collection-view";
import {stonksPage, isStonksOpen, openStonks, closeStonks} from "./stonks";
import {mountPackRecap} from "../ui/PackRecap";
import {mountDropRates} from "../ui/DropRates";
import {mountIsland} from "../ui/islands/mount";
import {CollectionBar} from "../ui/islands/CollectionBar";
import {CardInsight} from "../ui/islands/CardInsight";
import {AuctionInsight} from "../ui/islands/AuctionInsight";
import {FriendTrades} from "../ui/islands/FriendTrades";
import {TradeRecap} from "../ui/islands/TradeRecap";
import {StonksPage} from "../ui/islands/StonksPage";
import {readSession} from "../lib/session";
import {themeMemo, tagColor, otherTheme} from "../state/themes";
import {iconSvg, markSvg, markOutlineSvg, stonksOutlineSvg} from "../../shared/brand.mjs";
import fontsCss from "../../shared/fonts.css";
import siteCss from "../ui/site.css";

const SEL = {
  nav: "nav",
  // Lien présent seulement dans les menus qui listent toutes les pages (pas dans la barre du bas)
  fullNavLink: 'a[href="/leaderboard"]',
  marketLink: 'a[href="/marketplace"]',
  siteLink: 'a[href^="/"]',
  main: "main",
  tile: 'div[class*="glow-"][class*="rounded-2xl"]',
  // Exemplaire shiny (rareté L seulement) : « glow-shiny shiny-card » à la place de « glow-l »
  shinyTile: "shiny-card",
  tileTitle: "h3",
  // Carte du site : texture de rareté (img enfant direct), zone image, badge de rareté, zone texte
  // (titre, description, étiquettes, attaque / défense) ; image remplacée par le logo du site si absente
  tileTexture: ":scope > img",
  tileTag: "span[style]",
  statAttack: "svg.lucide-swords",
  statDefense: "svg.lucide-shield",
  placeholderImg: 'img[alt="WikiMasters"]',
  pullsOpenButton: "main button",
  // Bouton de l'écran d'accueil des paquets : « Ouvrir », puis « Ouverture... » pendant la requête
  openButtonText: /^(Ouvrir$|Ouverture)/,
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
  // Fenêtre « Échanger avec … » : barre des nombres (« Moi : 2 cartes · 150 wb », « <ami> : 0 cartes »),
  // onglets « Mes cartes » / « Cartes de <ami> » (l'actif est souligné : border-b-2), cartes choisies
  // de l'onglet ouvert seulement, sous « Sélectionnées (n) »
  tradeMine: /^Moi\s*:/,
  tradeCounts: /:\s*([\d\s]+)\s*cartes?(?:\s*·\s*([\d\s]+)\s*wb)?/i,
  tradeMineTab: /^Mes cartes/,
  tradeActiveTab: "border-b-2",
  tradeSelected: /^Sélectionnées\s*\(/,
};
// « Bonne affaire » : seulement dans les dernières minutes d'une enchère
const DEAL_WINDOW = 15 * 60 * 1000;
const AUCTION_PATH = /^\/marketplace\/([0-9a-f-]{36})\/?$/;
const PROFILE_PATH = /^\/profile\/([^/]+)\/?$/;
const RARITY_CLASS = /\bglow-(l|ur|sr|r|pc|c)\b/;
const isShinyTile = (tile) => tile.classList.contains(SEL.shinyTile);
// Rareté d'une carte du site (classe glow-<rareté>, L pour une shiny), sinon celle de la carte connue
const tileRarity = (tile, fallback) => (isShinyTile(tile) ? "L" : (RARITY_CLASS.exec(tile.className)?.[1] || "").toUpperCase()) || fallback || null;
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

// --- Entrées « Toolbox » et « Stonks » dans le menu latéral
const isActiveLink = (a) => a.getAttribute("aria-current") != null || /accent/.test(a.className);

// Copie d'une entrée du menu (model : icône + libellé), avec notre icône et notre libellé
function navEntry(model, {cls, href, label, icon, onClick}) {
  const link = model.cloneNode(true);
  link.classList.add("wmt-nav-link", cls);
  link.removeAttribute("aria-current");
  link.setAttribute("href", href);
  // Icône à la taille des icônes du menu (classes du modèle conservées)
  const svg = link.querySelector("svg");
  if (svg) {
    const el = svgElement(icon);
    if (svg.getAttribute("class")) el.setAttribute("class", svg.getAttribute("class"));
    svg.replaceWith(el);
  }
  // Libellé : premier nœud texte non vide remplacé, les autres vidés (pastilles, compteurs)
  const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
  const texts = [];
  while (walker.nextNode()) if (walker.currentNode.nodeValue.trim()) texts.push(walker.currentNode);
  if (texts.length) texts.forEach((t, i) => (t.nodeValue = i ? "" : label));
  else link.append(label);
  link.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return link;
}

// Menus qui listent toutes les pages (lien vers le classement) : le menu latéral et, sur mobile, le
// menu « Plus » de la barre du bas, rendu seulement quand il est ouvert
function ensureNavEntry() {
  const navs = [...document.querySelectorAll(SEL.nav)].filter((n) => n.querySelector(SEL.fullNavLink));
  if (!navs.length) return false;
  // Le menu latéral est le plus fourni ; les autres sont des menus qui se referment
  const side = [...navs].sort((a, b) => b.querySelectorAll("a").length - a.querySelectorAll("a").length)[0];
  for (const [nav] of swaps) if (!nav.isConnected) swaps.delete(nav);
  for (const nav of navs) addNavEntries(nav, nav !== side);
  return true;
}

// Le menu « Plus » du site se referme sur un appui en dehors de lui (nos entrées n'ont pas ses gestionnaires)
function closeSiteMenu() {
  for (const type of ["pointerdown", "mousedown"]) document.body.dispatchEvent(new MouseEvent(type, {bubbles: true}));
}

function addNavEntries(nav, popup) {
  // Modèle : une entrée du menu (icône + libellé) qui n'est pas la page active ; pas le logo
  const items = [...nav.querySelectorAll("a[href^='/']")].filter((a) => a.querySelector("svg") && a.textContent.trim().length < 30);
  const inactive = items.filter((a) => !isActiveLink(a));
  const model = inactive.find((a) => a.matches(SEL.fullNavLink)) || inactive[inactive.length - 1];
  if (!model) return;
  const then = (action) => () => {
    action();
    if (popup) closeSiteMenu();
  };
  if (!nav.querySelector(".wmt-nav-toolbox")) {
    const link = navEntry(model, {cls: "wmt-nav-toolbox", href: "#toolbox", label: "Toolbox", icon: markOutlineSvg(), onClick: then(() => emit("open-panel", {}))});
    model.parentElement.insertBefore(link, model.nextSibling);
  }
  // « Stonks » juste après le Marché quand il est dans le même bloc que le modèle (pas dans la barre
  // du bas, sur mobile), sinon après « Toolbox »
  let stonks = nav.querySelector(".wmt-nav-stonks");
  if (isOn("stonks") && !stonks) {
    const market = nav.querySelector(SEL.marketLink);
    const anchor = market?.parentElement === model.parentElement ? market : nav.querySelector(".wmt-nav-toolbox");
    stonks = navEntry(model, {cls: "wmt-nav-stonks", href: "#stonks", label: "Stonks", icon: stonksOutlineSvg(), onClick: then(openStonks)});
    anchor.parentElement.insertBefore(stonks, anchor.nextSibling);
  } else if (!isOn("stonks") && stonks) {
    stonks.remove();
    stonks = null;
  }
  // Le menu « Plus » garde son apparence : l'entrée active est celle de la barre du bas, d'un autre style
  if (!popup) markStonksNav(nav, stonks);
}

// Page Stonks ouverte : son entrée prend l'apparence de l'entrée active du site, et celle-ci
// l'apparence de notre entrée au repos. À la fermeture sans changer de page, l'entrée du site reprend
// la sienne ; après un changement de page, le site a déjà remis ses entrées à jour lui-même.
const swaps = new Map(); // menu → {site, siteClass, siteCurrent, link, linkClass, path}
function markStonksNav(nav, link) {
  const open = Boolean(link) && isOn("stonks") && isStonksOpen();
  const swapped = swaps.get(nav);
  if (swapped && (!open || swapped.link !== link)) {
    const {site, siteClass, siteCurrent, path} = swapped;
    if (location.pathname === path && site.isConnected) {
      site.className = siteClass;
      if (siteCurrent != null) site.setAttribute("aria-current", siteCurrent);
    }
    swapped.link.className = swapped.linkClass;
    swapped.link.removeAttribute("aria-current");
    swaps.delete(nav);
  }
  if (!open || swaps.has(nav)) return;
  const active = [...nav.querySelectorAll("a[href^='/']")].find(isActiveLink);
  if (!active) return;
  swaps.set(nav, {site: active, siteClass: active.className, siteCurrent: active.getAttribute("aria-current"), link, linkClass: link.className, path: location.pathname});
  active.className = link.className.replace(/\s*\bwmt-\S+/g, "").trim();
  active.removeAttribute("aria-current");
  link.className = `${swaps.get(nav).siteClass} wmt-nav-link wmt-nav-stonks`;
  link.setAttribute("aria-current", "page");
}

// Page Stonks : à la place du contenu de la page en cours. Les blocs de <main> sont masqués (repère
// data-wmt-covered), et rendus à la fermeture.
function ensureStonksPage() {
  const main = isOn("stonks") && isStonksOpen() ? document.querySelector(SEL.main) : null;
  if (main) {
    // À l'ouverture, la page commence en haut (le contenu des pages du site défile dans <main>)
    const opening = !islands.get("stonks")?.host.isConnected;
    showIsland("stonks", StonksPage, {}, appendTo(main));
    if (opening) {
      main.scrollTop = 0;
      window.scrollTo(0, 0);
    }
  } else hideIsland("stonks");
  const host = main && islands.get("stonks").host;
  for (const el of document.querySelectorAll("[data-wmt-covered]")) if (!main || el.parentElement !== main) delete el.dataset.wmtCovered;
  if (main) for (const child of main.children) if (child !== host && child.dataset.wmtCovered == null) child.dataset.wmtCovered = "";
}

// --- Badges sur les cartes
const themeCache = themeMemo();
const themeOf = (info) => themeCache(info.title, {wikipedia_title: info.title, category: info.category, summary: info.summary || ""});

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

// --- Nouvel affichage des cartes (réglage « cardStyle ») : image sur toute la carte, la texture de
// rareté du site devient son cadre, titre et statistiques en surimpression. Chaque partie reçoit un
// repère data-wmt-* et la mise en forme est dans site.css : React ne touche pas à ces attributs, et
// cette boucle les repose si le site reconstruit la carte. Structure non reconnue (le site a changé) :
// la carte garde l'affichage du site.
const MARKS = ["wmtCard", "wmtR", "wmtArt", "wmtFit", "wmtBody", "wmtTexture", "wmtRarity", "wmtPlaceholder", "wmtLogo", "wmtTag", "wmtStats", "wmtStat"];
// Au-delà de ce rapport largeur / hauteur (logo, bandeau, panorama), l'image est montrée
// en entier en haut de la carte, sur un fond fait de sa propre copie floutée
const WIDE = 1.8;
const MARKED = "[data-wmt-art],[data-wmt-body],[data-wmt-texture],[data-wmt-rarity],[data-wmt-placeholder],[data-wmt-logo],[data-wmt-tag],[data-wmt-stats],[data-wmt-stat]";

// Enfant direct de parent (la carte, sa zone image) qui contient el
function partOf(parent, el) {
  while (el && el.parentElement !== parent) el = el.parentElement;
  return el;
}

function tileParts(tile, titleEl) {
  const body = partOf(tile, titleEl);
  const art = [...tile.children].find((c) => c.tagName === "DIV" && c !== body && c.querySelector("img"));
  return {body, art, texture: tile.querySelector(SEL.tileTexture), placeholder: art?.querySelector(SEL.placeholderImg) || null};
}

function unstyleTile(tile) {
  for (const el of [tile, ...tile.querySelectorAll(MARKED)]) for (const k of MARKS) delete el.dataset[k];
  for (const el of tile.querySelectorAll(".wmt-art-backdrop")) el.remove();
}

// Image large : affichée en entier, sur sa copie floutée ; sinon elle couvre toute la carte
function fitArt(art) {
  const img = art.querySelector("img.wmt-fallback-img") || art.querySelector("img:not([data-wmt-placeholder]):not(.wmt-art-backdrop)");
  if (!img || img.closest("[data-wmt-placeholder]")) return;
  if (!img.complete || !img.naturalWidth) {
    img.addEventListener("load", () => art.isConnected && "wmtArt" in art.dataset && fitArt(art), {once: true});
    return;
  }
  const wide = img.naturalWidth / img.naturalHeight > WIDE;
  const src = img.currentSrc || img.src;
  let backdrop = art.querySelector(":scope > .wmt-art-backdrop");
  if (wide) {
    art.dataset.wmtFit = "wide";
    if (!backdrop) {
      backdrop = document.createElement("img");
      backdrop.className = "wmt-art-backdrop";
      backdrop.alt = "";
      backdrop.referrerPolicy = "no-referrer";
      art.prepend(backdrop);
    }
    if (backdrop.getAttribute("src") !== src) backdrop.src = src;
  } else {
    delete art.dataset.wmtFit;
    backdrop?.remove();
  }
}

function styleTile(tile, {body, art, texture, placeholder}, rarity) {
  if (!isOn("cardStyle") || !body || !art || !texture) {
    if ("wmtCard" in tile.dataset) unstyleTile(tile);
    return;
  }
  tile.dataset.wmtCard = "";
  tile.dataset.wmtR = rarity || "";
  texture.dataset.wmtTexture = "";
  body.dataset.wmtBody = "";
  art.dataset.wmtArt = !placeholder ? "image" : art.querySelector(".wmt-fallback-img") ? "filled" : "empty";
  // Sans image : la carte sans image du site (son logo sur la texture de la rareté), le logo
  // remonté au-dessus du texte
  if (placeholder) {
    placeholder.dataset.wmtPlaceholder = "";
    partOf(art, placeholder).dataset.wmtLogo = "";
  }
  if (art.dataset.wmtArt !== "empty") fitArt(art);
  const badge = [...tile.children].find((c) => c !== body && c !== art && rarity && c.textContent.trim().toUpperCase() === rarity);
  if (badge) badge.dataset.wmtRarity = "";
  for (const tag of body.querySelectorAll(SEL.tileTag)) tag.dataset.wmtTag = "";
  for (const [sel, kind] of [[SEL.statAttack, "atk"], [SEL.statDefense, "def"]]) {
    const stat = body.querySelector(sel)?.parentElement;
    if (!stat) continue;
    stat.dataset.wmtStat = kind;
    stat.parentElement.dataset.wmtStats = "";
  }
}

// Carte sans image : image cherchée sur Wikimedia (réglage « missingImages »), jamais pour une image
// que le site a masquée. Si l'on ne sait pas encore si elle l'a été, la carte est d'abord relue.
function fillMissingImage(tile, info, {art, placeholder}, title) {
  if (!isOn("missingImages") || !visible.has(tile) || !art || !placeholder || info.image_url) return;
  if (art.querySelector(".wmt-fallback-img") || info.hide_image === true) return;
  if (info.hide_image !== false) {
    resolveCard(title);
    return;
  }
  wikiImage(title, info.category || "").then((src) => {
    if (!src || !art.isConnected || art.querySelector(".wmt-fallback-img")) return;
    const img = document.createElement("img");
    img.className = "wmt-fallback-img";
    img.alt = "";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => {
      img.remove();
      if (art.dataset.wmtArt === "filled") art.dataset.wmtArt = "empty";
    });
    img.src = src;
    art.append(img);
    if ("wmtArt" in art.dataset) {
      art.dataset.wmtArt = "filled";
      fitArt(art);
    }
  });
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
  const rarity = tileRarity(tile, info?.rarity);
  const parts = tileParts(tile, titleEl);
  styleTile(tile, parts, rarity);
  fillMissingImage(tile, info, parts, title);
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

  // Marché : l'enchère est retrouvée par le lien de la carte ; une carte shiny a son propre prix
  const auction = path.startsWith("/marketplace") ? auctionById(AUCTION_PATH.exec(tile.closest("a[href]")?.getAttribute("href") || "")?.[1]) : null;
  const shiny = Boolean(auction?.is_shiny) || isShinyTile(tile);
  const fmt = (n) => n.toLocaleString("fr-FR");
  if (info.id && isOn("priceBadges")) {
    const p = priceInfo(info.id, rarity, {shiny});
    if (p?.price != null)
      box.append(
        p.reliable
          ? chip("wmt-chip-price", `${fmt(p.price)} ₩`, `Prix du marché${shiny ? " shiny" : ""} pour cette rareté`)
          : chip("wmt-chip-price wmt-chip-approx", `≈ ${fmt(p.price)} ₩`, uncertainNote(p)),
      );
    else if (visible.has(tile)) requestPrice(info.id, {rarity});
  }
  // Mise comparée au prix du marché, s'il est fiable. Une mise de départ est presque toujours basse et
  // l'enchère va monter : « bonne affaire » seulement pour une enchère qui se termine bientôt ;
  // « trop cher » dès que la mise minimale dépasse nettement ce que la carte vaut d'habitude.
  if (isOn("dealBadges") && auction) {
    const cardId = auction.card_id || info.id;
    const bid = nextBid(auction);
    const avg = priceOf(cardId, auction.snapshot_rarity || rarity, {shiny});
    if (avg && bid) {
      const gap = Math.round((100 * (bid - avg)) / avg);
      const left = msLeft(auction);
      if (gap <= -25 && left > 0 && left < DEAL_WINDOW)
        box.append(chip("wmt-chip-deal", `−${-gap} %`, `Bonne affaire : se termine dans ${Math.ceil(left / 60000)} min, mise minimale ${fmt(bid)} ₩ pour un prix du marché de ${fmt(avg)} ₩`));
      else if (gap >= 50) box.append(chip("wmt-chip-pricey", `+${gap} %`, `Mise minimale ${fmt(bid)} ₩ pour un prix du marché de ${fmt(avg)} ₩`));
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
    if (theme && theme !== otherTheme()) {
      const el = chip("wmt-chip-theme", theme.split(" ")[0], theme);
      el.style.setProperty("--wmt-theme", tagColor(theme));
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
}

// --- Bouton « Tout ouvrir » à côté du bouton « Ouvrir » de la page Paquets
function ensureOpenAllButton() {
  const existing = document.querySelector(".wmt-open-all");
  // Seulement sur l'écran d'accueil des paquets, collé au bouton « Ouvrir » (absent pendant la révélation)
  const open = currentPath().startsWith("/pulls") && isOn("openAll") ? findButton((t) => SEL.openButtonText.test(t)) : null;
  if (!open || findButton((t) => SEL.revealButtonText.test(t))) {
    existing?.remove();
    return;
  }
  let btn = existing?.previousElementSibling === open ? existing : null;
  if (!btn) {
    existing?.remove();
    btn = document.createElement("button");
    btn.type = "button";
    btn.className = "wmt-open-all";
    btn.append(svgElement(markSvg({size: 16})), document.createElement("span"));
    btn.title = "WikiMasters Toolbox : ouvre tous les paquets disponibles, sans animation";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      emit("confirm-open-all", {});
    });
    open.insertAdjacentElement("afterend", btn);
  }
  // Progression : le site impose un délai entre deux paquets, l'ouverture prend quelques secondes par paquet
  const {running, opened} = openAllState.get();
  const label = running ? `Ouverture… (${opened})` : "Tout ouvrir";
  if (btn.lastChild.textContent !== label) btn.lastChild.textContent = label;
  btn.disabled = running;
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

// Pendant la révélation, le site centre la carte dans une rangée (flex) : placé à côté de la carte,
// le récapitulatif passerait à sa droite. Il se place donc après le bloc de la page qui contient
// la révélation (enfant de <main>) : sous la carte, centré, avec toute la largeur de la page.
const revealBlock = (button) => sectionOf(button, button.closest("main"));

// « Ouvrir le prochain » (bouton du récapitulatif, sur clic du joueur) : « Continuer » puis « Ouvrir »
// du site, qui garde son animation et, s'il la demande, sa vérification anti-robot.
export async function openNextPack() {
  const reveal = findButton((t) => t === "Continuer");
  if (!reveal) throw new Error("Bouton « Continuer » introuvable : terminez la révélation des cartes sur la page.");
  reveal.click();
  // L'écran d'accueil revient aussitôt ; son bouton « Ouvrir » reste désactivé le temps de relire les paquets
  for (let waited = 0; waited < 8000; waited += 100) {
    await sleep(100);
    const open = findButton((t) => t === "Ouvrir");
    if (open && !open.disabled) return open.click();
  }
  throw new Error("Le bouton « Ouvrir » du site n'est pas disponible : ouvrez le paquet depuis la page.");
}

// Élément de l'écran d'accueil sous lequel on s'insère : le compteur de paquets qui suit « Ouvrir »
function homeAnchor() {
  const open = findButton((t) => SEL.openButtonText.test(t));
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
        recapAnchor = revealBlock(reveal);
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
      mountPackRecap(recapHost, {onNext: openNextPack});
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

// Collection : barre sous la recherche et les filtres de rareté. Dès qu'un filtre de la barre est
// choisi (doublons, sans image, GIF, prix de vente…), sa liste (toute la collection) remplace la
// grille du site (une page de 50 cartes), masquée ; quitter la page revient à la grille.
function ensureCollectionBar() {
  const title = currentPath() === "/collection" && isOn("collectionBar") ? document.querySelector(SEL.pageTitle) : null;
  const search = title && document.querySelector(SEL.collectionSearch);
  const filters = search && sectionOf(search, title);
  if (filters) showIsland("collection", CollectionBar, {onOpen: openCardOnSite}, after(filters));
  else {
    hideIsland("collection");
    setCollectionView(null);
  }
  // Grille du site : le bloc voisin de la barre qui contient les cartes, jamais celui du titre ou de la recherche
  const tile = filters && collectionView.get().open ? document.querySelector(`main ${SEL.tile}`) : null;
  const grid = tile && sectionOf(tile, islands.get("collection").host);
  const hidden = grid && !grid.contains(title) && !grid.contains(search) ? grid : null;
  for (const el of document.querySelectorAll("[data-wmt-hidden]")) if (el !== hidden) delete el.dataset.wmtHidden;
  if (hidden) hidden.dataset.wmtHidden = "";
}

// Fenêtre d'une carte du site, ouverte depuis une liste de la barre de la Collection (clic du joueur
// sur une carte) : la recherche du site affiche la carte, qui est cliquée dans la grille (même
// masquée) ; la recherche reprend ensuite sa valeur, la fenêtre du site restant ouverte.
export async function openCardOnSite({title, rarity}) {
  const input = document.querySelector(SEL.collectionSearch);
  if (!input) throw new Error("Ouvrez la page Collection pour afficher cette carte.");
  const wanted = normTitle(title);
  const find = () => [...document.querySelectorAll(`main ${SEL.tile}`)].find((t) => normTitle(t.querySelector(SEL.tileTitle)?.textContent || "") === wanted && (!rarity || tileRarity(t) === rarity));
  const previous = input.value;
  let tile = find();
  if (!tile) {
    typeInto(input, title);
    for (let waited = 0; !tile && waited < 20000; waited += 200) {
      await sleep(200);
      tile = find();
    }
  }
  tile?.click();
  if (input.value !== previous) typeInto(input, previous);
  if (!tile) throw new Error(`« ${title} » n'apparaît pas dans la grille du site : un filtre de rareté du site est peut-être actif.`);
}

// Saisie dans un champ du site (React) : valeur posée par le setter natif, puis événement input,
// comme une frappe du joueur
function typeInto(input, value) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
  input.dispatchEvent(new Event("input", {bubbles: true}));
}

// Grande carte d'une fenêtre dont le titre est celui de la carte. Les autres fenêtres qui montrent des
// cartes (« Échanger avec … » et sa liste de cartes) n'en ont pas.
function modalCard(modal) {
  const title = normTitle(modal.querySelector(SEL.modalTitle)?.textContent);
  return title ? [...modal.querySelectorAll(SEL.modalTile)].find((t) => normTitle(t.querySelector(SEL.tileTitle)?.textContent) === title) : null;
}

// Fenêtre d'une carte (collection, profils, toutes les cartes) : bloc sous les détails
function ensureCardInsight() {
  const modal = isOn("cardInsight") ? [...document.querySelectorAll(SEL.modal)].find(modalCard) : null;
  const titleEl = modal?.querySelector(SEL.modalTitle);
  const tile = modal && modalCard(modal);
  // Colonne des détails : le bloc qui contient le titre, à côté de la grande carte
  const details = titleEl && tile && sectionOf(titleEl, tile);
  if (!details || details.contains(tile)) return hideIsland("card");
  const title = normTitle(titleEl.textContent);
  const info = lookupTitle(title) || {};
  if (!info.id) resolveCard(title);
  const card = {
    id: info.id || null,
    title,
    rarity: tileRarity(tile, info.rarity),
    shiny: isShinyTile(tile),
    category: info.category || titleEl.parentElement?.parentElement?.querySelector("p")?.textContent.trim() || "",
    summary: info.summary || "",
    image_url: info.image_url || null,
    hide_image: info.hide_image ?? null,
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

// Fenêtre « Échanger avec … » : bilan de la proposition sous la barre des nombres de cartes. Le site
// n'affiche que les cartes choisies de l'onglet ouvert : celles de chaque côté sont relevées quand son
// onglet est ouvert, et gardées tant que la fenêtre reste ouverte.
let tradeDraft = null; // {modal, friend, mine, theirs}
const countOf = (text) => Number(String(text || "").replace(/\D/g, "")) || 0;
function ensureTradeRecap() {
  const mineLabel = isOn("tradeRecap")
    ? [...document.querySelectorAll(SEL.modal)].flatMap((m) => [...m.querySelectorAll("span")]).find((el) => SEL.tradeMine.test(el.textContent.trim()))
    : null;
  const bar = mineLabel?.parentElement;
  const theirLabel = bar && [...bar.children].find((el) => el !== mineLabel && el.tagName === "SPAN" && SEL.tradeCounts.test(el.textContent));
  const modal = theirLabel && bar.closest(SEL.modal);
  const mineTab = modal && [...modal.querySelectorAll("button")].find((b) => SEL.tradeMineTab.test(b.textContent.trim()));
  if (!mineTab) {
    tradeDraft = null;
    return hideIsland("trade");
  }
  const friend = theirLabel.textContent.split(":")[0].trim();
  if (tradeDraft?.modal !== modal || tradeDraft.friend !== friend) tradeDraft = {modal, friend, mine: [], theirs: []};
  // Onglet ouvert : ses cartes choisies remplacent celles relevées pour ce côté
  const active = [...mineTab.parentElement.children].find((b) => b.tagName === "BUTTON" && b.className.includes(SEL.tradeActiveTab));
  if (active) {
    const heading = [...modal.querySelectorAll("p")].find((p) => SEL.tradeSelected.test(p.textContent.trim()));
    const cards = [...(heading?.parentElement.querySelectorAll(SEL.tile) || [])].map((tile) => {
      const title = normTitle(tile.querySelector(SEL.tileTitle)?.textContent);
      const info = lookupTitle(title);
      if (!info?.id) resolveCard(title);
      return {title, id: info?.id || null, rarity: tileRarity(tile, info?.rarity), shiny: isShinyTile(tile)};
    });
    tradeDraft[active === mineTab ? "mine" : "theirs"] = cards;
  }
  const side = (label, cards) => {
    const [, count, wb] = SEL.tradeCounts.exec(label.textContent) || [];
    return {cards, count: countOf(count), wb: countOf(wb)};
  };
  showIsland("trade", TradeRecap, {friend, give: side(mineLabel, tradeDraft.mine), get: side(theirLabel, tradeDraft.theirs)}, after(bar));
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
  attempt("bilan d'un échange", ensureTradeRecap);
  attempt("page Stonks", ensureStonksPage);
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
  settings.subscribe(bump);
  owned.subscribe(bump);
  auctionVersion.subscribe(bump);
  // Les pastilles « bonne affaire » dépendent du temps restant
  setInterval(() => currentPath().startsWith("/marketplace") && bump(), 60000);
  recapState.subscribe(schedule);
  openAllState.subscribe(schedule);
  pullStats.subscribe(schedule);
  collectionRarity.subscribe(schedule);
  collectionView.subscribe(schedule);
  stonksPage.subscribe(schedule);
  // Page Stonks ouverte : un lien du site (menu, logo) la ferme, même vers la page en cours
  document.addEventListener(
    "click",
    (e) => {
      if (!isStonksOpen() || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target.closest?.(SEL.siteLink);
      if (link && !link.classList.contains("wmt-nav-link")) closeStonks();
    },
    true,
  );
  // Ignore nos propres ajouts (badges, images) pour ne pas boucler
  const ours = (n) => n.nodeType === 1 && /\bwmt-/.test(n.className || "");
  new MutationObserver((mutations) => {
    if (mutations.every((m) => m.target.closest?.(".wmt-tile-badges") || ([...m.addedNodes].every(ours) && !m.removedNodes.length))) return;
    schedule();
  }).observe(document.documentElement, {childList: true, subtree: true});
  schedule();
}
