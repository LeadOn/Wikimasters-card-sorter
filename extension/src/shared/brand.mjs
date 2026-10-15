// Identité visuelle de la Toolbox, partagée par l'interface, la popup, l'intégration au site et
// le générateur d'icônes (extension/make-icons.mjs). Sans dépendance ni JSX.
//
// La marque est une fiche (une carte) avec un onglet de classement : le tri est le cœur de l'outil.
// Les icônes suivent une grille de 20 × 20 : trait de 1,5, extrémités carrées, angles vifs ;
// les aplats sont écrits avec fill="currentColor" pour s'afficher aussi hors de la feuille de style.

export const BRAND = {
  graphite: "#191917",
  bone: "#eeece5",
  lime: "#c5ef55",
};

// Marque sur une grille de 24 × 24 : rectangles arrondis [x, y, largeur, hauteur, rayon].
// L'onglet est dessiné d'abord, la fiche le recouvre (seuls ses coins droits restent arrondis).
export const MARK = {
  tab: [14, 6.5, 5.5, 5, 1],
  card: [5, 3, 11, 18, 1.5],
};

const rect = ([x, y, w, h, r], fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`;

// Contenu SVG de la marque (viewBox 0 0 24 24)
export const markInner = ({card = BRAND.bone, tab = BRAND.lime} = {}) => rect(MARK.tab, tab) + rect(MARK.card, card);

export const markSvg = ({size = 20, ...colors} = {}) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${markInner(colors)}</svg>`;

// Variante au trait, dans la couleur du texte : entrée « Toolbox » du menu du site (icônes 24 px au trait de 2)
export const markOutlineSvg = (size = 24) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="11" height="18" rx="1.5"/><path d="M16 6.5h2.5a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H16z" fill="currentColor"/></svg>`;

// Entrée « Stonks » du menu du site, dessinée comme les icônes du menu (grille de 24, trait de 2) :
// une courbe qui monte, sur une ligne de base
export const stonksOutlineSvg = (size = 24) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 20h18"/><path d="M4 15.5l5-5 3.5 3.5L19 7.5"/><path d="M14.5 7.5H19V12"/></svg>`;

const F = 'fill="currentColor" stroke="none"';

export const ICONS = {
  // Onglets
  sort: `<path d="M2.75 6.25h14.5M2.75 11.25h14.5M2.75 16.25h14.5"/><path ${F} d="M4 3.25h4.5v3H4zM8 8.25h4.5v3H8zM12 13.25h4.5v3H12z"/>`,
  profiles: '<circle cx="7.5" cy="6.75" r="2.75"/><path d="M2.75 16.75v-1a4.75 4.75 0 0 1 9.5 0v1"/><path d="M12.75 4.25a2.6 2.6 0 0 1 0 5"/><path d="M14.75 11.5a4.6 4.6 0 0 1 2.5 4.25v1"/>',
  trades: '<path d="M3 6.5h13.25M12.75 3l3.5 3.5-3.5 3.5"/><path d="M17 13.5H3.75M7.25 10l-3.5 3.5 3.5 3.5"/>',
  prices: `<path d="M10.25 2.75h7v7l-7.5 7.5-7-7z"/><path ${F} d="M12.75 5.25h2v2h-2z"/>`,
  market: '<path d="M10.17 4.25l5.83 5.83-2.83 2.83-5.83-5.83z"/><path d="M10.25 10 3.75 16.5M10.75 17.25h6.5"/>',
  packs: `<path d="M4.75 4.5 6.5 3l1.75 1.5L10 3l1.75 1.5L13.5 3l1.75 1.5v11L13.5 17l-1.75-1.5L10 17l-1.75-1.5L6.5 17l-1.75-1.5z"/><path ${F} d="M10 7.5 12.5 10 10 12.5 7.5 10z"/>`,
  families: `<path ${F} d="M2.75 2.75h6v7h-6zM11.25 2.75h6v7h-6z"/><path d="M3.5 11h4.5v5.5H3.5zM12 11h4.5v5.5H12z"/>`,
  images: `<path d="M2.75 3.75h14.5v12.5H2.75z"/><path d="M2.75 14l4.5-4.5 3.25 3.25 2-2 4.75 4.75"/><path ${F} d="M12.5 6h2.25v2.25H12.5z"/>`,
  settings: '<path d="M2.75 6.5h3.5M10.25 6.5h7M2.75 13.5h8.5M15.25 13.5h2"/><path d="M6.25 4.5h4v4h-4zM11.25 11.5h4v4h-4z"/>',
  // Actions et états
  close: '<path d="M5 5l10 10M15 5 5 15"/>',
  back: '<path d="M16.5 10H4M8.5 5.5 4 10l4.5 4.5"/>',
  more: `<path ${F} d="M3.5 8.5h3v3h-3zM8.5 8.5h3v3h-3zM13.5 8.5h3v3h-3z"/>`,
  check: '<path d="M3.75 10.25l4 4 8.5-8.5"/>',
  plus: '<path d="M10 3.75v12.5M3.75 10h12.5"/>',
  star: '<path d="M10 3.35l1.82 4.74 5.08.27-3.95 3.2 1.31 4.91L10 13.7l-4.26 2.77 1.31-4.91-3.95-3.2 5.08-.27z"/>',
  heart: '<path d="M10 16.5 3.6 10.1a3.6 3.6 0 0 1 5.1-5.1L10 6.3l1.3-1.3a3.6 3.6 0 0 1 5.1 5.1z"/>',
  shine: '<path d="M10 2.75 11.6 8.4l5.65 1.6-5.65 1.6L10 17.25 8.4 11.6 2.75 10l5.65-1.6z"/>',
  alert: `<path d="M10 2.75 17.75 16.5H2.25z"/><path d="M10 7.75v4"/><path ${F} d="M9.25 13.25h1.5v1.5h-1.5z"/>`,
  info: `<circle cx="10" cy="10" r="7.25"/><path d="M10 9v4.75"/><path ${F} d="M9.25 5.75h1.5v1.5h-1.5z"/>`,
  refresh: '<path d="M16.25 10a6.25 6.25 0 1 1-1.83-4.42"/><path d="M15.25 2.5v3.75H11.5"/>',
  discard: '<path d="M3.5 5.5h13M8 5.5V3.25h4V5.5"/><path d="M5 5.5l.9 11.25h8.2L15 5.5"/><path d="M8.5 8.75v5M11.5 8.75v5"/>',
};

// Épaisseur du trait selon la taille d'affichage : 1,5 sur la grille, jamais moins de 1,25 px à l'écran
export const strokeFor = (size) => Math.max(1.5, Math.round((25 / size) * 100) / 100);

// Icône en texte SVG, pour les éléments créés hors de Preact (badges des cartes du site)
export const iconSvg = (name, size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="${strokeFor(size)}" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${ICONS[name]}</svg>`;
