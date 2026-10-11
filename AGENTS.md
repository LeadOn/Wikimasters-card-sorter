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
2. **Classification** (voir ci-dessous) : un thème générique par carte, plus les tags « Pour : … » des amis et `Doublon`.
3. **Synchronisation des Tags** : Seuls les tags gérés par le script (`TAG_COLORS`) sont créés / mis à jour. Les tags créés à la main par l'utilisateur et leurs associations ne sont **jamais** touchés.
4. **Synchronisation des associations** : Compare avec `user_card_tags` (lu tag par tag, une lecture globale dépasse le délai du serveur) et n'écrit que les différences : ajouts d'abord, suppressions ensuite (une interruption laisse au pire un tag en trop, jamais un tag manquant).

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

### Exécution du script
En tant qu'agent, si vous devez mettre à jour la classification (par exemple, lors de l'ajout de nouvelles cartes ou de l'amélioration des filtres), la commande est :
```bash
node scripts/categorize_cards.js --dry-run   # calcule et affiche la répartition, écrit dry-run.json, n'écrit rien en base
node scripts/categorize_cards.js             # applique en base
```
*Note vitale : Le script nécessite la variable d'environnement `SUPABASE_TOKEN`. Avant CHAQUE exécution, vous DEVEZ obligatoirement utiliser l'outil **Playwright MCP** pour naviguer sur `https://www.wiki-masters.com/`, inspecter le `localStorage` (clé `sb-cyrxjeppjqsxxjayfrur-auth-token`) ou les requêtes réseau, et en extraire le token d'accès. Décodez le JSON si nécessaire. **NE DEMANDEZ JAMAIS à l'utilisateur d'extraire le token manuellement**, faites-le automatiquement et de manière transparente.*

## 4. Intégration Playwright MCP

L'outil **Playwright MCP** (`mcp_playwright`) est l'outil principal de l'agent pour :
- **Récupérer le token de session automatiquement** avant chaque manipulation de la base de données.
- Interagir avec l'interface graphique de `https://www.wiki-masters.com/`.
- Naviguer, cliquer sur des éléments et vérifier visuellement que les tags s'affichent correctement dans l'interface après modification de la base de données.

---
**Note aux futurs agents** : 
Lorsqu'un utilisateur demande une *nouvelle catégorie* ou signale un *mauvais classement*, n'essayez pas de modifier les bases de données manuellement une par une. Allez directement enrichir les mots-clés de l'objet `THEMES` dans `scripts/categorize_cards.js`, ajoutez la carte au jeu de test, vérifiez avec `node scripts/eval_categorize.js`, puis ré-exécutez le script pour appliquer la classification globale.
