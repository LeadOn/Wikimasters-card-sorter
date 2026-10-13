# Wikimasters - Agent Knowledge Base & Rules

Ce fichier `AGENTS.md` a pour but de documenter le fonctionnement de la classification automatique des cartes et l'architecture mise en place pour les futurs agents ou développeurs travaillant sur **Wikimasters**.

Documentation du dépôt : `docs/guide.md` (guide de l'utilisateur de l'extension), `docs/architecture.md` (arborescence commentée, circulation des données), `docs/scripts.md` (scripts Node), `docs/site-api.md` (routes du site), `docs/cahier-des-charges.md` (décisions et exigences).

## 1. Contexte du Projet
Wikimasters est une application web (basée sur React et Supabase) qui permet aux utilisateurs de collectionner des cartes basées sur des articles Wikipédia. Chaque utilisateur possède une collection de cartes (`user_cards`). 
Le système de tags (`tags` et `user_card_tags`) sert à classifier la collection de chaque utilisateur par thèmes (ex: *Histoire, Sciences, Pop-Culture*).

## 2. Architecture de Base de Données (Supabase)

L'API de Supabase (`/rest/v1/`) est utilisée pour l'accès aux données. Les tables principales liées à la classification sont :
- `cards` : Contient les métadonnées globales de chaque carte (titre Wikipédia, résumé, catégories).
- `user_cards` : La relation entre un utilisateur et les cartes qu'il possède.
- `tags` : Les étiquettes / catégories (nom et couleur) créées par/pour l'utilisateur.
- `user_card_tags` : La table de jointure qui associe un `tag_id` à un `user_card_id`.

**Points d'attention pour Supabase :**
- Les requêtes POST pour insérer en lot (`bulk insert`) nécessitent le header `Prefer: resolution=ignore-duplicates` ou `return=representation` selon le comportement attendu.
- La récupération jointe des données se fait via une syntaxe PostgREST : `user_cards?select=*,cards(*)`.

## 3. Le Script de Classification Automatique

Plutôt que d'utiliser des requêtes individuelles trop lentes ou de demander à un LLM de générer un mapping complexe à chaque fois, la logique de classification sémantique a été extraite et encodée dans un algorithme performant, le **moteur partagé `core/`** (sans dépendance, utilisé par les scripts Node, les tests et l'extension WikiMasters Toolbox) :
- `core/themes.js` : thèmes génériques (`THEMES`, `THEME_COLORS`) ;
- `core/engine.js` + `core/categorize.js` : score par thème, homonymies, politique FR / internationale ;
- `core/builtin-profiles.js` : profils d'intérêts de la bande (tags « Pour : … »), format décrit dans `core/profiles.js` ;
- `core/tag-sync.js` : plan de synchronisation des tags (fonctions pures) ;
- `core/tag-writer.js` : écriture d'un plan en base (étiquettes relues avant création, ajouts avant suppressions, lots de 100, arrêt à la première panne), partagée par le script et l'extension ;
- `core/trade.js`, `core/prices.js`, `core/families.js`, `core/share-code.js` : échanges, prix, familles, codes de partage.

`scripts/categorize_cards.js` est la CLI de tri au-dessus de ce moteur.

### Fonctionnement de `scripts/categorize_cards.js`
Ce script opère selon les étapes suivantes :
1. **Récupération de l'existant** : Télécharge tous les `tags` et `user_cards` de l'utilisateur.
2. **Classification** (voir ci-dessous) : un thème générique par carte, plus les tags « Pour : … » des amis et `Doublon` (carte possédée en plusieurs exemplaires).
3. **Synchronisation des Tags** : Seuls les tags gérés (`TAG_COLORS` = `core.managedTags()` : thèmes, profils actifs, `Doublon`) sont créés / mis à jour. Les tags créés à la main par l'utilisateur et leurs associations ne sont **jamais** touchés.
4. **Synchronisation des associations** (toute la collection, ou seulement les cartes non triées avec `--new-only`, voir plus bas) : Compare avec `user_card_tags` (lu tag par tag, une lecture globale dépasse le délai du serveur) et n'écrit que les différences : ajouts d'abord, suppressions ensuite (une interruption laisse au pire un tag en trop, jamais un tag manquant).

