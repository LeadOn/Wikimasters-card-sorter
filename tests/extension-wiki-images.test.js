// Images de remplacement cherchées sur Wikimedia : ordre des sources, prudence (sujets sensibles,
// liste des images à ne pas afficher), pages d'homonymie, limite de requêtes et cache.
const test = require("node:test");
const assert = require("node:assert/strict");
const {loadExtensionModule, response} = require("./helpers/extension");

function fakeChrome() {
  const data = {};
  globalThis.chrome = {
    runtime: {id: "test"},
    storage: {
      local: {
        get: async (key) => Object.fromEntries([].concat(key).filter((k) => k in data).map((k) => [k, data[k]])),
        set: async (obj) => Object.assign(data, structuredClone(obj)),
        remove: async (key) => [].concat(key).forEach((k) => delete data[k]),
      },
      onChanged: {addListener() {}, removeListener() {}},
    },
  };
}

// Faux Wikimedia : pages par wiki (titre → page), éléments Wikidata (id → claims, sitelinks) et
// fichiers de la liste des images à ne pas afficher (bad : noms de fichiers)
function fakeWikimedia({fr = {}, en = {}, wikidata = {}, bad = [], status = 200} = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = new URL(url);
    const p = Object.fromEntries(u.searchParams);
    calls.push({host: u.host, params: p, agent: init?.headers?.["Api-User-Agent"]});
    if (status !== 200) return response(status, "You are making too many requests");
    if (u.host === "en.wikipedia.org" && p.prop === "imageinfo") return response(200, {query: {pages: [{title: p.titles, badfile: bad.includes(p.titles.replace(/^File:/, ""))}]}});
    if (u.host === "fr.wikipedia.org" || u.host === "en.wikipedia.org") {
      const page = (u.host === "fr.wikipedia.org" ? fr : en)[p.titles];
      return response(200, {query: {pages: [page ? {title: p.titles, ...page} : {title: p.titles, missing: true}]}});
    }
    if (u.host === "www.wikidata.org") return response(200, {entities: Object.fromEntries(p.ids.split("|").map((id) => [id, wikidata[id] || {}]))});
    throw new Error(`hôte inattendu ${u.host}`);
  };
  return calls;
}

