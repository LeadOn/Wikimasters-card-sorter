// Langue de l'interface, d'après celle du navigateur : français, sinon anglais. Fixée au chargement,
// avant tout texte : les constantes de module peuvent donc appeler L().
import {pickLang, setLang, L} from "../../../core/i18n";

export const LANG = setLang(pickLang(typeof navigator === "undefined" ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]));
// Nombres et dates
export const LOCALE = LANG === "en" ? "en-US" : "fr-FR";

export {L};
