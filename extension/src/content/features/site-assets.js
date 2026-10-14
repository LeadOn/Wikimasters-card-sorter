// Fichiers du site repris par la Toolbox pour dessiner sa carte sans image : son logo sur la texture
// de la rareté (relevés dans ses pages, comme les sélecteurs de site-dom.js). Servis par le site
// lui-même : la Toolbox ne s'affiche que sur ses pages.
const TEXTURES = {L: "legendaire", UR: "ultra_rare", SR: "super_rare", R: "rare", PC: "peu_commun", C: "commun"};

export const siteLogo = () => `${location.origin}/logo-288.webp`;
export const rarityTexture = (rarity) => `${location.origin}/rarity/${TEXTURES[rarity] || TEXTURES.C}.webp`;
