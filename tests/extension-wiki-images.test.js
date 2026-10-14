// Images de remplacement cherchées sur Wikimedia : ordre des sources, prudence (sujets sensibles,
// liste des images à ne pas afficher), pages d'homonymie, limite de requêtes et cache.
const test = require("node:test");
const assert = require("node:assert/strict");
const {loadExtensionModule, response} = require("./helpers/extension");

function fakeChrome(initial = {}) {
  const data = structuredClone(initial);
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

// Faux Wikimedia : pages par wiki (titre → page ; fr, en, et les autres langues dans wikis),
// éléments Wikidata (id → claims, sitelinks, filtrés par sitefilter) et fichiers de la liste des
// images à ne pas afficher (bad : noms de fichiers)
function fakeWikimedia({fr = {}, en = {}, wikis = {}, wikidata = {}, bad = [], status = 200} = {}) {
  const calls = [];
  const pages = {...wikis, fr, en};
  globalThis.fetch = async (url, init) => {
    const u = new URL(url);
    const p = Object.fromEntries(u.searchParams);
    calls.push({host: u.host, params: p, agent: init?.headers?.["Api-User-Agent"]});
    if (status !== 200) return response(status, "You are making too many requests");
    if (u.host === "en.wikipedia.org" && p.prop === "imageinfo") return response(200, {query: {pages: [{title: p.titles, badfile: bad.includes(p.titles.replace(/^File:/, ""))}]}});
    const lang = /^([a-z-]+)\.wikipedia\.org$/.exec(u.host)?.[1];
    if (lang) {
      const page = pages[lang]?.[p.titles];
      return response(200, {query: {pages: [page ? {title: p.titles, ...page} : {title: p.titles, missing: true}]}});
    }
    if (u.host === "www.wikidata.org") {
      const sites = p.sitefilter?.split("|");
      const entity = (e) => (e?.sitelinks && sites ? {...e, sitelinks: Object.fromEntries(Object.entries(e.sitelinks).filter(([k]) => sites.includes(k)))} : e || {});
      return response(200, {entities: Object.fromEntries(p.ids.split("|").map((id) => [id, entity(wikidata[id])]))});
    }
    throw new Error(`hôte inattendu ${u.host}`);
  };
  return calls;
}

const claim = (value, rank = "normal") => ({rank, mainsnak: {datavalue: {value}}});
// Fichier (type commonsMedia) et élément lié (type wikibase-item), comme les renvoie wbgetentities
const media = (value, rank = "normal") => ({rank, mainsnak: {datatype: "commonsMedia", datavalue: {value}}});
const item = (id, rank = "normal") => ({rank, mainsnak: {datatype: "wikibase-item", datavalue: {value: {id}}}});
const thumb = (name) => ({source: `https://upload.wikimedia.org/wikipedia/commons/thumb/${name}`});
const filePath = (name) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=640`;
// Page d'une autre Wikipédia, avec son image principale
const illustrated = (name) => ({thumbnail: thumb(name), pageimage: name});
const links = (titles) => Object.fromEntries(Object.entries(titles).map(([site, title]) => [site, {title}]));

function load(storage) {
  fakeChrome(storage);
  return loadExtensionModule("extension/src/content/features/wiki-images.js");
}

test("images : l'article français d'abord, sans autre requête", async () => {
  const m = load();
  let calls = fakeWikimedia({fr: {"Coca-Cola": {thumbnail: thumb("coca.jpg"), pageprops: {wikibase_item: "Q2813"}}}});
  assert.equal(await m.findWikiImage("Coca-Cola"), "https://upload.wikimedia.org/wikipedia/commons/thumb/coca.jpg");
  assert.equal(calls.length, 1);
  assert.match(calls[0].agent, /^WikiMastersToolbox\//);
  // Miniature servie par thumb.wikimedia.org
  const resized = "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4b/Tour.jpg/960px-Tour.jpg";
  calls = fakeWikimedia({fr: {Paris: {thumbnail: {source: resized}, pageprops: {wikibase_item: "Q90"}}}});
  assert.equal(await m.findWikiImage("Paris"), resized);
  assert.equal(calls.length, 1);
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

test("images : puis l'article dans une autre langue, trouvé par les liens de l'élément Wikidata", async () => {
  const m = load();
  // Avant la carte de localisation ; carte vierge du pays et image « manquante » écartées ;
  // une Wikipédia remplie par un robot (ceb) n'est jamais interrogée
  let calls = fakeWikimedia({
    fr: {Village: {pageprops: {wikibase_item: "Q1"}}},
    wikis: {
      ceb: {"Village (ceb)": illustrated("Village ceb.jpg")},
      de: {"Village (de)": illustrated("Poland_adm_location_map.svg")},
      es: {"Village (es)": illustrated("Ne_havas_libera_imajo.svg")},
      ru: {"Village (ru)": illustrated("Église.jpg")},
    },
    wikidata: {Q1: {claims: {P242: [claim("Carte.svg")]}, sitelinks: links({cebwiki: "Village (ceb)", ruwiki: "Village (ru)", eswiki: "Village (es)", dewiki: "Village (de)"})}},
  });
  assert.match(await m.findWikiImage("Village"), /Église\.jpg$/);
  assert.deepEqual(calls.map((c) => c.host), ["fr.wikipedia.org", "www.wikidata.org", "de.wikipedia.org", "es.wikipedia.org", "ru.wikipedia.org", "en.wikipedia.org"]);
  assert.match(calls[1].params.sitefilter, /^enwiki\|dewiki\|/);
  assert.ok(!calls[1].params.sitefilter.split("|").includes("cebwiki"));
  assert.equal(calls.at(-1).params.titles, "File:Église.jpg", "vérifiée contre la liste des images à ne pas afficher");

  // Les sources de Wikidata d'abord : le logo, sans interroger les autres Wikipédias
  calls = fakeWikimedia({
    fr: {Marque: {pageprops: {wikibase_item: "Q1"}}},
    wikis: {de: {Marke: illustrated("Laden.jpg")}},
    wikidata: {Q1: {claims: {P154: [claim("Logo.svg")]}, sitelinks: links({dewiki: "Marke"})}},
  });
  assert.equal(await m.findWikiImage("Marque"), filePath("Logo.svg"));
  assert.ok(!calls.some((c) => c.host === "de.wikipedia.org"));

  // Image de la liste des images à ne pas afficher écartée ; cinq autres Wikipédias au plus
  const langs = ["de", "es", "it", "nl", "pt", "ru"];
  calls = fakeWikimedia({
    fr: {Sujet: {pageprops: {wikibase_item: "Q1"}}},
    wikis: {de: {"Sujet (de)": illustrated("Interdite.jpg")}, ru: {"Sujet (ru)": illustrated("Photo.jpg")}},
    wikidata: {Q1: {sitelinks: links(Object.fromEntries(langs.map((l) => [`${l}wiki`, `Sujet (${l})`])))}},
    bad: ["Interdite.jpg"],
  });
  assert.equal(await m.findWikiImage("Sujet"), null);
  const asked = calls.filter((c) => c.params.prop === "pageimages|pageprops").map((c) => c.host);
  assert.deepEqual(asked, ["fr", ...langs.slice(0, 5)].map((l) => `${l}.wikipedia.org`));
});

test("images : puis les autres fichiers de l'élément Wikidata, avant sa carte de localisation", async () => {
  const m = load();
  // « Image apparentée » d'abord, signature en dernier ; tombe, son, vidéo et cartes écartés
  const claims = {
    P109: [media("Signature.svg")],
    P1442: [media("Tombe.jpg")],
    P51: [media("Hymne.ogg")],
    P1943: [media("Situation.png")],
    P8592: [media("Vue aérienne.jpg")],
    P6802: [media("Apparentée.jpg")],
    P242: [media("Carte.svg")],
  };
  fakeWikimedia({fr: {Lieu: {pageprops: {wikibase_item: "Q1"}}}, wikidata: {Q1: {claims}}});
  assert.equal(await m.findWikiImage("Lieu"), filePath("Apparentée.jpg"));
  fakeWikimedia({fr: {Lieu: {pageprops: {wikibase_item: "Q1"}}}, wikidata: {Q1: {claims}}, bad: ["Apparentée.jpg"]});
  assert.equal(await m.findWikiImage("Lieu"), filePath("Vue aérienne.jpg"));
  const {P109, P1442, P51, P1943, P242} = claims;
  fakeWikimedia({fr: {Lieu: {pageprops: {wikibase_item: "Q1"}}}, wikidata: {Q1: {claims: {P109, P1442, P51, P1943, P242}}}});
  assert.equal(await m.findWikiImage("Lieu"), filePath("Signature.svg"));
  fakeWikimedia({fr: {Lieu: {pageprops: {wikibase_item: "Q1"}}}, wikidata: {Q1: {claims: {P1442, P51, P1943, P242}}}});
  assert.equal(await m.findWikiImage("Lieu"), filePath("Carte.svg"));
  // Après les autres Wikipédias, dont les images principales sont choisies par leurs éditeurs
  fakeWikimedia({
    fr: {Lieu: {pageprops: {wikibase_item: "Q1"}}},
    wikis: {de: {"Lieu (de)": illustrated("Photo.jpg")}},
    wikidata: {Q1: {claims: {P6802: [media("Apparentée.jpg")]}, sitelinks: links({dewiki: "Lieu (de)"})}},
  });
  assert.match(await m.findWikiImage("Lieu"), /Photo\.jpg$/);
});

test("images : en dernier recours, l'image d'un élément lié (éponyme, série, auteur…)", async () => {
  const m = load();
  // Conjecture nommée d'après un mathématicien : son portrait ; jamais avant la carte de localisation
  let calls = fakeWikimedia({
    fr: {"Conjecture jacobienne": {pageprops: {wikibase_item: "Q1"}}},
    wikidata: {Q1: {claims: {P138: [item("Q2")], P31: [item("Q3")]}}, Q2: {claims: {P18: [claim("Jacobi.jpg")]}}, Q3: {claims: {P18: [claim("Conjecture.jpg")]}}},
  });
  assert.equal(await m.findWikiImage("Conjecture jacobienne"), filePath("Jacobi.jpg"));
  assert.equal(calls.at(-2).params.ids, "Q2", "« nature de l'élément » n'est pas un élément lié");
  fakeWikimedia({
    fr: {Rue: {pageprops: {wikibase_item: "Q1"}}},
    wikidata: {Q1: {claims: {P138: [item("Q2")], P242: [media("Plan.svg")]}}, Q2: {claims: {P18: [claim("Portrait.jpg")]}}},
  });
  assert.equal(await m.findWikiImage("Rue"), filePath("Plan.svg"));
  // Série sans photo : son logo ; élément obsolète ignoré, quatre éléments au plus en une requête
  calls = fakeWikimedia({
    fr: {Épisode: {pageprops: {wikibase_item: "Q1"}}},
    wikidata: {
      Q1: {claims: {P179: [item("Q9", "deprecated"), item("Q2")], P50: [item("Q3"), item("Q4"), item("Q5"), item("Q6")]}},
      Q2: {claims: {P154: [claim("Série.svg")]}},
      Q9: {claims: {P18: [claim("Ancienne.jpg")]}},
    },
  });
  assert.equal(await m.findWikiImage("Épisode"), filePath("Série.svg"));
  assert.equal(calls.find((c) => c.params.ids?.startsWith("Q2")).params.ids, "Q2|Q3|Q4|Q5");
  // Fichier de la liste des images à ne pas afficher : le suivant
  fakeWikimedia({
    fr: {Chanson: {pageprops: {wikibase_item: "Q1"}}},
    wikidata: {Q1: {claims: {P175: [item("Q2"), item("Q3")]}}, Q2: {claims: {P18: [claim("Interdite.jpg")]}}, Q3: {claims: {P18: [claim("Chanteur.jpg")]}}},
    bad: ["Interdite.jpg"],
  });
  assert.equal(await m.findWikiImage("Chanson"), filePath("Chanteur.jpg"));
  // Sujet sensible : aucun élément lié
  calls = fakeWikimedia({
    fr: {"Maladie de X": {pageprops: {wikibase_item: "Q1"}}},
    wikidata: {Q1: {claims: {P138: [item("Q2")]}}, Q2: {claims: {P18: [claim("Médecin.jpg")]}}},
  });
  assert.equal(await m.findWikiImage("Maladie de X", "maladie neurologique"), null);
  assert.ok(!calls.some((c) => c.params.ids === "Q2"));
});

test("images : sujet sensible → seulement les images principales des articles de Wikipédia", async () => {
  const m = load();
  const wikidata = {Q1: {claims: {P18: [claim("Photo opératoire.jpg")], P373: [claim("Vaginoplastie")]}, sitelinks: links({enwiki: "Vaginoplasty", dewiki: "Vaginoplastik"})}};
  let calls = fakeWikimedia({fr: {Vaginoplastie: {pageprops: {wikibase_item: "Q1"}}}, wikis: {de: {Vaginoplastik: illustrated("Foto.jpg")}}, wikidata});
  assert.equal(await m.findWikiImage("Vaginoplastie", "opération de chirurgie plastique"), null);
  assert.ok(!calls.some((c) => c.params.prop === "imageinfo"));
  assert.ok(!calls.some((c) => c.host === "de.wikipedia.org"), "pas d'autre Wikipédia que le français et l'anglais");
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

test("images : une recherche vaine faite avant l'ajout d'une source est refaite", async () => {
  const t = Date.now();
  // v : version des sources (SOURCES) lors de la recherche ; absente avant les autres Wikipédias
  const m = load({wikiImages: {Ancienne: {u: null, t}, Récente: {u: null, t, v: 3}, Trouvée: {u: "https://upload.wikimedia.org/x.jpg", t: 0}}});
  const calls = fakeWikimedia({fr: {Ancienne: {thumbnail: thumb("a.jpg")}, Récente: {thumbnail: thumb("r.jpg")}}});
  assert.match(await m.wikiImage("Ancienne"), /a\.jpg$/);
  assert.equal(await m.wikiImage("Récente"), null);
  assert.equal(await m.wikiImage("Trouvée"), "https://upload.wikimedia.org/x.jpg");
  assert.equal(calls.length, 1);
});