### Comment une carte est classée
Le champ `cards.category` est la **description courte Wikidata** (« commune française du département… », « footballeur danois », « espèce d'arachnides »). Il commence presque toujours par le type de l'article : c'est le signal le plus fiable.

1. **Homonymies d'abord** : pages d'homonymie, noms de famille, prénoms → *Divers & Homonymies* (sinon elles héritent du thème des personnes listées).
2. **Score par thème** (objet `THEMES` de `core/themes.js`) : chaque thème a une liste `kw` de mots-clés et, optionnellement, une liste `head` de noms ambigus (« tour », « fort », « port ») qui ne comptent qu'en tête de description. Un mot-clé rapporte des points selon le champ où il apparaît : `category` ×10, définition « X est un/une … » de la 1re phrase ×7, titre ×3, reste du résumé ×0,5 ; et selon sa position (le 1er mot pèse plus que le 5e). Le thème au meilleur score gagne ; sous le seuil, la carte va dans *Autre*.
3. **Mots entiers** : le tiret fait partie du mot (« Saint-Priest » ne contient pas « saint », « Nouvelle-Aquitaine » pas « nouvelle »). Écrire les mots composés en entier dans les regex.
4. **Politique** est scindé en Française / Internationale selon la nationalité trouvée dans la description ou la définition.
5. **`manual_mapping_db.json`** (clés = id de `user_cards`) ne sert que de filet de sécurité, quand le moteur ne trouve rien de fiable.
6. **Tags par ami** : profils d'intérêts (`core/builtin-profiles.js` pour les scripts ; dans l'extension, chaque joueur gère ses profils et les partage par code). Règles évaluées sur le titre, la description et la 1re phrase seulement, pour ignorer les mentions incidentes. Une règle combine `theme`, `kw`, `field`, `with`, `unless`, `image`, `match` (voir `core/profiles.js`).

### Tester une modification des règles
```bash
node scripts/eval_categorize.js --verbose
```
Évalue le moteur sur `scripts/fixtures/labeled_cards.json` (~330 cartes étiquetées à la main, sans réseau) : précision par thème, erreurs avec leurs scores, et vérification des tags par ami. **À lancer avant et après chaque modification** : une regex qui corrige 3 cartes en casse souvent 2 autres. Ajoutez au fichier chaque carte mal classée que vous corrigez (champ `expected` : un thème, ou une liste de thèmes acceptables ; `friends.include` / `friends.exclude` pour les tags par ami ; `synthetic: true` pour une carte fictive qui teste une règle encore absente de la collection).

### Exécution du script : les 4 usages
| Commande | Cartes concernées | Écrit en base ? | Quand l'utiliser |
|---|---|---|---|
| `node scripts/categorize_cards.js --new-only --dry-run` | Cartes non triées + tag `Doublon` | Non | Aperçu après l'ouverture de nouveaux paquets |
| `node scripts/categorize_cards.js --new-only` | Cartes non triées + tag `Doublon` | Oui | **Usage courant** : trier les nouvelles cartes et détecter les nouveaux doublons |
| `node scripts/categorize_cards.js --dry-run` | Toute la collection | Non | Mesurer l'effet d'une modification des règles avant de l'appliquer |
| `node scripts/categorize_cards.js` | Toute la collection | Oui | Appliquer une modification des règles (`THEMES`, tags par ami) à toutes les cartes |

**Mode `--new-only` (incrémental)**
- Une carte est « non triée » si elle n'a **aucun tag de thème** (Sports, Histoire, … : tout tag géré sauf `Pour : …` et `Doublon`). Elle reçoit son thème et ses tags par ami. Un tag personnel (ex. « Favoris ») ne la fait pas compter comme triée.
- Le tag `Doublon` est recalculé sur **toute** la collection : ajouté aux deux exemplaires dès qu'une carte est possédée en plusieurs exemplaires (même si l'ancien exemplaire était déjà trié), retiré quand il n'en reste qu'un.
- Les cartes déjà triées ne sont **jamais modifiées** (hormis `Doublon`) : les corrections faites à la main dans l'interface sont préservées. Aucune suppression n'est faite en dehors de `Doublon`.
- La console liste chaque carte classée (`+ Titre → tags`) et chaque changement de `Doublon` (`+ Doublon : …` / `- Doublon : …`).

