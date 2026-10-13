# Scripts Node

Les scripts font en ligne de commande ce que fait l'extension : trier la collection et chercher des échanges. Ils utilisent le même moteur (`core/`). Pour un usage courant, **l'extension est plus simple** : elle lit votre session toute seule. Les scripts servent surtout à faire évoluer les règles de tri et aux agents IA.

Prérequis : Node.js 18 ou plus récent, puis `npm install` à la racine du dépôt.

- [Fournir son token](#fournir-son-token)
- [Trier la collection : `categorize_cards.js`](#trier-la-collection--categorize_cardsjs)
- [Chercher des échanges : `trade_finder.js`](#chercher-des-échanges--trade_finderjs)
- [Modifier les règles de tri : `eval_categorize.js`](#modifier-les-règles-de-tri--eval_categorizejs)
- [Avec un agent IA](#avec-un-agent-ia)

---

## Fournir son token

Les scripts s'authentifient avec le token de votre session WikiMasters. Il expire **une heure** après sa création : récupérez-en un nouveau avant chaque séance.

1. Connectez-vous sur [wiki-masters.com](https://www.wiki-masters.com/), ouvrez la console des outils de développement (F12) et collez ce code. Il copie le token dans le presse-papier :

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

   La session est stockée dans les cookies `sb-cyrxjeppjqsxxjayfrur-auth-token.0`, `.1`, … : leur concaténation, préfixée par `base64-`, est le JSON de session encodé en base64.

2. Donnez-le aux scripts, au choix : variable d'environnement `SUPABASE_TOKEN`, ligne `SUPABASE_TOKEN=…` dans un fichier `.env`, ou token seul dans un fichier `token.txt` à la racine. Les deux fichiers sont ignorés par git.

   ```bash
   export SUPABASE_TOKEN="votre_token"
   ```

---

## Trier la collection : `categorize_cards.js`

| Commande | Cartes concernées | Écrit ? | Quand l'utiliser |
|---|---|---|---|
| `node scripts/categorize_cards.js --new-only --dry-run` | Cartes non triées, plus `Doublon` | Non | Aperçu après l'ouverture de paquets |
| `node scripts/categorize_cards.js --new-only` | Cartes non triées, plus `Doublon` | Oui | **Usage courant** : trier les nouvelles cartes et mettre à jour les doublons |
| `node scripts/categorize_cards.js --dry-run` | Toute la collection | Non | Mesurer l'effet d'une modification des règles |
| `node scripts/categorize_cards.js` | Toute la collection | Oui | Appliquer une modification des règles à toutes les cartes |

- Une carte est **non triée** quand elle n'a aucune étiquette de thème. Une étiquette personnelle ne compte pas.
- `Doublon` est ajouté à tous les exemplaires d'une carte possédée plusieurs fois, et retiré quand il n'en reste qu'un. Il est recalculé sur toute la collection, quel que soit le mode.
- En mode `--new-only`, les cartes déjà triées ne sont jamais modifiées (hormis `Doublon`) : vos corrections manuelles sont conservées.
- Le mode complet retire les étiquettes gérées qui ne correspondent plus, **y compris celles corrigées à la main**. Pour rendre une correction durable, corrigez les règles, ou ajoutez la carte dans `scripts/manual_mapping_db.json` (utilisé seulement quand le moteur ne trouve rien de fiable).
- Vos étiquettes personnelles ne sont jamais touchées.
- `--dry-run` n'écrit rien : il affiche la répartition par étiquette et écrit le détail par carte dans `dry-run.json`.
- Une exécution prend environ deux minutes (la base est lente). Faites toujours un `--dry-run` d'abord.

---

## Chercher des échanges : `trade_finder.js`

| Commande | Effet |
|---|---|
| `node scripts/trade_finder.js` | Liste vos amis |
| `node scripts/trade_finder.js <ami>` | Ses cartes qui correspondent à votre étiquette « Pour : <vous> » ou à votre liste de souhaits, et vos cartes à lui proposer |
| `… --theme "Sciences,Atome"` | Cherche ces thèmes plutôt que votre profil (noms partiels acceptés) |
| `… --rarity L,UR,SR` | Ne lit que ces raretés : bien plus rapide |
| `… --refresh` | Ignore le cache et relit sa collection |
| `… --limit N` | Nombre de lignes par section dans la console (25 par défaut) |

Le détail complet (images, filtres par thème, recherche) est écrit dans `trade-<ami>.html`. La collection de l'ami est gardée 12 heures dans `cache/<ami>.json` : une exécution interrompue reprend là où elle s'était arrêtée. Le site met jusqu'à 30 secondes par page de 50 cartes (une vingtaine de minutes pour 16 000 cartes) : lancez-le avec un token frais.

---

## Modifier les règles de tri : `eval_categorize.js`

Les règles vivent dans `core/themes.js` (mots-clés des thèmes) et `core/builtin-profiles.js` (profils de la bande). Une expression qui corrige trois cartes en casse souvent deux autres : mesurez avant et après.

```bash
node scripts/eval_categorize.js            # précision par thème et erreurs
node scripts/eval_categorize.js --verbose  # avec le détail des scores des erreurs
```

L'évaluation tourne hors ligne sur `scripts/fixtures/labeled_cards.json`, environ 330 cartes étiquetées à la main. Ajoutez-y chaque carte mal classée que vous corrigez (champ `expected` : un thème, ou une liste de thèmes acceptables ; `friends.include` / `friends.exclude` pour les profils). Lancez aussi `npm test`, puis appliquez avec le mode complet de `categorize_cards.js`, `--dry-run` d'abord.

---

## Avec un agent IA

[AGENTS.md](../AGENTS.md) décrit le projet et ses règles pour un assistant IA : il peut récupérer le token avec Playwright (après vous avoir demandé de vous connecter dans sa fenêtre, sans jamais saisir votre mot de passe), lancer les scripts et corriger les règles. Exemples de demandes :

- « Trie mes nouvelles cartes et vérifie les doublons » → mode `--new-only` ;
- « La carte X devrait être dans Sports » → correction des règles, vérification sur le jeu de test, puis tri complet.
