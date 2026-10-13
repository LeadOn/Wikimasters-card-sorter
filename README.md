# WikiMasters Toolbox

Extension de navigateur et scripts Node pour WikiMasters · Browser extension and Node scripts for WikiMasters

[Français](#français) | [English](#english)

---

## Français

Bienvenue dans les scripts de catégorisation de **Wikimasters** !  
Ce projet contient un ensemble de scripts automatisés (Node.js) permettant de trier, catégoriser et "tagger" intelligemment votre collection de cartes Wikimasters sur la base de données Supabase.

### 🧰 L'extension WikiMasters Toolbox

Tous les outils de ce dépôt, directement dans wiki-masters.com : pas de Node, pas de token à copier, pas d'agent IA. Cahier des charges complet : [docs/cahier-des-charges.md](docs/cahier-des-charges.md).

**Fonctionnalités**
- **Tri automatique** : « Trier mes nouvelles cartes » (aperçu, puis application) et retri complet, avec le même moteur que les scripts ; étiquette `Doublon` ; vos étiquettes personnelles ne sont jamais touchées.
- **Profils d'intérêts** : votre profil et ceux de vos amis (éditeur simple ou règles avancées) génèrent les étiquettes « Pour : … ». Partage par code `WMT-P1.…`, profils de la bande importables en un clic, test sur votre collection.
- **Échanges** : les cartes d'un ami qui vous intéressent et les vôtres qui l'intéressent (collection en cache 12 h, lecture reprenable), proposition équilibrée en prix moyen, valeur des échanges en cours.
- **Prix** : prix moyen de vente par rareté sur les cartes du site, chargement en masse par rareté, valeur de la collection, classement des plus chères.
- **Marché** : vos enchères (surenchère en un clic avec confirmation, alerte de fin), vente de vos doublons.
- **Paquets** : récapitulatif dans la page après la dernière carte (nouveautés, doublons, prix), tri automatique des cartes tirées (option), taux de drop par rareté, « Tout ouvrir » sur clic. Pas d'ouverture automatique.
- **Familles** : groupes de cartes à compléter, manuels ou remplis par une recherche, partage par code, cartes manquantes en vente, conversion en étiquette.
- **Cartes** : pastille du thème, prix, possédée / nouvelle, lien Wikipédia, image de remplacement (option).
- Chaque fonctionnalité se désactive dans les Réglages. Aucune écriture sans clic, aucun serveur tiers.

**Installation (mode développeur)**
1. `npm install` puis `npm run build` (ou `npm run package` pour les `.zip`).
2. Chrome / Edge / Brave / Opera : `chrome://extensions` → *Mode développeur* → *Charger l'extension non empaquetée* → dossier `dist/chrome`.
   Firefox (128+) : `about:debugging#/runtime/this-firefox` → *Charger un module temporaire* → `dist/firefox/manifest.json`.
3. Rechargez wiki-masters.com : l'entrée **Toolbox** apparaît dans le menu, et l'icône de l'extension ouvre les actions rapides.

**Développement** : `npm run watch` (build continu), `npm test` (tests du moteur et de l'extension, sans réseau), `npm run eval` (qualité du classement). Les routes du site utilisées sont décrites dans [docs/site-api.md](docs/site-api.md).

### 🎯 Fonctionnalités des scripts Node
- **Catégorisation Intelligente** : Analyse sémantique des titres, catégories et résumés des cartes pour les classer avec précision (ex: Faune, Science, Histoire...).
- **Tags Personnalisés** : Règles spécifiques pour attribuer des tags à certains profils ou préférences.
- **Détection des Doublons** : Identification automatique des cartes en plusieurs exemplaires et attribution du tag `Doublon` (retiré quand il ne reste qu'un exemplaire).
- **Tri incrémental** (`--new-only`) : ne trie que les nouvelles cartes et met à jour les doublons, sans toucher aux cartes déjà triées ni à vos corrections manuelles.
- **Idées d'échanges** (`scripts/trade_finder.js <ami>`) : parcourt la collection d'un ami et liste les cartes qui correspondent à vos thèmes (votre tag « Pour : … », ou `--theme Sciences,Histoire`) que vous n'avez pas, ainsi que vos cartes qui l'intéresseraient. Rapport HTML dans `trade-<ami>.html`.
- **Intégration d'IA (Agents)** : Les fichiers d'instructions (comme `AGENTS.md`) permettent à un assistant IA d'automatiser entièrement le processus, y compris la récupération de votre token de connexion.

### 🚀 Utilisation (Avec l'Agent IA)
La manière la plus simple d'utiliser ce projet est de demander à votre assistant IA (comme Antigravity) de faire le tri pour vous.  
Grâce aux instructions présentes dans `AGENTS.md`, votre IA :
1. Utilisera **Playwright** pour extraire automatiquement votre Token d'accès depuis `https://www.wiki-masters.com/`.
2. Lèvera une instance du script `categorize_cards.js`.
3. Mettra à jour votre collection sans aucune manipulation manuelle de votre part !

Exemples de demandes :
- « Trie mes nouvelles cartes et vérifie les doublons » → mode `--new-only` ;
- « La carte X devrait être dans Sports » → correction des règles, vérification avec le jeu de test, puis tri complet.

Si la fenêtre Playwright n'est pas connectée à Wiki-Masters, l'IA vous demandera de vous y connecter (elle ne saisit jamais votre mot de passe).

### 🛠️ Utilisation (Manuelle)
1. **Récupérez votre token** : connectez-vous sur `https://www.wiki-masters.com/`, ouvrez la console des outils de développement (F12) et collez ce code. Il copie le token dans le presse-papier :
   ```js
   (() => {
     const c = Object.fromEntries(document.cookie.split(';').map(s => s.trim().split(/=(.*)/s).slice(0, 2)));
     let raw = decodeURIComponent(['0', '1', '2', '3'].map(i => c['sb-cyrxjeppjqsxxjayfrur-auth-token.' + i] || '').join(''));
     if (raw.startsWith('base64-')) {
       const b = raw.slice(7).replace(/-/g, '+').replace(/_/g, '/');
       raw = new TextDecoder().decode(Uint8Array.from(atob(b + '='.repeat((4 - b.length % 4) % 4)), ch => ch.charCodeAt(0)));
     }
     copy(JSON.parse(raw).access_token);
   })()
   ```
   La session est stockée dans les cookies `sb-cyrxjeppjqsxxjayfrur-auth-token.0`, `.1`, … (la concaténation, préfixée par `base64-`, est le JSON de session encodé en base64). Le token expire au bout d'**1 heure**.
2. **Fournissez le token au script**, au choix :
   ```bash
   export SUPABASE_TOKEN="votre_token_ici"
   ```
   ou mettez `SUPABASE_TOKEN=…` dans un fichier `.env`, ou collez le token seul dans un fichier `token.txt` à la racine du projet (tous deux ignorés par git).
3. **Lancez le script** (Node.js 18+, après un `npm install`) :

   | Commande | Effet |
   |---|---|
   | `node scripts/categorize_cards.js --new-only --dry-run` | Aperçu : liste les cartes non triées avec leurs futurs tags, et les doublons apparus ou disparus. N'écrit rien. |
   | `node scripts/categorize_cards.js --new-only` | **Usage courant après l'ouverture de paquets** : trie uniquement les cartes non triées et met à jour le tag `Doublon` sur toute la collection. Les cartes déjà triées (et vos corrections manuelles) ne sont pas touchées. |
   | `node scripts/categorize_cards.js --dry-run` | Aperçu du tri complet de toute la collection. N'écrit rien. |
   | `node scripts/categorize_cards.js` | Retrie toute la collection : à utiliser après une modification des règles. Les tags gérés par le script qui ne correspondent plus sont retirés, y compris ceux corrigés à la main. |

   - Une carte est « non triée » si elle n'a aucun tag de thème (Sports, Histoire, …). Un tag personnel ne compte pas.
   - `Doublon` est ajouté aux exemplaires d'une carte possédée plusieurs fois, et retiré quand il n'en reste qu'un.
   - Les tags que vous créez vous-même ne sont jamais modifiés, quel que soit le mode.
   - `--dry-run` écrit le détail par carte dans `dry-run.json`.
   - Une exécution prend environ 2 minutes.
4. **Après toute modification des règles**, vérifiez la qualité du tri (hors ligne, sans token) :
   ```bash
   node scripts/eval_categorize.js            # score par thème + erreurs
   node scripts/eval_categorize.js --verbose  # + détail des scores des erreurs
   ```
   puis appliquez avec le mode complet (`--dry-run` d'abord).

---

## English

Welcome to the **Wikimasters** categorization scripts!  
This repository contains a set of automated Node.js scripts designed to smartly sort, categorize, and tag your Wikimasters card collection directly within the Supabase database.

### 🧰 The WikiMasters Toolbox extension

All the tools of this repository, right inside wiki-masters.com: no Node, no token to copy, no AI agent. Full specification (French): [docs/cahier-des-charges.md](docs/cahier-des-charges.md).

**Features**: automatic sorting (new cards only, or a full re-sort, with a preview first) and `Doublon` tag · interest profiles for you and your friends ("Pour : …" tags, shareable codes) · trade finder with a balanced offer and the value of pending trades · average sale prices on cards, bulk loading, collection value, most valuable cards · your auctions (one-click outbid with confirmation, ending alert) and selling your duplicates · pack recap, pull statistics, "open all" on click (never automatic) · families (manual or search-based card sets, shareable codes) · card badges (theme, price, owned/new, Wikipedia link). Every feature can be turned off; nothing is written without a click; no third-party server.

**Install (developer mode)**: `npm install && npm run build`, then load `dist/chrome` as an unpacked extension (`chrome://extensions`, developer mode), or `dist/firefox/manifest.json` as a temporary add-on in Firefox 128+. Reload wiki-masters.com: a **Toolbox** entry appears in the menu.

**Development**: `npm run watch`, `npm test`, `npm run eval`. Site routes used: [docs/site-api.md](docs/site-api.md).

### 🎯 Node script features
- **Smart Categorization**: Semantic analysis of card titles, categories, and summaries to accurately classify them (e.g., Fauna, Science, History...).
- **Custom Tags**: Specific rules to assign custom tags tailored to different profiles and preferences.
- **Duplicate Detection**: Automatically identifies cards you own in multiple copies and flags them with a `Doublon` tag (removed once only one copy is left).
- **Incremental sort** (`--new-only`): sorts only new cards and refreshes duplicates, without touching already sorted cards or your manual fixes.
- **Trade ideas** (`scripts/trade_finder.js <friend>`): scans a friend's collection for cards matching your themes (your "Pour : …" tag, or `--theme Sciences,Histoire`) that you don't own, plus your cards they would like. HTML report in `trade-<friend>.html`.
- **AI Agent Integration**: Instruction files (like `AGENTS.md`) allow an AI assistant to fully automate the process, including retrieving your session token.

### 🚀 Usage (With AI Agent)
The easiest way to use this repository is to ask your AI assistant (like Antigravity) to sort your cards for you.  
Thanks to the instructions in `AGENTS.md`, your AI will:
1. Automatically use **Playwright** to fetch your access token from `https://www.wiki-masters.com/`.
2. Run the `categorize_cards.js` script.
3. Update your collection seamlessly without any manual copy-pasting from you!

Example requests:
- "Sort my new cards and check for duplicates" → `--new-only` mode;
- "Card X should be in Sports" → rule fix, test-set check, then a full re-sort.

If the Playwright window isn't logged in to Wiki-Masters, the AI will ask you to log in there (it never types your password).

### 🛠️ Usage (Manual)
1. **Get your token**: log in on `https://www.wiki-masters.com/`, open the developer tools console (F12) and paste this code. It copies the token to your clipboard:
   ```js
   (() => {
     const c = Object.fromEntries(document.cookie.split(';').map(s => s.trim().split(/=(.*)/s).slice(0, 2)));
     let raw = decodeURIComponent(['0', '1', '2', '3'].map(i => c['sb-cyrxjeppjqsxxjayfrur-auth-token.' + i] || '').join(''));
     if (raw.startsWith('base64-')) {
       const b = raw.slice(7).replace(/-/g, '+').replace(/_/g, '/');
       raw = new TextDecoder().decode(Uint8Array.from(atob(b + '='.repeat((4 - b.length % 4) % 4)), ch => ch.charCodeAt(0)));
     }
     copy(JSON.parse(raw).access_token);
   })()
   ```
   The session is stored in the `sb-cyrxjeppjqsxxjayfrur-auth-token.0`, `.1`, … cookies (concatenated and prefixed with `base64-`, they hold the base64-encoded session JSON). The token expires after **1 hour**.
2. **Give the token to the script**, either:
   ```bash
   export SUPABASE_TOKEN="your_token_here"
   ```
   or put `SUPABASE_TOKEN=…` in a `.env` file, or paste the bare token into a `token.txt` file at the project root (both ignored by git).
3. **Run the script** (Node.js 18+, after `npm install`):

   | Command | Effect |
   |---|---|
   | `node scripts/categorize_cards.js --new-only --dry-run` | Preview: lists unsorted cards with their future tags, and duplicates that appeared or disappeared. Writes nothing. |
   | `node scripts/categorize_cards.js --new-only` | **Usual run after opening packs**: sorts only unsorted cards and refreshes the `Doublon` tag across the whole collection. Already sorted cards (and your manual fixes) are left alone. |
   | `node scripts/categorize_cards.js --dry-run` | Preview of a full re-sort of the whole collection. Writes nothing. |
   | `node scripts/categorize_cards.js` | Re-sorts the whole collection, after changing the rules. Script-managed tags that no longer match are removed, including manually fixed ones. |

   - A card is "unsorted" when it has no theme tag (Sports, History, …). Personal tags don't count.
   - `Doublon` is added to every copy of a card you own more than once, and removed when only one copy is left.
   - Tags you create yourself are never modified, whatever the mode.
   - `--dry-run` writes the per-card details to `dry-run.json`.
   - A run takes about 2 minutes.
4. **After changing the rules**, check classification quality (offline, no token needed):
   ```bash
   node scripts/eval_categorize.js            # per-theme score + errors
   node scripts/eval_categorize.js --verbose  # + detailed scores for errors
   ```
   then apply with the full mode (`--dry-run` first).