**Mode complet (sans `--new-only`)**
- Resynchronise toutes les cartes sur le résultat du moteur : ajoute les tags manquants et **retire** les tags gérés qui ne correspondent plus (une correction manuelle d'un tag géré est donc écrasée ; pour la rendre durable, corrigez les règles ou `manual_mapping_db.json`).
- Supprime aussi les tags gérés en double (deux tags portant le même nom).

**Commun aux deux modes**
- `--dry-run` n'écrit rien : il affiche la répartition par tag, le nombre d'associations à ajouter / supprimer, et écrit le détail par carte dans `dry-run.json` (gitignoré ; en `--new-only`, seulement les cartes non triées).
- Les tags créés à la main par l'utilisateur et leurs associations ne sont jamais touchés.
- Une exécution prend environ 2 minutes (lecture des associations tag par tag, la base est lente) : lancez-la avec un délai d'attente suffisant.
- Workflow recommandé : `--dry-run` d'abord, relire la sortie, puis la même commande sans `--dry-run`.

### Trouver des cartes à échanger avec un ami : `scripts/trade_finder.js`
| Commande | Effet |
|---|---|
| `node scripts/trade_finder.js` | Liste les amis (pseudos du site) |
| `node scripts/trade_finder.js <ami>` | Cartes de l'ami qui correspondent à mon tag `Pour : <mon pseudo>` (ou à ma liste de souhaits), et mes cartes à lui proposer |
| `node scripts/trade_finder.js <ami> --theme "Sciences,Atome"` | Cherche ces thèmes génériques au lieu de mon tag (noms partiels acceptés) |
| `… --rarity L,UR,SR` | Ne lit que ces raretés côté serveur (bien plus rapide). Raretés : `L`, `UR`, `SR`, `R`, `PC`, `C` |
| `… --refresh` / `--limit N` | Ignore le cache / nombre de lignes par section dans la console |

- **À demander** : cartes de l'ami que je ne possède pas, classées par le même moteur (`categorize()`), triées : liste de souhaits, puis cartes que l'ami a en plusieurs exemplaires, puis rareté. Les cartes engagées dans un échange en cours sont signalées.
- **À proposer** : mes cartes que l'ami n'a pas et qui correspondent à son tag `Pour : <ami>` (sans tag pour lui : mes doublons qu'il n'a pas), mes doublons d'abord.
- Le détail complet (images, filtres par thème, recherche) est écrit dans `trade-<ami>.html` (gitignoré).
- **Accès** : la RLS de Supabase masque les `user_cards` des autres joueurs. Le script passe par les routes du site (`/api/friends`, `/api/profile/<pseudo>/collection?page=N&sort=rarity&rarity=…`), qui n'acceptent pas le header `Bearer` : il reconstruit le cookie de session `@supabase/ssr` à partir du token de `token.txt`. Ces routes renvoient 50 cartes par page, sans le résumé (lu ensuite dans la table `cards`), et répondent souvent en 500 / 525 : le script réessaie.
- **Lenteur** : jusqu'à 30 s par page (≈ 20 min pour une collection de 16 000 cartes, 8 pages en parallèle). La collection est mise en cache page par page dans `cache/<ami>.json` (gitignoré, valable 12 h) : une exécution interrompue reprend là où elle s'est arrêtée. Lancez-la en arrière-plan, avec un token frais (il expire au bout d'1 h).

### Récupération du token (obligatoire avant chaque exécution)
Le script lit le token dans la variable `SUPABASE_TOKEN` (ou le fichier `.env`), sinon dans `token.txt` à la racine (gitignoré). Le token expire **1 heure** après sa création : récupérez-en un nouveau avant chaque exécution.

*Note vitale : vous DEVEZ récupérer le token vous-même avec l'outil **Playwright MCP**. **NE DEMANDEZ JAMAIS à l'utilisateur d'extraire le token manuellement**, faites-le automatiquement et de manière transparente.*

1. `browser_navigate` vers `https://www.wiki-masters.com/`. Si la page redirige vers `/signup`, la fenêtre Playwright n'est pas connectée : demandez à l'utilisateur de **se connecter dans la fenêtre Playwright** (ne saisissez jamais son mot de passe vous-même), puis reprenez.
2. Le site stocke la session dans des **cookies découpés** `sb-cyrxjeppjqsxxjayfrur-auth-token.0`, `.1`, … (format `@supabase/ssr`) et non plus dans le `localStorage`. Leur concaténation vaut `base64-` suivi du JSON de session encodé en base64url ; le token est son champ `access_token`.
3. Extrayez-le avec `browser_evaluate` et le paramètre `filename: "token.txt"`, pour l'écrire directement dans le fichier sans l'afficher dans la conversation :
   ```js
   () => {
     const c = Object.fromEntries(document.cookie.split(';').map(s => s.trim().split(/=(.*)/s).slice(0, 2)));
     let raw = ['0', '1', '2', '3'].map(i => c['sb-cyrxjeppjqsxxjayfrur-auth-token.' + i] || '').join('');
     raw = decodeURIComponent(raw);
     if (raw.startsWith('base64-')) {
       const b = raw.slice(7).replace(/-/g, '+').replace(/_/g, '/');
       raw = new TextDecoder().decode(Uint8Array.from(atob(b + '='.repeat((4 - b.length % 4) % 4)), ch => ch.charCodeAt(0)));
     }
     return JSON.parse(raw).access_token;
   }
   ```
4. Vérifiez l'expiration sans afficher le token :
   ```bash
   node -e 'const t=require("fs").readFileSync("token.txt","utf8").replace(/["\s]/g,"");console.log(new Date(JSON.parse(Buffer.from(t.split(".")[1],"base64url")).exp*1000))'
   ```

## 4. Extension WikiMasters Toolbox (`extension/`)

L'extension rend tous ces outils accessibles à n'importe quel joueur, sans Node ni token. Cahier des charges : `docs/cahier-des-charges.md` ; routes du site : `docs/site-api.md`.

### Architecture
- `extension/src/hook/main-world.js` : script du monde principal de la page. Observe (sans les modifier) les réponses que le site reçoit déjà (`/api/my-collection`, `/api/cards`, `/api/marketplace…`, `/api/trades`, `/api/packs/open`, …) et relève la clé publique Supabase ; transmet tout par `window.postMessage`.
- `extension/src/content/` : application (monde isolé, Preact dans un Shadow DOM).
  - `lib/` : session lue dans les cookies, requêtes avec réessais (`http.js` : lectures réessayées, **écritures jamais rejouées**, 429 respectés, `HumanCheckError` quand le site demande une vérification anti-robot), stockage `chrome.storage.local`, verrou entre onglets, bus d'événements, registre des cartes vues (par titre : le DOM du site n'expose pas les ids).
  - `api/` : Supabase REST et routes `/api` du site.
  - `state/` : réglages, profils, ma collection, cache des prix.
  - `features/` : tri, échanges, marché, paquets, familles, intégration dans les pages (`site-dom.js` regroupe **tous** les sélecteurs du site et place les blocs intégrés).
  - `ui/` : panneau et onglets ; `ui/islands/` : blocs intégrés aux pages du site (barre de la collection, fiche d'une carte, enchère, profil d'un ami), montés par `mountIsland` dans un Shadow DOM. Un bloc est placé par rapport à l'imbrication de la page (`sectionOf`), pas aux classes Tailwind du site.
- `extension/src/popup/` : popup d'actions rapides.
- `extension/src/shared/` : identité visuelle commune (marque, icônes, polices), voir « Charte graphique ».

### Commandes
| Commande | Effet |
|---|---|
| `npm run build` | `dist/chrome` et `dist/firefox` |
| `npm run watch` | build continu |
| `npm run package` | `.zip` Chrome et Firefox dans `dist/` |
| `npm test` | tests du moteur, de l'écriture des étiquettes et de la couche réseau / stockage de l'extension (`tests/`, sans réseau : `fetch` et `chrome.storage` simulés, modules de l'extension chargés par `tests/helpers/extension.js`) |
| `node extension/make-icons.mjs` | régénère les icônes PNG à partir de la marque (`shared/brand.mjs`) |

### Charte graphique
L'interface a sa propre identité, distincte de celle du site. Toute nouvelle interface la reprend :
- **Couleurs** (variables de `ui/panel.css`) : graphite chaud (`--bg`, `--surface…`, `--line…`), texte « os » (`--fg`, `--muted`, `--faint`) et **un seul signal**, le vert anis `--accent`, réservé à l'action principale d'un écran (`btn primary`), à la sélection, à la progression, au focus, à l'onglet actif et à ce qui concerne le joueur lui-même (`chip me`). Les couleurs vives sont celles des **données** : raretés (`--r-*`, celles du site) et thèmes (pastille `chip theme`, libellé neutre).
- **Pas** de dégradé, de flou, d'ombre colorée, de bordure gauche colorée sur une carte ni d'emoji : des filets de 1 px, des rayons courts (4 à 8 px, 12 px pour les fenêtres), la hiérarchie vient de la typographie.
- **Typographie** : IBM Plex Sans (`--sans`) pour l'interface, IBM Plex Mono (`--mono`) pour les libellés de données en petites capitales (`.eyebrow`, `stat .k`, en-têtes de tableau) et les nombres en colonne (`.num`). Montants avec `<Money v={…} />` (chiffres alignés, ₩ en retrait). Les polices sont copiées de `node_modules` au build (`dist/*/fonts`, licence OFL jointe) et déclarées dans la page par `shared/fonts.css` (`web_accessible_resources`) ; sans elles, les polices du système prennent le relais.
- **Marque** : une fiche avec un onglet de classement (`MARK` dans `shared/brand.mjs`, composant `<Mark />`) ; variante au trait (`markOutlineSvg`) pour l'entrée du menu du site.
- **Icônes** : `<Icon name="…" />` (`ICONS` dans `shared/brand.mjs`, `iconSvg()` hors de Preact) ; grille de 20, trait de 1,5, extrémités carrées et angles vifs. Une nouvelle icône suit la même grille ; chaque onglet du panneau a l'icône de même nom.

### Tester sans installer l'extension
Le navigateur Playwright MCP ne charge pas d'extension. Pour tester sur le vrai site : `npm run build && node extension/dev/make-inject.mjs`, puis, page wiki-masters.com ouverte et connectée, `page.addScriptTag({path: "<dépôt>/dist/dev-inject.js"})` via `browser_run_code_unsafe` (imitation de `chrome.storage` en mémoire, perdue au rechargement ; sans `runtime.getURL`, les polices du système remplacent IBM Plex). Naviguez ensuite côté client (clic dans le menu) pour que le hook observe les réponses.

### Règles
- **Aucune écriture sans clic explicite du joueur**, avec confirmation pour les ventes, enchères, retri complet et « Tout ouvrir ». Ne lancez jamais vous-même une écriture (tri appliqué, vente, enchère, paquet) pendant un test sans l'accord de l'utilisateur.
- **Pas d'ouverture automatique de paquets** ni de comportement qui imite un humain ou contourne une vérification du site.
- Ne copiez aucun code d'une autre extension : les routes du site se relèvent dans son trafic ou son code client (`docs/site-api.md`).
- Un changement du moteur se fait dans `core/` et profite aux scripts comme à l'extension : `npm test` + `node scripts/eval_categorize.js`.
- **Pagination** : toute lecture paginée (`fetchAll`) est triée sur une clé unique (`order=obtained_at.desc,id.asc`, `order=user_card_id.asc`…) et dédoublonnée (`key`). Sans ordre stable, PostgreSQL peut renvoyer une ligne sur deux pages (faux « Doublon ») et en omettre une autre (carte triée prise pour non triée). Les filtres `in.(…)` passent par `restIn` (lots de 100 ids).
- **Écritures** : les étiquettes passent par `core/tag-writer.js` (avec `tagClient`), sous le verrou `sort` ; une écriture restée sans réponse est signalée « incertaine » (`HttpError.uncertain`) et n'est jamais rejouée automatiquement, sauf si elle est idempotente.
- **Documentation** : une fonctionnalité ajoutée ou modifiée se documente dans `docs/guide.md` (et dans la liste du `README.md` si elle est visible du joueur) ; un fichier ajouté ou déplacé, dans `docs/architecture.md`. Pas de code mort : ce qui n'est plus appelé est supprimé, pas commenté.

## 5. Intégration Playwright MCP

L'outil **Playwright MCP** (`mcp_playwright`) est l'outil principal de l'agent pour :
- **Récupérer le token de session automatiquement** avant chaque manipulation de la base de données (voir ci-dessus).
- Interagir avec l'interface graphique de `https://www.wiki-masters.com/`.
- Naviguer, cliquer sur des éléments et vérifier visuellement que les tags s'affichent correctement dans l'interface après modification de la base de données.

---
**Note aux futurs agents** : 
Lorsqu'un utilisateur demande une *nouvelle catégorie* ou signale un *mauvais classement*, n'essayez pas de modifier les bases de données manuellement une par une. Allez directement enrichir les mots-clés de l'objet `THEMES` dans `core/themes.js` (ou les profils dans `core/builtin-profiles.js`), ajoutez la carte au jeu de test, vérifiez avec `node scripts/eval_categorize.js` et `npm test`, puis ré-exécutez le script **en mode complet** (sans `--new-only`, qui ne reclasse pas les cartes déjà triées) pour appliquer la classification globale.
Lorsqu'un utilisateur a simplement ouvert de nouveaux paquets ou veut « trier les nouvelles cartes / les doublons », utilisez `--new-only`.
