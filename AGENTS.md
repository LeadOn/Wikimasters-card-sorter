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
2. **Synchronisation des Tags** : Vérifie l'existence d'une liste prédéfinie de thèmes (environ 19 catégories avec leurs codes couleurs, ex: *Astronomie & Espace*, *Arts & Littérature*) et crée automatiquement ceux qui manquent.
3. **Analyse Textuelle** : Pour chaque carte possédée, le script concatène `wikipedia_title`, `category` et `summary`. Il passe ensuite ce texte dans une batterie d'expressions régulières prioritaires extrêmement fines (plusieurs centaines de mots-clés) imitant un raisonnement sémantique pour déduire la meilleure catégorie.
4. **Nettoyage et Insertion** : Supprime les anciennes associations dans `user_card_tags` pour éviter les doublons, puis fait un `bulk insert` de toutes les nouvelles associations calculées.

### Exécution du script
En tant qu'agent, si vous devez mettre à jour la classification (par exemple, lors de l'ajout de nouvelles cartes ou de l'amélioration des filtres), la commande est :
```bash
node scripts/categorize_cards.js
```
*Note vitale : Le script nécessite la variable d'environnement `SUPABASE_TOKEN`. Avant CHAQUE exécution, vous DEVEZ obligatoirement utiliser l'outil **Playwright MCP** pour naviguer sur `https://www.wiki-masters.com/`, inspecter le `localStorage` (clé `sb-cyrxjeppjqsxxjayfrur-auth-token`) ou les requêtes réseau, et en extraire le token d'accès. Décodez le JSON si nécessaire. **NE DEMANDEZ JAMAIS à l'utilisateur d'extraire le token manuellement**, faites-le automatiquement et de manière transparente.*

## 4. Intégration Playwright MCP

L'outil **Playwright MCP** (`mcp_playwright`) est l'outil principal de l'agent pour :
- **Récupérer le token de session automatiquement** avant chaque manipulation de la base de données.
- Interagir avec l'interface graphique de `https://www.wiki-masters.com/`.
- Naviguer, cliquer sur des éléments et vérifier visuellement que les tags s'affichent correctement dans l'interface après modification de la base de données.

---
**Note aux futurs agents** : 
Lorsqu'un utilisateur demande une *nouvelle catégorie* ou signale un *mauvais classement*, n'essayez pas de modifier les bases de données manuellement une par une. Allez directement enrichir l'arbre de décision (les Regex) de la fonction `categorize()` dans `scripts/categorize_cards.js`, puis ré-exécutez le script pour appliquer la classification globale instantanément.
