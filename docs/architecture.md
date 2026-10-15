# Structure du projet

Ce dépôt contient un **moteur** de classement des cartes et trois façons de s'en servir : l'**extension** WikiMasters Toolbox, des **scripts Node** et les **tests**. Le moteur est écrit une seule fois, sans dépendance : toute amélioration du tri profite à la fois à l'extension et aux scripts.

```
                ┌──────────────────────────────┐
                │ core/  moteur partagé        │
                │ thèmes, profils, tri, prix,  │
                │ échanges, familles, codes    │
                └──────┬──────────┬────────┬───┘
                       │          │        │
        ┌──────────────┘          │        └──────────────┐
        ▼                         ▼                       ▼
 extension/                 scripts/                 tests/
 WikiMasters Toolbox        CLI Node (token)         node --test, sans réseau
```

- [Arborescence](#arborescence)
- [Le moteur (`core/`)](#le-moteur-core)
- [L'extension (`extension/`)](#lextension-extension)
- [Les scripts (`scripts/`)](#les-scripts-scripts)
- [Tests](#tests)
- [Construire et publier](#construire-et-publier)
- [Conventions](#conventions)

---

## Arborescence

```
core/                          moteur partagé (CommonJS, sans dépendance)
  index.js                     point d'entrée : ré-exporte tous les modules
  text.js                      normalisation, mots entiers, extraction des champs d'une carte
  themes.js                    thèmes génériques : mots-clés, couleurs, étiquette Doublon
  engine.js                    score par thème, homonymies, politique française / internationale
  categorize.js                classement d'une carte : thème + étiquettes « Pour : … »
  profiles.js                  profils d'intérêts : format des règles, éditeur simple, validation
  builtin-profiles.js          profils de la bande, fournis avec l'extension et les scripts
  tag-sync.js                  plan de synchronisation des étiquettes (fonctions pures)
  tag-writer.js                écriture d'un plan en base : ordre sûr, lots, reprise après panne
  trade.js                     recherche d'échanges et offre équilibrée
  prices.js                    raretés, prix du marché (médiane, ventes minimum, premières ventes ignorées, shiny à part), valeur d'une collection, doublons à vendre
  families.js                  familles de cartes (manuelles ou par règle), progression
  share-code.js                codes de partage WMT-P1… / WMT-F1… (JSON compressé, base64url)
  stonks.js                    achats et ventes au marché : rapprochement vente → achat (premier entré, premier sorti), reventes seules, plus-value, périodes jour / semaine / mois

extension/
  build.mjs                    build esbuild → dist/chrome, dist/firefox (+ .zip), manifeste généré
  make-icons.mjs               icônes PNG de la barre d'outils et du store, depuis la marque
  static/                      popup.html et icônes, copiés tels quels
  dev/                         banc d'essai : injecter l'extension dans une page sans l'installer
  src/
    hook/main-world.js         script du monde principal de la page : observe les réponses du site
    shared/                    identité visuelle : marque, icônes, polices (brand.mjs, Brand.jsx, fonts.css)
    popup/                     popup d'actions rapides
    content/                   application, dans le monde isolé de la page
      index.jsx                démarrage : bus, registre, interface, intégration aux pages, messages de la popup
      lib/                     socle technique
        ext.js                 API d'extension (chrome / browser)
        session.js             session du joueur lue dans les cookies du site
        http.js                requêtes prudentes : délais, réessais des lectures, 429, écritures jamais rejouées
        storage.js             chrome.storage.local, états persistants partagés entre onglets
        store.js               petit état réactif pour Preact
        bus.js                 bus d'événements, alimenté par le hook
        registry.js            cartes vues dans les réponses du site, indexées par titre
        locks.js               verrou entre onglets pour les écritures lourdes
      api/
        supabase.js            API REST Supabase (pagination stable, filtres in.() par lots)
        site.js                routes /api du site (voir docs/site-api.md)
      state/                   données gardées en mémoire et en cache
        settings.js            réglages : interrupteurs, délais, couleurs
        profiles.js            mon profil et ceux de mes amis
        collection.js          ma collection, ids des cartes possédées, défausse d'un exemplaire
        prices.js              cache des prix, chargement groupé, prix fiable ou indicatif selon les réglages
      features/                fonctionnalités, sans interface
        sorter.js              tri : aperçu (planSort) puis application (applySort)
        autosort.js            tri des cartes tirées à l'ouverture d'un paquet (option)
        trades.js              recherche d'échanges, échanges en cours
        market.js              enchères, surenchère, alerte de fin, vente et défausse des doublons
        packs.js               récapitulatif, statistiques de tirage, « Tout ouvrir »
        families.js            familles : catalogue, cartes manquantes en vente, étiquettes
        card-lookup.js         carte affichée par le site mais jamais vue dans ses réponses
        wiki-images.js         images Wikimedia pour les cartes sans image (option) : Wikipédia, Wikidata, éléments liés
        card-images.js         cartes sans image ou en GIF sur toute la collection (onglet Images)
        collection-view.js     collection filtrée (critères cumulables, prix de vente, mots-clés) : mise en vente et défausse, une à une ou par lot
        notify.js              sons de notification et d'alerte
        stonks.js              page Stonks : historique de mes enchères conclues, cartes achetées en stock, ouverture par #stonks
        site-dom.js            intégration aux pages : tous les sélecteurs du site sont ici
        site-assets.js         fichiers du site repris pour la carte sans image : logo, textures de rareté
      ui/                      interface (Preact, dans un Shadow DOM)
        App.jsx                racine : panneau, dialogues, toasts, encart des échanges
        components.jsx         composants communs (carte en ligne ou en grand, carte sans image, montant, progression, message…)
        feedback.js            toasts et confirmations
        panel.css              styles du panneau et des blocs intégrés
        site.css               styles injectés dans les pages du site : badges, nouvel affichage des cartes
        PackRecap.jsx          récapitulatif de paquet, avec vente et défausse de chaque carte
        SellDialog.jsx         fenêtre de mise aux enchères, d'une carte ou de plusieurs (Marché, récapitulatif de paquet, jamais vendues)
        discard.js             confirmation d'une défausse, d'une carte ou de plusieurs (doublons du Marché, récapitulatif de paquet, jamais vendues)
        DropRates.jsx          taux de drop par rareté
        ImageCards.jsx         filtre Sans image / GIF et liste des cartes (onglet Images)
        CollectionCards.jsx    filtres de la collection et liste des cartes, à cocher, vendre ou défausser (onglet Prix, barre de la collection)
        tabs/                  un fichier par onglet du panneau
        islands/               blocs intégrés aux pages du site (collection, carte, enchère, profil) et page Stonks

scripts/
  categorize_cards.js          CLI de tri (token requis)
  trade_finder.js              CLI de recherche d'échanges avec un ami
  eval_categorize.js           évaluation du moteur sur le jeu de test, hors ligne
  fixtures/labeled_cards.json  ~330 cartes étiquetées à la main
  manual_mapping_db.json       corrections manuelles, filet de sécurité des scripts

tests/                         tests node --test (moteur, écriture des étiquettes, réseau, stockage)
docs/                          guide, structure, routes du site, cahier des charges, scripts
store/                         fiche, captures et vignettes du Chrome Web Store
```

Fichiers à la racine : `README.md`, `AGENTS.md` (connaissances et règles pour les agents IA qui travaillent sur le dépôt), `PRIVACY.md` (politique de confidentialité publiée avec la fiche du store) et `google…html` (vérification du site auprès de Google Search Console).

---

## Le moteur (`core/`)

Le moteur ne fait ni réseau ni écriture : il reçoit des cartes et rend des décisions. C'est ce qui permet de le partager entre Node et le navigateur, et de le tester sans réseau.

**Classement d'une carte** (`categorize`). Le champ `category` d'une carte est la description courte Wikidata, qui commence presque toujours par le type de l'article. Chaque thème de `themes.js` a une liste de mots-clés, et des noms ambigus qui ne comptent qu'en tête de description. Un mot-clé rapporte des points selon le champ où il apparaît (description ×10, définition de la première phrase ×7, titre ×3, reste du résumé ×0,5) et selon sa position. Le meilleur score l'emporte ; sous le seuil, la carte va dans *Autre*. Les profils d'intérêts sont évalués ensuite, sur le titre, la description et la première phrase seulement.

**Synchronisation des étiquettes** (`tag-sync.js`, `tag-writer.js`). Le plan compare les étiquettes voulues à celles en base et n'écrit que les différences. Les ajouts passent avant les suppressions : une interruption laisse au pire une étiquette en trop, jamais une étiquette manquante. Seules les étiquettes gérées (thèmes, profils actifs, `Doublon`) sont touchées.

Le détail des règles de classement, et la façon de les modifier sans rien casser, est dans [AGENTS.md](../AGENTS.md#3-le-script-de-classification-automatique).

---

## L'extension (`extension/`)

### Trois contextes d'exécution

| Contexte | Fichiers | Rôle |
|---|---|---|
| Monde principal de la page | `src/hook/main-world.js` | Observe, sans les modifier, les réponses que le site reçoit déjà (`/api/my-collection`, `/api/packs/open`, `/api/marketplace…`) et relève la clé publique Supabase. Transmet tout par `window.postMessage` |
| Monde isolé (script de contenu) | `src/content/` | L'application : lit la session, appelle l'API, calcule, affiche le panneau et les blocs intégrés |
| Page de l'extension | `src/popup/` | Popup d'actions rapides ; envoie des messages au script de contenu de l'onglet actif |

### Circulation des données

```
site ──réponses──▶ hook ──postMessage──▶ lib/bus ──événements──▶ registry, state/, features/
                                                                      │
joueur ──clic──▶ ui/ ──▶ features/ ──▶ api/ (http.js) ──▶ Supabase / routes /api du site
                  ▲                                        │
                  └───────────── store.js (état réactif) ◀─┘
```

1. **Lecture passive** : tout ce que le site charge (collection, cartes, enchères, paquets ouverts) est récupéré au passage par le hook et redistribué par le bus. La Toolbox évite ainsi de redemander ce que le site vient de recevoir.
2. **Lectures actives** : quand il manque une donnée (prix, collection d'un ami), `api/` interroge Supabase ou les routes du site avec la session du joueur, lue dans les cookies.
3. **Écritures** : uniquement sur un clic du joueur, sous un verrou entre onglets (`locks.js`), jamais rejouées automatiquement (`http.js`).
4. **Affichage** : les états (`store.js`) sont observés par les composants Preact. Le panneau et chaque bloc intégré vivent dans leur propre Shadow DOM : les styles du site ne les atteignent pas, et les leurs ne débordent pas.

### Intégration aux pages du site

`features/site-dom.js` regroupe **tous** les sélecteurs du site. Une boucle, déclenchée par les changements de la page et des données, place les badges sur les cartes, le bouton « Tout ouvrir », les entrées du menu (« Toolbox », « Stonks ») et les blocs intégrés (`ui/islands/`). Chaque étape est isolée : si le site change et qu'un élément n'est plus trouvé, seule cette étape cesse de fonctionner, sans erreur visible. Un bloc se place par rapport à l'imbrication de la page (`sectionOf`), jamais par rapport aux classes Tailwind du site, qui changent souvent.

**Nouvel affichage des cartes.** `site-dom.js` reconnaît les parties d'une carte du site (texture de rareté, zone image, zone texte, badge, étiquettes, attaque et défense) et leur pose des repères `data-wmt-*` ; `site.css` ne cible que ces repères. React ne touche pas à ces attributs, et la boucle les repose si le site reconstruit une carte. Si la structure n'est plus reconnue, la carte garde l'affichage du site. Les tailles sont relatives à la carte (unités `cqw`) : le même style sert en grille et dans la fenêtre d'une carte.

**Page Stonks.** Le site n'a pas de route pour elle : l'entrée du menu ajoute `#stonks` à l'adresse de la page en cours (`history.pushState`, sans navigation de Next.js), et `site-dom.js` masque les blocs de `<main>` (repère `data-wmt-covered`) pour y monter `ui/islands/StonksPage.jsx`. L'entrée prend l'apparence de l'entrée active du site, qui reprend la sienne à la fermeture (*Retour*, lien du site, ou changement de page : le site remet alors ses entrées à jour lui-même). Les entrées « Toolbox » et « Stonks » sont ajoutées à tout menu qui liste toutes les pages (lien vers le classement) : le menu latéral et, sur mobile, le menu *Plus* de la barre du bas, refermé après un clic sur l'une d'elles.

### Stockage

Tout est dans `chrome.storage.local` (jamais dans le `localStorage` du site) : réglages, profils, familles, statistiques de tirage, cache des prix, collections d'amis lues. `persistentStore` synchronise un état entre les onglets ouverts sans écraser une valeur enregistrée par les valeurs par défaut.

---

## Les scripts (`scripts/`)

Les scripts font la même chose que l'extension en ligne de commande, avec un token copié depuis le site. Ils servent surtout à faire évoluer les règles de tri (évaluation hors ligne) et aux agents IA. Mode d'emploi : [docs/scripts.md](scripts.md).

---

## Tests

`npm test` lance `node --test tests/`, sans réseau :

| Fichier | Ce qui est vérifié |
|---|---|
| `engine.test.js` | Classement du jeu de cartes étiquetées, profils d'intérêts |
| `profiles.test.js` | Règles, éditeur simple, validation des profils |
| `tag-sync.test.js` | Plan de synchronisation, modes complet et incrémental |
| `tag-writer.test.js` | Écriture des étiquettes : reprise après interruption, pas de doublon, erreurs |
| `trade-prices-families.test.js` | Échanges, prix (médiane, ventes minimum, premières ventes ignorées, shiny à part, résumé des ventes), cartes jamais vendues, familles, codes de partage, couleurs des raretés |
| `extension-http.test.js` | Couche réseau : réessais, écritures jamais rejouées, session renouvelée, pagination |
| `extension-storage.test.js` | Stockage : valeurs enregistrées jamais écrasées, plusieurs onglets |
| `extension-wiki-images.test.js` | Images Wikimedia : ordre des sources, autres langues par Wikidata, homonymies, limite de requêtes, cache |
| `extension-card-images.test.js` | Filtre par image : GIF reconnu dans le chemin de l'URL (vignettes Wikimedia), image masquée comptée sans image, exemplaires cumulés par carte et rareté |
| `extension-pack-actions.test.js` | Défausse et mise aux enchères d'un exemplaire : bon identifiant envoyé, une seule requête, refus du site, absence de réponse |
| `stonks.test.js` | Page Stonks : opérations du joueur, rapprochement vente → achat (carte, rareté, shiny ; jamais un achat postérieur), vue achat-revente (reventes seules, à la date de la vente), plus-value, rendement, périodes jour / semaine / mois en heure locale (changement d'heure, semaines du lundi) |
| `extension-stonks.test.js` | Lecture de l'historique : deux lectures triées (vendeur, acheteur), aucune écriture, cartes encore en stock d'après la collection, cache de quelques minutes, panne signalée sans perdre l'historique affiché |
| `extension-collection-view.test.js` | Collection filtrée : critères cumulés, jamais vendues (toute rareté ou la sienne), intervalle de prix (prix fiables seulement, recalculés quand les réglages changent ; bornes incluses, facultatives, remises dans l'ordre), lecture des ventes (ordre stable, shiny) et résumé du site qui n'écrase pas un prix récent, mots-clés inclus ou exclus, ouverture depuis la grille du site ; exemplaire visé (jamais un favori, shiny en dernier), une requête par carte, arrêt à la première erreur, collection relue après une écriture sans réponse |

Les modules de l'extension sont chargés dans Node par `tests/helpers/extension.js` (regroupés par esbuild), avec `fetch` et `chrome.storage` simulés.

`npm run eval` évalue la qualité du classement sur `scripts/fixtures/labeled_cards.json` : à lancer avant et après chaque modification des règles.

---

## Construire et publier

| Commande | Effet |
|---|---|
| `npm run build` | `dist/chrome` et `dist/firefox` |
| `npm run watch` | build continu |
| `npm run package` | `.zip` Chrome et Firefox dans `dist/` |
| `node extension/make-icons.mjs` | régénère les icônes PNG depuis la marque |
| `node extension/dev/make-inject.mjs` | `dist/dev-inject.js`, à injecter dans une page pour tester sans installer |

Le build génère le manifeste (Manifest V3, Chrome 120+ et Firefox 128+), regroupe les trois points d'entrée (`hook`, `content`, `popup`), copie `static/` et les polices IBM Plex depuis `node_modules` (avec leur licence OFL). Le numéro de version vient de `package.json`.

La publication sur le Chrome Web Store est décrite dans [store/README.md](../store/README.md).

---

## Conventions

- **Aucune écriture sans clic explicite** du joueur ; confirmation pour les ventes, enchères, défausses, retri complet et « Tout ouvrir ».
- **Pas d'ouverture automatique de paquets**, ni de comportement qui imite un joueur ou contourne une vérification du site.
- **Un changement du moteur se fait dans `core/`** et se vérifie avec `npm test` et `npm run eval`.
- **Pagination stable** : toute lecture paginée est triée sur une clé unique et dédoublonnée, sinon une ligne peut apparaître sur deux pages et une autre disparaître.
- **Sélecteurs du site** : uniquement dans `features/site-dom.js`.
- **Interface** : elle suit la charte graphique décrite dans [AGENTS.md](../AGENTS.md#charte-graphique) (couleurs, typographie, marque, icônes).
- **Code original** : rien n'est repris d'une autre extension ; les routes du site sont relevées dans son trafic ([docs/site-api.md](site-api.md)).
- Code, commentaires et documentation en français.
