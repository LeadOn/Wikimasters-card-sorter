# Wikimasters - Card Categorization Scripts

[Français](#français) | [English](#english)

---

## Français

Bienvenue dans les scripts de catégorisation de **Wikimasters** !  
Ce projet contient un ensemble de scripts automatisés (Node.js) permettant de trier, catégoriser et "tagger" intelligemment votre collection de cartes Wikimasters sur la base de données Supabase.

### 🎯 Fonctionnalités
- **Catégorisation Intelligente** : Analyse sémantique des titres, catégories et résumés des cartes pour les classer avec précision (ex: Faune, Science, Histoire...).
- **Tags Personnalisés** : Règles spécifiques pour attribuer des tags à certains profils ou préférences.
- **Détection des Doublons** : Identification automatique des cartes en plusieurs exemplaires et attribution du tag `Doublon`.
- **Intégration d'IA (Agents)** : Les fichiers d'instructions (comme `AGENTS.md`) permettent à un assistant IA d'automatiser entièrement le processus, y compris la récupération de votre token de connexion.

### 🚀 Utilisation (Avec l'Agent IA)
La manière la plus simple d'utiliser ce projet est de demander à votre assistant IA (comme Antigravity) de faire le tri pour vous.  
Grâce aux instructions présentes dans `AGENTS.md`, votre IA :
1. Utilisera **Playwright** pour extraire automatiquement votre Token d'accès depuis `https://www.wiki-masters.com/`.
2. Lèvera une instance du script `categorize_cards.js`.
3. Mettra à jour votre collection sans aucune manipulation manuelle de votre part !

### 🛠️ Utilisation (Manuelle)
Si vous souhaitez exécuter le script vous-même :
1. Récupérez votre JWT Token depuis `https://www.wiki-masters.com/` (dans le `localStorage` sous la clé `sb-cyrxjeppjqsxxjayfrur-auth-token`).
2. Définissez la variable d'environnement :
   ```bash
   export SUPABASE_TOKEN="votre_token_ici"
   ```
3. Installez les dépendances (si besoin) et lancez le script :
   ```bash
   node scripts/categorize_cards.js --dry-run   # aperçu, sans rien écrire en base
   node scripts/categorize_cards.js
   ```
4. Après toute modification des règles, vérifiez la qualité du tri (hors ligne) :
   ```bash
   node scripts/eval_categorize.js --verbose
   ```

---

## English

Welcome to the **Wikimasters** categorization scripts!  
This repository contains a set of automated Node.js scripts designed to smartly sort, categorize, and tag your Wikimasters card collection directly within the Supabase database.

### 🎯 Features
- **Smart Categorization**: Semantic analysis of card titles, categories, and summaries to accurately classify them (e.g., Fauna, Science, History...).
- **Custom Tags**: Specific rules to assign custom tags tailored to different profiles and preferences.
- **Duplicate Detection**: Automatically identifies cards you own in multiple copies and flags them with a `Doublon` tag.
- **AI Agent Integration**: Instruction files (like `AGENTS.md`) allow an AI assistant to fully automate the process, including retrieving your session token.

### 🚀 Usage (With AI Agent)
The easiest way to use this repository is to ask your AI assistant (like Antigravity) to sort your cards for you.  
Thanks to the instructions in `AGENTS.md`, your AI will:
1. Automatically use **Playwright** to fetch your access token from `https://www.wiki-masters.com/`.
2. Run the `categorize_cards.js` script.
3. Update your collection seamlessly without any manual copy-pasting from you!

### 🛠️ Usage (Manual)
If you prefer to run the scripts yourself:
1. Retrieve your JWT Token from `https://www.wiki-masters.com/` (found in `localStorage` under the key `sb-cyrxjeppjqsxxjayfrur-auth-token`).
2. Set the environment variable:
   ```bash
   export SUPABASE_TOKEN="your_token_here"
   ```
3. Install dependencies (if needed) and run the script:
   ```bash
   node scripts/categorize_cards.js --dry-run   # preview, no database writes
   node scripts/categorize_cards.js
   ```
4. After changing the rules, check classification quality (offline):
   ```bash
   node scripts/eval_categorize.js --verbose
   ```
