# Guide de WikiMasters Toolbox

WikiMasters Toolbox est une extension **non officielle** pour [wiki-masters.com](https://www.wiki-masters.com/), faite par des joueurs pour des joueurs. Elle ajoute au site ce qui manque pour gérer une grosse collection : tri automatique des cartes, prix du marché, recherche d'échanges, suivi des paquets et des enchères, familles de cartes à compléter.

Ce guide décrit tout ce que fait l'extension, page par page puis onglet par onglet.

- [En deux minutes](#en-deux-minutes)
- [Ce qui change sur les pages du site](#ce-qui-change-sur-les-pages-du-site)
- [Le panneau Toolbox](#le-panneau-toolbox)
- [La popup de l'extension](#la-popup-de-lextension)
- [Comment une carte est triée](#comment-une-carte-est-triée)
- [Réglages](#réglages)
- [Sécurité et vie privée](#sécurité-et-vie-privée)
- [Questions fréquentes](#questions-fréquentes)

---

## En deux minutes

1. **Installez l'extension** (voir le [README](../README.md#installation)) puis rechargez wiki-masters.com. Vous devez être connecté au site : l'extension utilise votre session, vous n'avez rien à saisir.
2. **Ouvrez la Toolbox** par l'entrée **Toolbox** du menu du site, ou par l'icône de l'extension dans la barre du navigateur.
3. **Triez votre collection** : onglet *Tri* → *Aperçu du tri* → *Appliquer*. Chaque carte reçoit une étiquette de thème (Sports, Histoire, Sciences…), et les cartes en plusieurs exemplaires l'étiquette `Doublon`. Vos étiquettes personnelles ne sont jamais touchées.
4. **Décrivez ce que vous collectionnez** dans l'onglet *Profils*, et importez les profils de vos amis : la Toolbox saura quelles cartes leur proposer, et lesquelles leur demander.

Rien n'est jamais écrit sur votre compte sans un clic de votre part.

---

## Ce qui change sur les pages du site

L'extension s'intègre aux pages de wiki-masters.com. Chaque élément ci-dessous se désactive dans les [réglages](#réglages).

### Sur les cartes (marché, profils, catalogue)

Des pastilles s'ajoutent en haut à droite de chaque carte affichée par le site :

| Pastille | Signification |
|---|---|
| `8 042 ₩` | Prix moyen de vente de la carte **dans sa rareté**, quand il est connu |
| ✓ | Vous possédez déjà cette carte (affichée partout sauf dans votre propre collection et dans la collection globale, qui l'indiquent déjà) |
| `Nouvelle` | Vous n'avez pas cette carte (sur le marché et le profil des autres joueurs) |
| `■ Sports` | Thème de la carte calculé par la Toolbox (pas sur votre collection, où il est déjà en étiquette) |
| `W` | Ouvre l'article Wikipédia de la carte |
| `−34 %` | **Bonne affaire** sur le marché : l'enchère se termine dans moins de 15 minutes et la mise minimale est au moins 25 % sous le prix moyen |
| `+120 %` | **Trop cher** sur le marché : la mise minimale dépasse le prix moyen d'au moins 50 % |

Les pastilles du marché ne s'affichent que si la carte a été vendue au moins trois fois dans sa rareté. En option, les cartes sans image reçoivent la miniature de leur article Wikipédia.

### Page Collection

Une barre **Toolbox** apparaît sous la recherche et les filtres :

- **Trier les nouvelles cartes** : affiche sur place un aperçu (nombre de cartes à classer, étiquettes qui seront ajoutées, doublons apparus ou disparus), puis *Appliquer* pose les étiquettes. Seules les cartes qui n'ont encore aucun thème sont classées.
- **Vendre mes doublons** et **Prix et valeur** ouvrent les onglets correspondants de la Toolbox.

Le site garde ses étiquettes en cache : après un tri, cliquez sur *Actualiser* pour les voir apparaître.

### Fenêtre d'une carte

Quand vous ouvrez une carte (dans votre collection, le catalogue ou le profil d'un joueur), un bloc Toolbox s'ajoute sous ses détails :

- son **prix moyen** dans sa rareté, le nombre de ventes et le prix de la dernière ;
- son **thème** ;
- les **amis intéressés**, d'après leurs profils d'intérêts (« Vous » si elle correspond au vôtre) ;
- les **familles** qui la contiennent, et un menu pour l'ajouter à l'une de vos familles manuelles ;
- si vous la possédez ou non.

### Page d'une enchère

Sous le formulaire de mise, l'**Analyse Toolbox** indique le prix moyen de la carte, l'écart entre la mise actuelle et ce prix (en vert quand elle est au moins 20 % en dessous, en orange au moins 20 % au-dessus), la prochaine mise possible, si vous avez déjà la carte et quels amis elle intéresse. Ce bloc ne fait que lire : la mise se fait toujours avec le formulaire du site.

### Profil d'un autre joueur

Le bloc **Échanges avec …** cherche dans sa collection :

- **À lui demander** : ses cartes que vous n'avez pas et qui correspondent à votre profil d'intérêts ou à votre liste de souhaits ;
- **À lui proposer** : vos cartes qu'il n'a pas et qui correspondent à son profil ; s'il n'a pas de profil, vos doublons qui lui manquent.

Vous pouvez limiter la lecture à certaines raretés : c'est bien plus rapide, car le site met parfois jusqu'à 30 secondes par page de 50 cartes. La collection lue est gardée 12 heures, et une lecture interrompue reprend là où elle s'était arrêtée. Si ce joueur fait partie de la bande, *Utiliser son profil de la bande* l'ajoute en un clic.

### Page Paquets

- **Tout ouvrir**, à côté du bouton *Ouvrir* du site : ouvre d'un coup tous vos paquets disponibles, sans animation, après confirmation. L'ouverture s'arrête à la première erreur ou si le site demande une vérification anti-robot, à faire vous-même sur la page.
- **Récapitulatif du paquet**, sous les cartes une fois la dernière révélée : nouveautés et doublons, cartes shiny, étiquettes posées, prix moyen de chaque carte et valeur totale du paquet.
- **Taux de drop** par rareté sur l'écran d'ouverture : d'après vos tirages comptés par l'extension, ou d'après toute votre collection tant que moins de 50 cartes ont été tirées.

### Page Échanges

Un encart flottant donne la **valeur de chaque côté** de vos échanges en attente (prix moyens connus, plus les WikiBidous ajoutés), et l'écart en votre faveur ou non.

### Alertes

- **Fin d'enchère** : un message et un son vous préviennent quand une enchère sur laquelle vous êtes dépassé se termine dans moins de 2 minutes (délai réglable). La vérification se fait tant qu'un onglet WikiMasters est ouvert et visible.
- **Son de notification** (option) : un son discret quand une nouvelle notification du site arrive.

---

## Le panneau Toolbox

Le panneau s'ouvre par l'entrée **Toolbox** du menu du site ou depuis la popup. Il se ferme avec la croix, la touche Échap ou un clic à côté.

### Tri

Le tri pose trois sortes d'étiquettes WikiMasters :

- un **thème** par carte (voir [la liste](#les-thèmes)) ;
- **Pour : pseudo** pour chaque profil d'intérêts auquel la carte correspond ;
- **Doublon** sur les cartes que vous possédez en plusieurs exemplaires (retirée quand il n'en reste qu'un).

Deux modes, toujours précédés d'un aperçu qui n'écrit rien :

| Mode | Cartes concernées | Quand l'utiliser |
|---|---|---|
| **Trier mes nouvelles cartes** | Les cartes sans thème, plus `Doublon` sur toute la collection | Après avoir ouvert des paquets. Vos corrections manuelles sont conservées |
| **Retri complet** | Toute la collection | Après avoir modifié des profils ou mis à jour l'extension. Les étiquettes gérées qui ne correspondent plus sont retirées, **y compris celles que vous aviez corrigées à la main** : une confirmation est demandée |

L'aperçu détaille le nombre de cartes concernées, les étiquettes ajoutées et retirées, la répartition par thème et le détail carte par carte (avec un filtre). Comptez une à deux minutes : la base de WikiMasters est lente.

### Profils

Un profil d'intérêts décrit ce que collectionne un joueur. Chaque profil actif ajoute l'étiquette « Pour : pseudo » aux cartes qui lui correspondent, et guide la recherche d'échanges.

- **Mon profil** : ce que vous collectionnez. Vos amis peuvent l'importer pour savoir quoi vous proposer.
- **Profils de mes amis** : ajoutez-les à la main, importez le code qu'un ami vous a envoyé, ou importez en un clic les **profils de la bande** fournis avec l'extension.

L'**éditeur simple** suffit dans la plupart des cas :

- **Thèmes entiers** : toutes les cartes de ces thèmes ;
- **Mots-clés**, séparés par des virgules, cherchés dans le titre, la description et la première phrase de l'article. Un mot seul accepte son pluriel ; `*` en fin de mot accepte toutes les terminaisons (`haltérophil*`) ;
- **Exclusions** : mots qui écartent une carte ;
- **Seulement les cartes qui ont une image** (pour les mots-clés).

Les **règles avancées** (JSON) combinent thème, expression régulière, champ, conditions et exclusions, pour les cas précis.

Chaque profil se **teste** sur votre collection (combien de cartes recevraient l'étiquette, lesquelles), se **partage** par un code `WMT-P1.…` à copier-coller, et se met en pause avec la case *actif*. Supprimer un profil ne supprime pas son étiquette existante : le prochain retri complet ne la gérera simplement plus.

### Échanges

Choisissez un ami, éventuellement des raretés et des thèmes précis (plutôt que votre profil), puis *Chercher*. Vous obtenez deux listes filtrables par thème et par texte :

- **À demander** : triées par liste de souhaits, puis cartes qu'il possède en plusieurs exemplaires, puis rareté. Les cartes déjà engagées dans un échange en cours sont signalées.
- **À proposer** : vos doublons d'abord.

Sélectionnez les cartes que vous voulez obtenir : la Toolbox en calcule la valeur, et **Proposer une offre équilibrée** choisit parmi vos cartes un lot de valeur équivalente en prix moyen. *Charger les prix* récupère les prix manquants des deux listes.

En bas de l'onglet, **Échanges en cours** détaille chaque échange en attente : ce que vous donnez, ce que vous recevez, leur valeur et l'écart.

### Prix

- **Valeur estimée** de votre collection, nombre d'exemplaires dont le prix est connu, valeur par rareté.
- **Charger les prix** : les ventes conclues sont lues par lots de cartes, toute une collection se charge en quelques minutes. Choisissez les raretés, et seulement les cartes sans prix récent pour aller plus vite.
- **Mes cartes les plus chères** : classement filtrable par thème.

Le prix d'une carte est la moyenne de ses 200 dernières ventes **dans sa rareté**. Les prix sont gardés 48 heures (réglable) et réutilisés partout : pastilles, récapitulatifs, échanges.

### Marché

- **Mes enchères** : votre solde de WikiBidous, chaque enchère avec la mise actuelle, le temps restant et si vous êtes en tête ou dépassé. Quand vous êtes dépassé, un bouton propose la mise suivante : cliquez, vérifiez le montant dans la confirmation, c'est placé. Si la mise est devenue trop basse entre-temps, la Toolbox vous propose le minimum demandé par le site.
- **Mes ventes en cours**.
- **Vendre mes doublons** : vos cartes en plusieurs exemplaires, les plus chères d'abord. *Vendre* ouvre une fenêtre pour choisir la mise de départ (pré-remplie avec le prix moyen) et la durée (10 minutes à 12 heures). Vous gardez toujours au moins un exemplaire, et le nombre de ventes simultanées autorisé par le site est affiché.

### Paquets

- **Tout ouvrir**, comme sur la page Paquets, avec le nombre de paquets disponibles.
- **Statistiques de tirage** : nombre et pourcentage de cartes tirées par rareté depuis une date, réinitialisables.
- Le **dernier récapitulatif** de paquet.

### Familles

Une famille est un groupe de cartes à compléter : « Star Wars », « Grands peintres »…

- **Manuelle** : vous choisissez les cartes une à une, depuis le catalogue ou depuis la fenêtre d'une carte.
- **Intelligente** : remplie par une recherche dans le catalogue du site, affinée par des mots-clés obligatoires, des exclusions, des thèmes et des raretés. *Actualiser* relance la recherche (500 cartes lues au plus).
- **Depuis une étiquette** : une famille créée à partir des cartes qui portent une de vos étiquettes.

Pour chaque famille : progression (possédées / total), filtre *Toutes / Possédées / Manquantes*, choix de l'image de couverture (étoile), **Manquantes en vente** (les 40 premières cartes manquantes cherchées sur le marché), **En faire une étiquette** (vos exemplaires reçoivent une étiquette personnelle au nom de la famille, que le tri ne touchera jamais), partage par code `WMT-F1.…`. Le code contient la liste des cartes, pas vos possessions.

### Réglages

Voir [Réglages](#réglages) ci-dessous.

---

## La popup de l'extension

L'icône de l'extension dans la barre du navigateur ouvre des raccourcis :

- **Trier mes nouvelles cartes** : ouvre la Toolbox et lance l'aperçu ;
- **Ouvrir la Toolbox**, ou directement l'onglet *Échanges*, *Enchères*, *Prix* ou *Familles* ;
- **Tout ouvrir**, avec le nombre de paquets disponibles.

Hors de wiki-masters.com, elle propose d'ouvrir le site. Si elle demande de recharger la page, c'est que l'extension a été installée ou mise à jour après l'ouverture de l'onglet.

---

## Comment une carte est triée

Le thème d'une carte se déduit de sa **description courte** (« footballeur danois », « commune française du département… », « espèce d'arachnides ») et de la première phrase de son article : le type de l'article est le signal le plus fiable. Chaque thème a ses mots-clés ; le thème qui obtient le meilleur score l'emporte, et une carte sans signal fiable va dans *Autre*. Les pages d'homonymie, noms de famille et prénoms vont dans *Divers & Homonymies*, et la politique se partage entre française et internationale selon la nationalité.

Le moteur est vérifié sur plus de 300 cartes étiquetées à la main à chaque modification. Si une carte est mal classée, corrigez son étiquette à la main sur le site (le tri des nouvelles cartes ne la touchera plus) et signalez-la dans les [issues](https://github.com/LeadOn/Wikimasters-card-sorter/issues) pour que les règles soient corrigées pour tout le monde.

### Les thèmes

Politique Française · Politique Internationale · Automobile & Transports · Pop-Culture & Divertissement · Technologie & Informatique · Sciences · Atome & Chimie · Sports · Monuments & Lieux historiques · Affaires Criminelles · Religion & Mythes · Histoire · Géographie & Territoires · Arts & Littérature · Personnalités · Faune & Flore · Astronomie & Espace · Militaire & Armement · Divers & Homonymies · Autre

Leurs couleurs se changent dans les réglages ; elles sont appliquées aux étiquettes WikiMasters au tri suivant.

### Les raretés

`L` Légendaire · `UR` Ultra Rare · `SR` Super Rare · `R` Rare · `PC` Peu commune · `C` Commune

---

## Réglages

Chaque fonction se coupe indépendamment, dans l'onglet *Réglages* de la Toolbox. Les réglages restent dans votre navigateur.

| Groupe | Fonction | Par défaut |
|---|---|---|
| Cartes | Pastille du thème | activée |
| Cartes | Prix moyen | activée |
| Cartes | Lien Wikipédia | activée |
| Cartes | Possédée / manquante | activée |
| Cartes | Images manquantes (requête à fr.wikipedia.org) | désactivée |
| Pages du site | Barre Toolbox sur la collection | activée |
| Pages du site | Infos dans la fiche d'une carte | activée |
| Pages du site | Analyse des enchères | activée |
| Pages du site | Bonnes affaires du marché | activée |
| Pages du site | Échanges sur le profil d'un ami | activée |
| Paquets | Récapitulatif après un paquet | activée |
| Paquets | Statistiques de tirage | activée |
| Paquets | Bouton « Tout ouvrir » | activée |
| Paquets | Trier automatiquement les cartes tirées | désactivée |
| Paquets | Proposer de trier après un paquet | activée |
| Échanges | Valeur des échanges | activée |
| Marché | Alerte de fin d'enchère | activée |
| Confort | Son de notification | désactivée |

**Trier automatiquement les cartes tirées** : dès l'ouverture d'un paquet, les nouveaux exemplaires reçoivent leur thème, leurs étiquettes « Pour : … » et `Doublon`. Seuls les exemplaires qui viennent d'arriver sont touchés, rien n'est supprimé.

L'onglet règle aussi la **durée de validité d'un prix** (48 heures par défaut), le **délai de l'alerte de fin d'enchère** (2 minutes), les **couleurs des étiquettes**, et permet de vider le cache des prix, d'oublier les collections d'amis enregistrées ou de tout réinitialiser.

---

## Sécurité et vie privée

- **Aucune écriture sans clic.** Poser des étiquettes, enchérir, mettre en vente, ouvrir des paquets : rien ne se fait sans que vous cliquiez, et les actions importantes demandent une confirmation.
- **Pas d'ouverture automatique de paquets** ni de comportement qui imite un joueur. Si le site demande une vérification anti-robot, la Toolbox s'arrête et vous laisse la faire.
- **Vos étiquettes personnelles ne sont jamais modifiées** : seuls les thèmes, les « Pour : … » et `Doublon` sont gérés par la Toolbox.
- **Le serveur est ménagé** : peu de requêtes en parallèle, pauses en cas de surcharge, et une écriture restée sans réponse n'est jamais renvoyée automatiquement (elle est signalée comme « peut-être prise en compte »).
- **Aucun serveur tiers.** L'extension ne parle qu'à WikiMasters, avec votre session, comme le site lui-même. Ni compte, ni publicité, ni statistiques d'usage. Tout ce qu'elle enregistre reste dans votre navigateur. Détails : [politique de confidentialité](../PRIVACY.md).

---

## Questions fréquentes

**L'entrée « Toolbox » n'apparaît pas dans le menu.**
Rechargez la page wiki-masters.com. Vérifiez que l'extension est activée et que vous êtes connecté au site.

**Un message dit que la Toolbox a été mise à jour.**
L'extension a été mise à jour pendant que l'onglet était ouvert : rechargez la page pour qu'elle continue d'enregistrer vos données.

**Les étiquettes posées n'apparaissent pas sur le site.**
Le site garde ses données en cache : actualisez la page.

**Le tri ou la recherche d'échanges est lent.**
La base de WikiMasters répond lentement, surtout pour les collections des autres joueurs (jusqu'à 30 secondes par page). Filtrez par rareté pour aller plus vite ; une lecture interrompue reprend où elle s'était arrêtée.

**Un message parle d'une écriture « peut-être prise en compte ».**
Le serveur n'a pas répondu à temps. La Toolbox ne renvoie jamais une écriture d'elle-même, pour ne pas la faire deux fois : relancez l'aperçu, il montrera ce qui reste à faire.

**« Tout ouvrir » s'est arrêté.**
Le site a demandé une vérification anti-robot ou a renvoyé une erreur. Faites la vérification sur la page Paquets, puis recommencez.

**Une carte affiche « jamais vendue dans cette rareté ».**
Aucune vente conclue n'existe pour cette carte dans cette rareté : il n'y a pas de prix moyen à calculer.

**Comment tout effacer ?**
Onglet *Réglages* → *Données*, ou désinstallez l'extension : tout ce qu'elle a enregistré est supprimé avec elle.

**Un problème, une idée ?**
Ouvrez une [issue sur GitHub](https://github.com/LeadOn/Wikimasters-card-sorter/issues).
