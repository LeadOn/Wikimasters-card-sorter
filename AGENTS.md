# Wikimasters - Agent Knowledge Base & Rules

Ce fichier `AGENTS.md` a pour but de documenter le fonctionnement de la classification automatique des cartes et l'architecture mise en place pour les futurs agents ou développeurs travaillant sur **Wikimasters**.

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

Plutôt que d'utiliser des requêtes individuelles trop lentes ou de demander à un LLM de générer un mapping complexe à chaque fois, la logique de classification sémantique a été extraite et encodée dans un algorithme performant en Node.js : `scripts/categorize_cards.js`.

### Fonctionnement de `scripts/categorize_cards.js`
Ce script opère selon les étapes suivantes :
1. **Récupération de l'existant** : Télécharge tous les `tags` et `user_cards` de l'utilisateur.
2. **Classification** (voir ci-dessous) : un thème générique par carte, plus les tags « Pour : … » des amis et `Doublon` (carte possédée en plusieurs exemplaires).
3. **Synchronisation des Tags** : Seuls les tags gérés par le script (`TAG_COLORS`) sont créés / mis à jour. Les tags créés à la main par l'utilisateur et leurs associations ne sont **jamais** touchés.
4. **Synchronisation des associations** (toute la collection, ou seulement les cartes non triées avec `--new-only`, voir plus bas) : Compare avec `user_card_tags` (lu tag par tag, une lecture globale dépasse le délai du serveur) et n'écrit que les différences : ajouts d'abord, suppressions ensuite (une interruption laisse au pire un tag en trop, jamais un tag manquant).

### Comment une carte est classée
Le champ `cards.category` est la **description courte Wikidata** (« commune française du département… », « footballeur danois », « espèce d'arachnides »). Il commence presque toujours par le type de l'article : c'est le signal le plus fiable.

1. **Homonymies d'abord** : pages d'homonymie, noms de famille, prénoms → *Divers & Homonymies* (sinon elles héritent du thème des personnes listées).
2. **Score par thème** (objet `THEMES`) : chaque thème a une liste `kw` de mots-clés et, optionnellement, une liste `head` de noms ambigus (« tour », « fort », « port ») qui ne comptent qu'en tête de description. Un mot-clé rapporte des points selon le champ où il apparaît : `category` ×10, définition « X est un/une … » de la 1re phrase ×7, titre ×3, reste du résumé ×0,5 ; et selon sa position (le 1er mot pèse plus que le 5e). Le thème au meilleur score gagne ; sous le seuil, la carte va dans *Autre*.
3. **Mots entiers** : le tiret fait partie du mot (« Saint-Priest » ne contient pas « saint », « Nouvelle-Aquitaine » pas « nouvelle »). Écrire les mots composés en entier dans les regex.
4. **Politique** est scindé en Française / Internationale selon la nationalité trouvée dans la description ou la définition.
5. **`manual_mapping_db.json`** (clés = id de `user_cards`) ne sert que de filet de sécurité, quand le moteur ne trouve rien de fiable.
6. **Tags par ami** : évalués sur le titre, la description et la 1re phrase seulement, pour ignorer les mentions incidentes.

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

### Anciens scripts
`apply_manual_mapping.js`, `llm_categorize.js`, `find_missing.js`, `find_remaining.js`, `find_true_missing.js` et les `scratch*.js` datent de la première version. Ils ne sont plus maintenus (pagination limitée à 1 000 cartes, alors que la collection en compte plus de 7 000) : n'utilisez que `categorize_cards.js` et `eval_categorize.js`.

## 4. Intégration Playwright MCP

L'outil **Playwright MCP** (`mcp_playwright`) est l'outil principal de l'agent pour :
- **Récupérer le token de session automatiquement** avant chaque manipulation de la base de données (voir ci-dessus).
- Interagir avec l'interface graphique de `https://www.wiki-masters.com/`.
- Naviguer, cliquer sur des éléments et vérifier visuellement que les tags s'affichent correctement dans l'interface après modification de la base de données.

---
**Note aux futurs agents** : 
Lorsqu'un utilisateur demande une *nouvelle catégorie* ou signale un *mauvais classement*, n'essayez pas de modifier les bases de données manuellement une par une. Allez directement enrichir les mots-clés de l'objet `THEMES` dans `scripts/categorize_cards.js`, ajoutez la carte au jeu de test, vérifiez avec `node scripts/eval_categorize.js`, puis ré-exécutez le script **en mode complet** (sans `--new-only`, qui ne reclasse pas les cartes déjà triées) pour appliquer la classification globale.
Lorsqu'un utilisateur a simplement ouvert de nouveaux paquets ou veut « trier les nouvelles cartes / les doublons », utilisez `--new-only`.
