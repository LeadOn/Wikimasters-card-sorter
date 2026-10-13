// Moteur partagé de WikiMasters Toolbox (scripts Node, tests, extension).
"use strict";

module.exports = {
  ...require("./text"),
  ...require("./themes"),
  ...require("./categorize"),
  ...require("./profiles"),
  ...require("./builtin-profiles"),
  ...require("./tag-sync"),
  ...require("./tag-writer"),
  ...require("./prices"),
  ...require("./trade"),
  ...require("./families"),
  ...require("./share-code"),
};
