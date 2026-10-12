# WikiMasters Toolbox — Cahier des charges

Extension de navigateur (Chrome, Edge, Brave, Opera, Firefox) qui regroupe tous les outils de ce dépôt
(tri automatique, doublons, recherche d'échanges) et les meilleures idées des extensions existantes,
pour que n'importe quel joueur puisse s'en servir sans Node, sans token et sans agent IA.

Toute l'implémentation est originale : aucune ligne n'est reprise d'une autre extension.

## 1. Décisions

| Sujet | Décision |
|---|---|
| Nom | **WikiMasters Toolbox** |
| Interface | Intégrée au site : entrée « Toolbox » dans le menu de wiki-masters.com, badges et boutons dans les pages, popup d'extension pour les actions rapides |
| Données partagées | Aucun serveur pour l'instant : tout reste dans le navigateur ; le partage passe par des **codes** à copier-coller (profils d'intérêts, familles) |
| Ouverture automatique des paquets sans clic | **Exclue** (comportement de bot, risque pour le compte). « Tout ouvrir » reste déclenché par un clic, avec confirmation |
| Moteur de tri | Un seul moteur (`core/`), partagé par l'extension, les scripts Node et les tests |
| Distribution | `.zip` installé en mode développeur d'abord, stores ensuite |

## 2. Principes

1. **Aucune écriture sans clic explicite** du joueur (tags, ventes, enchères, paquets). Toute écriture
   importante est précédée d'un aperçu.
2. **Pas de token à manipuler** : la session est lue dans les cookies du site, la clé publique Supabase
   est observée dans les requêtes du site.
3. **Respect du serveur** : concurrence limitée, réessais avec délai croissant, réponses 429 respectées,
   un `POST` n'est jamais rejoué automatiquement, lecture passive des réponses que le site reçoit déjà.
4. **Les tags personnels ne sont jamais touchés** : seuls les tags gérés par la Toolbox (thèmes,
   `Pour : …`, `Doublon`) sont créés, modifiés ou retirés.
5. **Chaque fonctionnalité se désactive** dans les réglages.
6. **Robuste aux changements du site** : sélecteurs d'interface regroupés, repli silencieux si un
   élément n'est pas trouvé, interface de la Toolbox isolée dans un Shadow DOM.

## 3. Fonctionnalités

Priorité : **P1** indispensable · **P2** important · **P3** bonus.

### 3.1 Socle

| # | Exigence | Prio |
|---|---|---|
| S1 | Session lue dans les cookies `sb-…-auth-token.N` (access token + id du joueur), relue avant chaque appel | P1 |
| S2 | Lecture passive des réponses du site (collection, paquets ouverts, échanges, annonces) pour alimenter les caches | P1 |
| S3 | Stockage dans `chrome.storage.local` (illimité), jamais dans le `localStorage` du site | P1 |
| S4 | Tâches longues reprenables : progression enregistrée, reprise après rechargement | P1 |
| S5 | File réseau : concurrence limitée, délais croissants, 429/5xx gérés, pas de `POST` rejoué | P1 |
| S6 | Verrou entre onglets pour les écritures (tri, paquets) | P1 |
| S7 | Réglages : un interrupteur par fonctionnalité, couleurs des tags | P1 |
| S8 | Entrée « Toolbox » dans le menu du site + popup d'extension | P1 |
| S9 | Tests automatisés (`node --test`) sans réseau, jeu de cartes étiquetées pour le moteur | P1 |
| S10 | Paquets `.zip` Chrome et Firefox générés par `npm run build` | P2 |

### 3.2 Tri automatique et tags

| # | Fonctionnalité | Prio |
|---|---|---|
| T1 | **Trier mes nouvelles cartes** : thème + tags `Pour : …` pour les cartes sans tag de thème ; aperçu puis application | P1 |
| T2 | **Doublon** recalculé sur toute la collection à chaque tri | P1 |
| T3 | **Retri complet** (options avancées) : resynchronise toute la collection, avertit que les corrections manuelles d'un tag géré sont écrasées, aperçu obligatoire | P1 |
| T4 | Pastille du thème sur les cartes affichées par le site | P2 |
| T5 | Après l'ouverture d'un paquet, proposition de trier immédiatement les nouvelles cartes | P2 |
| T6 | « Mauvais thème ? » : génère un rapport à copier (carte, thème obtenu, thème attendu) pour enrichir le jeu de test | P3 |