const claim = (value, rank = "normal") => ({rank, mainsnak: {datavalue: {value}}});
const thumb = (name) => ({source: `https://upload.wikimedia.org/wikipedia/commons/thumb/${name}`});
const filePath = (name) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=640`;

function load() {
  fakeChrome();
  return loadExtensionModule("extension/src/content/features/wiki-images.js");
}

test("images : l'article français d'abord, sans autre requête", async () => {
  const m = load();
  const calls = fakeWikimedia({fr: {"Coca-Cola": {thumbnail: thumb("coca.jpg"), pageprops: {wikibase_item: "Q2813"}}}});
  assert.equal(await m.findWikiImage("Coca-Cola"), "https://upload.wikimedia.org/wikipedia/commons/thumb/coca.jpg");
  assert.equal(calls.length, 1);
  assert.match(calls[0].agent, /^WikiMastersToolbox\//);
});

test("images : puis l'image Wikidata, rang préféré avant normal, jamais obsolète", async () => {
  const m = load();
  fakeWikimedia({
    fr: {Limoncello: {pageprops: {wikibase_item: "Q1"}}},
    wikidata: {Q1: {claims: {P18: [claim("Ancienne.jpg", "deprecated"), claim("Normale.jpg"), claim("Préférée.jpg", "preferred")]}}},
  });
  assert.equal(await m.findWikiImage("Limoncello"), filePath("Préférée.jpg"));
});

test("images : ordre des sources quand Wikidata n'a pas d'image principale", async () => {
  const m = load();
  // Article anglais (affiche, pochette) avant logo, drapeau, catégorie Commons et carte
  let calls = fakeWikimedia({
    fr: {Film: {pageprops: {wikibase_item: "Q1"}}},
    en: {"Film (en)": {thumbnail: thumb("poster.jpg")}},
    wikidata: {Q1: {claims: {P154: [claim("Logo.svg")]}, sitelinks: {enwiki: {title: "Film (en)"}}}},
  });
  assert.match(await m.findWikiImage("Film"), /poster\.jpg$/);
  assert.deepEqual(calls.map((c) => c.host), ["fr.wikipedia.org", "www.wikidata.org", "en.wikipedia.org"]);
  assert.ok(!calls.some((c) => c.params.prop === "imageinfo"), "pas de vérification sans fichier à vérifier");

  // Duo : photo d'un de ses membres
  fakeWikimedia({
    fr: {Duo: {pageprops: {wikibase_item: "Q1"}}},
    wikidata: {Q1: {claims: {P527: [{mainsnak: {datavalue: {value: {id: "Q2"}}}}, {mainsnak: {datavalue: {value: {id: "Q3"}}}}], P154: [claim("Logo.svg")]}}, Q3: {claims: {P18: [claim("Membre.jpg")]}}},
  });
  assert.equal(await m.findWikiImage("Duo"), filePath("Membre.jpg"));

  // Logo avant catégorie Commons
  fakeWikimedia({fr: {Marque: {pageprops: {wikibase_item: "Q1"}}}, wikidata: {Q1: {claims: {P154: [claim("Logo.svg")], P373: [claim("Marque")]}}}});
  assert.equal(await m.findWikiImage("Marque"), filePath("Logo.svg"));

  // Catégorie Commons : jamais utilisée (photos trop souvent sans rapport avec le sujet)
  fakeWikimedia({fr: {Lieu: {pageprops: {wikibase_item: "Q1"}}}, wikidata: {Q1: {claims: {P373: [claim("Lieu")]}}}});
  assert.equal(await m.findWikiImage("Lieu"), null);

  // Rien d'autre : la carte de localisation
  fakeWikimedia({fr: {Canton: {pageprops: {wikibase_item: "Q1"}}}, wikidata: {Q1: {claims: {P242: [claim("Carte.svg")]}}}});
  assert.equal(await m.findWikiImage("Canton"), filePath("Carte.svg"));
});

test("images : sujet sensible → seulement les images principales des articles de Wikipédia", async () => {
  const m = load();
  const wikidata = {Q1: {claims: {P18: [claim("Photo opératoire.jpg")], P373: [claim("Vaginoplastie")]}, sitelinks: {enwiki: {title: "Vaginoplasty"}}}};
  let calls = fakeWikimedia({fr: {Vaginoplastie: {pageprops: {wikibase_item: "Q1"}}}, wikidata});
  assert.equal(await m.findWikiImage("Vaginoplastie", "opération de chirurgie plastique"), null);
  assert.ok(!calls.some((c) => c.params.prop === "imageinfo"));
  // L'image principale de l'article anglais reste acceptée
  fakeWikimedia({fr: {Vaginoplastie: {pageprops: {wikibase_item: "Q1"}}}, en: {Vaginoplasty: {thumbnail: thumb("schema.png")}}, wikidata});
  assert.match(await m.findWikiImage("Vaginoplastie", ""), /schema\.png$/);
  // Description sensible, titre anodin
  calls = fakeWikimedia({fr: {"Affaire X": {pageprops: {wikibase_item: "Q1"}}}, wikidata: {Q1: {claims: {P18: [claim("Scène.jpg")]}}}});
  assert.equal(await m.findWikiImage("Affaire X", "meurtre commis en 1990"), null);
  // Un mot qui en contient un autre ne déclenche pas la prudence (Essex, au sein de…)
  fakeWikimedia({fr: {Essex: {pageprops: {wikibase_item: "Q1"}}}, wikidata: {Q1: {claims: {P18: [claim("Essex.jpg")]}}}});
  assert.equal(await m.findWikiImage("Essex", "comté au sein de l'Angleterre"), filePath("Essex.jpg"));
});

test("images : un fichier de la liste des images à ne pas afficher est écarté", async () => {
  const m = load();
  fakeWikimedia({
    fr: {Groupe: {pageprops: {wikibase_item: "Q1"}}},
    wikidata: {Q1: {claims: {P18: [claim("Interdite.jpg")], P154: [claim("Logo.svg")]}}},
    bad: ["Interdite.jpg"],
  });
  assert.equal(await m.findWikiImage("Groupe"), filePath("Logo.svg"));
});

test("images : pas d'image pour une page d'homonymie, un article absent ou une adresse étrangère", async () => {
  const m = load();
  const calls = fakeWikimedia({
    fr: {Jarov: {pageprops: {wikibase_item: "Q1", disambiguation: ""}}, Piège: {thumbnail: {source: "https://exemple.com/x.jpg"}}},
    wikidata: {Q1: {claims: {P18: [claim("Jarov.jpg")]}}},
  });
  assert.equal(await m.findWikiImage("Jarov"), null);
  assert.equal(calls.length, 1);
  assert.equal(await m.findWikiImage("Inconnu"), null);
  assert.equal(await m.findWikiImage("Piège"), null);
});

test("images : trop de requêtes → pause, rien n'est mémorisé ; le cache évite de redemander", async () => {
  const m = load();
  let calls = fakeWikimedia({status: 429});
  assert.equal(await m.findWikiImage("Coca-Cola"), undefined);
  // Pendant la pause, aucune requête ne part
  calls = fakeWikimedia({fr: {"Coca-Cola": {thumbnail: thumb("coca.jpg")}}});
  assert.equal(await m.findWikiImage("Coca-Cola"), undefined);
  assert.equal(calls.length, 0);

  const fresh = load();
  calls = fakeWikimedia({fr: {"Coca-Cola": {thumbnail: thumb("coca.jpg")}}});
  assert.match(await fresh.wikiImage("Coca-Cola"), /coca\.jpg$/);
  assert.match(await fresh.wikiImage("Coca-Cola"), /coca\.jpg$/);
  assert.match(fresh.knownWikiImage("Coca-Cola"), /coca\.jpg$/);
  assert.equal(calls.length, 1);
  assert.equal(fresh.knownWikiImage("Jamais cherchée"), undefined);
});
