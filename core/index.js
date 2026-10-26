// Moteur partagé de WikiMasters Toolbox (scripts Node, tests, extension).
// Les profils de la bande (builtin-profiles.js) n'en font pas partie : réservés aux scripts Node et
// aux tests, ils ne sont pas inclus dans l'extension publiée.
"use strict";

module.exports = {
  ...require("./text"),
  ...require("./themes"),
  ...require("./theme-set"),
  ...require("./categorize"),
  ...require("./profiles"),
  ...require("./tag-sync"),
  ...require("./tag-writer"),
  ...require("./prices"),
  ...require("./trade"),
  ...require("./families"),
  ...require("./share-code"),
  ...require("./stonks"),
};