### 3.3 Profils d'intérêts (« Pour : … »)

Remplacent les règles codées en dur pour chaque ami.

| # | Fonctionnalité | Prio |
|---|---|---|
| I1 | **Mon profil** : ce que je collectionne (thèmes génériques, mots-clés, exclusions) | P1 |
| I2 | **Profils de mes amis** : chaque profil génère le tag `Pour : <pseudo>` lors du tri | P1 |
| I3 | Éditeur simple (thèmes + mots-clés séparés par des virgules, `*` pour un préfixe) et éditeur avancé (règles) | P1 |
| I4 | Partage par code : j'exporte mon profil, mes amis l'importent | P1 |
| I5 | Profils de la bande fournis avec l'extension (les règles historiques de ce dépôt), importables en un clic | P2 |
| I6 | Test d'un profil sur ma collection : nombre de cartes concernées, exemples | P2 |

### 3.4 Échanges

| # | Fonctionnalité | Prio |
|---|---|---|
| E1 | **Trouver des échanges avec un ami** : ses cartes que je n'ai pas et qui correspondent à mon profil ou à ma liste de souhaits ; mes cartes qui correspondent à son profil (ou mes doublons) ; filtres thème / rareté / recherche | P1 |
| E2 | Collection de l'ami en cache (12 h), téléchargement reprenable, filtre de rareté côté serveur | P1 |
| E3 | Valeur d'un échange en cours : prix moyen de chaque carte et total de chaque côté (WikiBidous compris) | P2 |
| E4 | Proposition équilibrée : sélection de cartes à proposer pour une valeur proche de celle demandée | P2 |
| E5 | Cartes engagées dans un échange en cours signalées | P2 |

### 3.5 Prix et marché

| # | Fonctionnalité | Prio |
|---|---|---|
| P1 | Prix moyen de vente par carte (par rareté), en badge sur les cartes, mis en cache | P1 |
| P2 | Chargement des prix en masse, par rareté (« seulement les cartes sans prix » possible) | P1 |
| P3 | Valeur estimée de ma collection | P2 |
| P4 | Classement de mes cartes les plus chères, filtrable par tag | P2 |
| P5 | **Vendre mes doublons** : liste des exemplaires en trop triés par valeur (un exemplaire est toujours conservé), mise en vente en un clic avec confirmation | P2 |
| P6 | **Mes enchères** : enchères en cours, temps restant, surenchère en un clic avec confirmation, alerte quand une enchère se termine bientôt | P2 |

### 3.6 Paquets

| # | Fonctionnalité | Prio |
|---|---|---|
| K1 | Récapitulatif après un paquet : cartes, nouveautés, doublons, prix moyen, valeur totale | P1 |
| K2 | Statistiques de tirage : répartition des raretés, réinitialisables | P2 |
| K3 | « Tout ouvrir » : ouvre tous les paquets disponibles sans animation, sur clic + confirmation, s'arrête à la moindre erreur | P2 |

### 3.7 Familles

