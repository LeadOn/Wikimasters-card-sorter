// Filtre par image (onglet « Images », barre de la page Collection) : cartes sans image, masquées
// par le site ou au format GIF, sur toute la collection lue dans Supabase.
const test = require("node:test");
const assert = require("node:assert/strict");
const {loadExtensionModule, fakeJwt, sessionCookie, response} = require("./helpers/extension");

function fakeBrowser() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  globalThis.window = globalThis;
  globalThis.document = {addEventListener() {}, visibilityState: "visible", cookie: sessionCookie({token: fakeJwt({sub: "user-1", exp}), expiresAt: exp})};
  globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
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

const load = () => (fakeBrowser(), loadExtensionModule("extension/src/content/features/card-images.js"));

// Formes d'URL relevées dans la table cards
const WM = "https://upload.wikimedia.org/wikipedia";
const URLS = {
  gifThumb: `${WM}/commons/thumb/7/7e/Occipital_bone_Basion_-_animation01.gif/330px-Occipital_bone_Basion_-_animation01.gif?utm_source=fr.wikipedia.org&utm_campaign=api&utm_content=thumbnail`,
  gifUnscaled: `${WM}/fr/a/a5/Wawel.gif?utm_source=fr.wikipedia.org&utm_campaign=api&utm_content=thumbnail_unscaled`,
  gifBare: `${WM}/commons/5/50/Triakistetrahedron.gif`,
  gifDots: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a1/Opera_backdrop..gif/330px-Opera_backdrop..gif?utm_source=fr.wikipedia.org",
  svgPng: `${WM}/commons/thumb/f/f3/Flag_of_Russia.svg/330px-Flag_of_Russia.svg.png`,
  jpg: `${WM}/commons/thumb/f/f6/I-26_Japanese_submarine.jpg/330px-I-26_Japanese_submarine.jpg?utm_source=fr.wikipedia.org&utm_content=gif`,
};

test("imageKind : GIF reconnu dans le chemin, jamais dans les paramètres ; sans image ou masquée", () => {
  const {imageKind} = load();
  for (const k of ["gifThumb", "gifUnscaled", "gifBare", "gifDots"]) assert.equal(imageKind({image_url: URLS[k], hide_image: false}), "gif", k);
  assert.equal(imageKind({image_url: URLS.svgPng}), "image");
  assert.equal(imageKind({image_url: URLS.jpg}), "image", "« gif » dans les paramètres seulement");
  assert.equal(imageKind({image_url: "/images/Logo.GIF"}), "gif", "URL relative, majuscules");
  assert.equal(imageKind({image_url: null, hide_image: false}), "none");
  assert.equal(imageKind({image_url: URLS.gifBare, hide_image: true}), "none", "image masquée par le site");
  assert.equal(imageKind(null), "none");
});

test("collection lue : exemplaires cumulés par carte et rareté, raretés hautes d'abord puis titre", async () => {
  const m = load();
  const row = (id, card_id, rarity, card, count = 1) => ({id, card_id, count, snapshot_rarity: rarity, obtained_at: "2026-10-01", cards: {id: card_id, rarity, hide_image: false, ...card}});
  const rows = [
    row("u1", "c1", "C", {wikipedia_title: "Zèbre", image_url: null}),
    row("u2", "c1", "C", {wikipedia_title: "Zèbre", image_url: null}, 2),
    row("u3", "c1", "R", {wikipedia_title: "Zèbre", image_url: null}),
    row("u4", "c2", "C", {wikipedia_title: "Abeille", image_url: null}),
    row("u5", "c3", "L", {wikipedia_title: "Masquée", image_url: URLS.jpg, hide_image: true}),
    row("u6", "c4", "SR", {wikipedia_title: "Basion", image_url: URLS.gifThumb}),
    row("u7", "c5", "UR", {wikipedia_title: "Drapeau", image_url: URLS.svgPng}),
  ];
  const urls = [];
  globalThis.fetch = async (url) => (urls.push(url), response(200, rows));

  m.setCollectionFilter(null);
  assert.equal(urls.length, 0, "aucune lecture sans filtre");
  await m.loadImageGroups();
  const {groups, loading, error} = m.imageState.get();
  assert.equal(loading, false);
  assert.equal(error, null);
  assert.match(urls[0], /user_cards\?select=.*image_url.*hide_image.*order=obtained_at\.desc,id\.asc/);
  assert.deepEqual(
    groups.none.map((c) => [c.card.wikipedia_title, c.rarity, c.count]),
    [["Masquée", "L", 1], ["Zèbre", "R", 1], ["Abeille", "C", 1], ["Zèbre", "C", 3]],
  );
  assert.deepEqual(groups.gif.map((c) => c.card.wikipedia_title), ["Basion"]);
});

test("filtre de la page Collection : choisi → collection lue ; erreur de lecture signalée", async () => {
  const m = load();
  globalThis.fetch = async () => response(200, {message: "oops"});
  m.setCollectionFilter("gif");
  assert.equal(m.imageState.get().filter, "gif");
  assert.equal(m.imageState.get().loading, true);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(m.imageState.get().loading, false);
  assert.match(m.imageState.get().error, /inattendue/);
  m.setCollectionFilter(null);
  assert.equal(m.imageState.get().filter, null);
});