| # | Fonctionnalité | Prio |
|---|---|---|
| F1 | Familles manuelles : groupes de cartes choisies dans le catalogue, avec progression « X / Y possédées » | P2 |
| F2 | **Familles intelligentes** : définies par une règle (thème, mots-clés, rareté), remplies automatiquement depuis le catalogue | P2 |
| F3 | Cartes manquantes d'une famille actuellement en vente sur le marché | P3 |
| F4 | Partage d'une famille par code | P2 |
| F5 | Transformer une famille en tag Wikimasters (et l'inverse) | P3 |

### 3.8 Cartes et confort

| # | Fonctionnalité | Prio |
|---|---|---|
| C1 | Lien Wikipédia sur les cartes | P1 |
| C2 | Badge « possédée / manquante » sur les cartes vues hors de ma collection | P2 |
| C3 | Image de remplacement (Wikipédia / Wikimedia Commons) pour les cartes sans image | P3 |
| C4 | Son discret à l'arrivée d'une notification | P3 |

## 4. Hors périmètre (pour l'instant)

- Ouverture automatique des paquets sans clic, ou tout ce qui imite un comportement humain.
- Serveur partagé (instantanés de collection, bibliothèque publique de familles) : reporté.
- Toute action déclenchée sans geste du joueur.

## 5. Architecture

```
core/          moteur partagé, sans dépendance (CommonJS)
               texte, thèmes, classement, profils d'intérêts, plan de synchronisation des tags,
               recherche d'échanges, codes de partage
scripts/       CLI Node (categorize_cards, trade_finder, eval_categorize) au-dessus de core/
extension/
  src/hook/      script du « monde principal » : observe les requêtes du site
  src/content/   application (Preact, Shadow DOM) : API, stockage, fonctionnalités, interface
  src/popup/     popup d'extension
  build.mjs      esbuild → dist/chrome, dist/firefox (+ .zip)
tests/         tests node --test
```

## 6. Jalons

1. **J1** — `core/` extrait, scripts Node branchés dessus, score du jeu de test inchangé.
2. **J2** — Socle de l'extension (S1-S9) + tri (T1-T3) + profils (I1-I4).
3. **J3** — Échanges (E1-E2, E5), prix (P1-P4), paquets (K1-K2), cartes (C1-C2), pastilles (T4).
4. **J4** — Marché (P5-P6), échanges avancés (E3-E4), paquets (K3), familles (F1-F4), confort.

## 7. État d'implémentation (v0.1.0)

Toutes les fonctionnalités des sections 3.1 à 3.8 sont implémentées. Écarts et précisions :

| # | Précision |
|---|---|
| S4 | Les tâches longues sont reprenables : la collection d'un ami est enregistrée page par page ; le tri recalcule son plan depuis la base (ajouts idempotents avant suppressions), il suffit de le relancer. |
| S6 | Verrou `navigator.locks` pour le tri et « Tout ouvrir ». |
| K1 | Récapitulatif intégré à la page Paquets (pas de fenêtre) : il attend que le site ait révélé la dernière carte (bouton « Continuer »), s'affiche dessous, puis reste sous le bouton « Ouvrir ». Prix chargés dès l'ouverture, avec indicateur de chargement par carte et pour le total. Nouveautés calculées par une requête sur les exemplaires possédés. Paquet normal, PRO du jour et spéciaux. Le récapitulatif disparaît au retour sur l'écran « Ouvrir un paquet » (il y reste seulement après « Tout ouvrir »). |
| K2 | Graphique des taux de drop par rareté sur l'écran « Ouvrir un paquet » : mes tirages comptés par l'extension, ou la répartition de toute ma collection tant qu'il y a moins de 50 cartes tirées. Barres d'une seule teinte, rareté portée par le libellé (la palette des raretés du site n'est pas lisible en couleurs seules). |
| T5 | Option « Trier automatiquement les cartes tirées » (désactivée par défaut) : dès l'ouverture d'un paquet, les exemplaires tirés (identifiés par `user_card_id` dans la réponse du site) reçoivent thème, « Pour : … » et Doublon, en quelques requêtes ; un exemplaire qui a déjà un thème n'est pas modifié, rien n'est supprimé. Le récapitulatif affiche les étiquettes posées. Sans l'option, il propose « Trier les nouvelles cartes ». |
| T6 | Non implémenté (P3) : la correction passe par les profils ou par l'ajout de la carte au jeu de test. |
| P1-P2 | Prix calculés à partir des ventes conclues (table `auctions`), lues par lots : toute une collection (~7 600 cartes) en ~5 min, au lieu de ~12 s par carte avec la route du site, gardée en dernier recours. |
| P4 | Classement filtrable par thème calculé (lire les étiquettes de 7 000 cartes à chaque affichage serait trop lent). |
| P6 | Alerte par message et son ; vérification toutes les 60 s (20 s dans les 5 dernières minutes) tant qu'une enchère est en cours et l'onglet visible. |
| E3 | Valeur des échanges : encart flottant sur la page Échanges + détail dans l'onglet Échanges (le rendu des échanges du site varie trop pour y greffer des badges). |
| F2 | Le catalogue compte ~2,8 millions de cartes : une famille intelligente part d'une recherche du site (10 pages de 50 cartes au plus), filtrée ensuite par mots-clés, exclusions, thèmes et raretés. |
| C2 | Badge « ✓ » (possédée) partout hors collection, « Nouvelle » sur le marché et les profils ; rien sur la collection globale, qui l'affiche déjà. |
