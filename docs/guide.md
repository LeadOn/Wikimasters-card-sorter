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
2. **Ouvrez la Toolbox** par l'entrée **Toolbox** du menu du site (sur mobile, dans le menu *Plus*), ou par l'icône de l'extension dans la barre du navigateur. Sur un téléphone, elle occupe tout l'écran (onglets en icônes sous l'en-tête), ses fenêtres s'ouvrent depuis le bas avec leurs boutons toujours visibles, et ses notifications s'affichent au-dessus de la barre de navigation du site.
3. **Triez votre collection** : onglet *Tri* → *Aperçu du tri* → *Appliquer*. Chaque carte reçoit une étiquette de thème (Sports, Histoire, Sciences…), et les cartes en plusieurs exemplaires l'étiquette `Doublon`. Vos étiquettes personnelles ne sont jamais touchées.
4. **Décrivez ce que vous collectionnez** dans l'onglet *Profils*, et importez les profils de vos amis : la Toolbox saura quelles cartes leur proposer, et lesquelles leur demander.

Rien n'est jamais écrit sur votre compte sans un clic de votre part.

---

## Ce qui change sur les pages du site

L'extension s'intègre aux pages de wiki-masters.com. Chaque élément ci-dessous se désactive dans les [réglages](#réglages).

### L'affichage des cartes

Partout où le site affiche des cartes (collection, catalogue, marché, profils, fenêtre d'une carte, paquets), la Toolbox les présente autrement :

- l'**image occupe toute la carte** au lieu de sa moitié haute ;
- la texture de rareté du site devient le **cadre** de la carte (doré pour une légendaire, orange pour une ultra rare…) ;
- le titre, la description, vos étiquettes et les points d'attaque et de défense passent **sur l'image**, sur un voile sombre qui les garde lisibles ;
- une image très large (logo, bandeau, panorama) est montrée **en entier** en haut de la carte, sur une copie floutée d'elle-même ;
- une carte sans image garde la **carte sans image du site** : son logo sur la texture de la rareté, placé au-dessus du titre.

Avec l'option **Images manquantes**, les cartes sans image en reçoivent une, cherchée sur Wikimedia : l'image de l'article sur Wikipédia en français, puis celle de l'élément Wikidata, celle de l'article en anglais (affiches de films, pochettes d'albums), la photo d'un membre pour un duo ou un groupe, un logo, un blason ou un drapeau, puis l'image de l'article dans une autre langue (allemand, espagnol, italien, russe…, trouvé grâce à Wikidata : cinq langues au plus), toute autre image de l'élément Wikidata (image apparentée, vue aérienne, sceau, structure chimique…, la signature en dernier), sa carte de localisation pour un lieu, et en dernier recours l'image d'un élément Wikidata lié qui représente le sujet : la personne dont il porte le nom (le portrait de Jacobi pour la *Conjecture jacobienne*), l'œuvre adaptée, la série ou la franchise, l'interprète, l'auteur ou le créateur, le sujet traité, l'organisation mère. Les mêmes images complètent les cartes du panneau Toolbox. Une carte qu'aucune de ces sources n'illustre garde la carte sans image du site.

La recherche reste prudente :

- une image **masquée par le site** (signalée) n'est jamais remplacée ;
- pour un **sujet sensible** (sexualité, chirurgie, maladie, violence, mort…), seules les images principales des articles de Wikipédia en français et en anglais, choisies par ses éditeurs, sont utilisées (ni Wikidata, ni éléments liés) ;
- toute autre image est vérifiée contre la liste des images que Wikipédia refuse d'afficher hors contexte ;
- dans les autres langues, la carte vierge d'un pays et les images « image manquante » sont écartées ;
- une page d'homonymie ne reçoit pas d'image.

Le site garde la main sur ses cartes : un clic ouvre toujours la carte, le bouton favori reste à sa place. Pour retrouver l'affichage d'origine, coupez *Nouvel affichage des cartes* dans les [réglages](#réglages).

### Sur les cartes (marché, profils, catalogue)

Des pastilles s'ajoutent en haut à droite de chaque carte affichée par le site :

| Pastille | Signification |
|---|---|
| `8 042 ₩` | Prix du marché de la carte **dans sa rareté** (celui des shiny pour une carte shiny), quand il est connu (voir [Prix](#prix)) |
| `≈ 31 ₩` | Prix seulement **indicatif** : la carte s'est vendue trop peu de fois pour un prix fiable (le détail s'affiche au survol) |
| ✓ | Vous possédez déjà cette carte (affichée partout sauf dans votre propre collection et dans la collection globale, qui l'indiquent déjà) |
| `Nouvelle` | Vous n'avez pas cette carte (sur le marché et le profil des autres joueurs) |
| `■ Sports` | Thème de la carte calculé par la Toolbox (pas sur votre collection, où il est déjà en étiquette) |
| `W` | Ouvre l'article Wikipédia de la carte |
| `−34 %` | **Bonne affaire** sur le marché : l'enchère se termine dans moins de 15 minutes et la mise minimale est au moins 25 % sous le prix du marché |
| `+120 %` | **Trop cher** sur le marché : la mise minimale dépasse le prix du marché d'au moins 50 % |

Les pastilles du marché ne s'affichent que pour un prix fiable. Une carte shiny mise aux enchères est comparée au prix des shiny.

### Page Collection

Une barre **Toolbox** apparaît sous la recherche et les filtres :

- **Trier les nouvelles cartes** : affiche sur place un aperçu (nombre de cartes à classer, étiquettes qui seront ajoutées, doublons apparus ou disparus), puis *Appliquer* pose les étiquettes. Seules les cartes qui n'ont encore aucun thème sont classées.
- **Filtres de la collection** : ils portent sur **toute** votre collection, pas seulement sur la page de 50 cartes affichée par le site. Dès qu'un filtre est choisi, la liste s'affiche dans la barre et la grille du site est masquée ; *Revenir à la grille du site* la fait réapparaître. Trois lignes, qui se combinent :
  - **Cartes** : *Toutes*, ou un ou plusieurs critères **cumulables** : *Doublons* (cartes possédées en plusieurs exemplaires), *Sans image* (ou dont le site a masqué l'image), *GIF*. Cocher *Sans image* et *Doublons* ne garde que les doublons sans image.
  - **Ventes** : *Tous les prix*, *Jamais vendues* (dans aucune rareté, ou dans la rareté de votre exemplaire), ou *Vendues entre …* : un intervalle *de … à … ₩*, bornes incluses, à saisir ou à choisir parmi les tranches proposées (≤ 5, 6–10, 11–25, 26–50, 51–100, > 100 ₩). Laissez une borne vide pour « jusqu'à … » ou « à partir de … » ; des bornes saisies à l'envers sont remises dans l'ordre. Le prix comparé est le prix moyen de vente dans la rareté de votre exemplaire. Les nombres de cette ligne comptent les cartes choisies dans *Cartes*.
  - **Mots-clés** : tapez un mot du titre ou de la description puis *Entrée* (ou *Inclure*) ; `-mot` puis *Entrée* (ou *Exclure*) l'exclut. Le mot filtre la liste dès la saisie. Ajoutez-en autant que voulu : une carte doit contenir au moins un des mots inclus (*Tous les mots*, proposé dès deux mots inclus, les exige tous) et aucun mot exclu. Un clic sur un mot le fait passer d'inclus à exclu ; la croix (ou *Retour arrière* dans le champ vide) le retire. Majuscules et accents sont ignorés, et une partie de mot suffit (« foot » trouve « footballeur »).
  - **Affiner** : raretés, thème.

  Les filtres de vente ne comptent que les cartes dont les prix ont été chargés : si certaines n'en ont pas, un bouton charge ceux des cartes concernées.

  La liste montre les cartes en grand, en grille comme celle du site : image, rareté, titre, description, thème, prix et boutons. **Un clic sur une carte la coche** (ou *Espace* au clavier), et **un clic sur son nom l'ouvre** dans la fenêtre habituelle du site. Chaque carte se met aux enchères ou se défausse sur place, une à une ou en lot (voir l'onglet [Prix](#prix), qui propose les mêmes filtres).
- **Prix et valeur** ouvre l'onglet [Prix](#prix) de la Toolbox. Les doublons se trouvent avec le filtre *Doublons* ci-dessus (l'onglet *Marché* garde sa liste *Mes doublons*).

Le site garde ses étiquettes en cache : après un tri, cliquez sur *Actualiser* pour les voir apparaître.

### Fenêtre d'une carte

Quand vous ouvrez une carte (dans votre collection, le catalogue ou le profil d'un joueur), un bloc Toolbox s'ajoute sous ses détails :

- son **prix du marché** dans sa rareté (celui des shiny pour une carte shiny), le nombre de ventes (et combien de premières ventes sont ignorées), le prix de la dernière et la moyenne affichée par le site ; « indicatif » quand il y a trop peu de ventes ;
- son **thème** ;
- les **amis intéressés**, d'après leurs profils d'intérêts (« Vous » si elle correspond au vôtre) ;
- les **familles** qui la contiennent, et un menu pour l'ajouter à l'une de vos familles manuelles ;
- si vous la possédez ou non.

### Page d'une enchère

Sous le formulaire de mise, l'**Analyse Toolbox** indique le prix du marché de la carte (celui des shiny pour une carte shiny), l'écart entre la mise actuelle et ce prix s'il est fiable (en vert quand elle est au moins 20 % en dessous, en orange au moins 20 % au-dessus), la prochaine mise possible, si vous avez déjà la carte et quels amis elle intéresse. Ce bloc ne fait que lire : la mise se fait toujours avec le formulaire du site.

Le **titre de l'onglet** suit l'enchère, pour la surveiller depuis un autre onglet : temps restant, votre position et la mise actuelle, par exemple `✓ 4:07 · En tête · 1 250 ₩ — Titre de la carte`.

| Début du titre | Signification |
|---|---|
| `✓` | vous êtes en tête |
| `✗` | vous avez misé et un autre joueur est passé devant vous (« Surenchéri ») |
| `↑` | nouvelle mise d'un autre joueur, sur une enchère où vous n'avez pas misé ou sur votre propre vente |
| `✓ Gagnée`, `✗ Perdue`, `Terminée` | enchère terminée |

Quand quelqu'un surenchérit, le titre clignote (« ✗ SURENCHÉRI ! » ou « ↑ NOUVELLE MISE ») jusqu'à ce que vous reveniez sur l'onglet. Le site ne relit pas l'enchère de lui-même : la Toolbox la relit toutes les 30 secondes, toutes les 15 secondes dans les 10 dernières minutes et toutes les 5 secondes dans les 2 dernières, et dès que vous revenez sur l'onglet. Un navigateur peut ralentir les onglets restés longtemps en arrière-plan (Chrome : au plus une mise à jour par minute après 5 minutes) : le titre peut alors avoir un peu de retard. Désactivable dans les réglages (*Enchère dans le titre de l'onglet*).

### Profil d'un autre joueur

Le bloc **Échanges avec …** cherche dans sa collection :

- **À lui demander** : ses cartes que vous n'avez pas et qui correspondent à votre profil d'intérêts ou à votre liste de souhaits ;
- **À lui proposer** : vos cartes qu'il n'a pas et qui correspondent à son profil ; s'il n'a pas de profil, vos doublons qui lui manquent.

Vous pouvez limiter la lecture à certaines raretés : c'est bien plus rapide, car le site met parfois jusqu'à 30 secondes par page de 50 cartes. La collection lue est gardée 12 heures, et une lecture interrompue reprend là où elle s'était arrêtée. Sans profil pour ce joueur, *Ajouter son profil* ouvre l'onglet Profils.

### Page Paquets

- **Tout ouvrir**, à côté du bouton *Ouvrir* du site : ouvre tous vos paquets disponibles, sans animation, après confirmation. Le site impose environ 2 secondes entre deux paquets : l'ouverture prend donc quelques secondes par paquet, et le bouton affiche sa progression. L'ouverture s'arrête à la première erreur ou si le site demande une vérification anti-robot : ouvrez alors le paquet suivant avec le bouton *Ouvrir* du site, faites la vérification qu'il affiche, puis relancez *Tout ouvrir*.
- **Récapitulatif du paquet**, sous la carte une fois la dernière révélée : nouveautés et doublons, cartes shiny, étiquettes posées, prix du marché de chaque carte et valeur totale du paquet (prix fiables seulement ; un prix indicatif est précédé de « ≈ »). Les cartes peuvent y être traitées sur place :
  - **Défausser** : cochez les cartes à défausser (case de la ligne ou clic sur la ligne ; *Tout* coche toutes les cartes, *Doublons* les doublons sauf les shiny), puis un seul clic sur *Défausser*. Chaque exemplaire rapporte 1 WikiBidou, après une confirmation qui précise combien sont vos seuls exemplaires, lesquelles sont shiny et ce qu'elles vaudraient aux enchères. Les cartes sont défaussées l'une après l'autre ; au premier refus du site, la défausse s'arrête et indique combien de cartes ont été défaussées. Le solde affiché par le site se met à jour.
  - **Vendre** ouvre, carte par carte, la fenêtre de mise aux enchères (mise de départ préremplie avec le prix du marché s'il est fiable, durée de 10 minutes à 12 heures, nombre de ventes en cours).

  Une fois l'action faite, la ligne l'indique (« En vente », « Défaussée »). Si le tri automatique des cartes tirées est en cours, la défausse attend qu'il ait fini.
- **Ouvrir le prochain**, en bas du récapitulatif quand il vous reste des paquets : passe l'écran de fin (*Continuer*) et ouvre le paquet suivant avec le bouton *Ouvrir* du site, animation comprise. Si le site demande une vérification anti-robot, sa fenêtre de vérification s'affiche comme d'habitude.
- **Taux de drop** par rareté sur l'écran d'ouverture : d'après vos tirages comptés par l'extension, ou d'après toute votre collection tant que moins de 50 cartes ont été tirées.

### Page Stonks

L'entrée **Stonks** du menu du site (juste après *Marché* ; sur mobile, dans le menu *Plus* de la barre du bas) ouvre l'historique de vos achats et ventes aux enchères, à la place du contenu de la page (l'adresse se termine par `#stonks` : *Retour* ou un autre lien du menu la referme, et un rechargement la rouvre). Cette page ne fait que lire : aucune action d'achat ou de vente.

- **Tout / Achat-revente** : *Achat-revente* n'affiche que les cartes achetées au marché puis revendues, pour isoler vos vrais allers-retours. Chaque revente y apparaît à la date de la vente, avec sa date et son prix d'achat, son prix de vente, sa plus-value et sa durée de détention ; les indicateurs deviennent plus-value, prix de vente, prix d'achat des cartes revendues, part des reventes gagnantes et détention moyenne. Les ventes de cartes tirées, les achats pas encore revendus et la plus-value latente sont écartés. Ce choix, comme la période et la mesure du graphique, est gardé d'une visite à l'autre.
- **Jour / Semaine / Mois** : la période affichée, avec ses flèches pour passer à la précédente ou à la suivante. Une semaine va du lundi au dimanche ; tout est en heure locale.
- **Indicateurs de la période** : *plus-value réalisée* (et son rendement sur le prix d'achat des cartes revendues), *ventes* (dont les cartes que vous n'aviez pas achetées : paquets, échanges), *achats*, *flux net* (ventes moins achats) et part des *reventes gagnantes*, avec la durée moyenne de détention.
- **Graphique** : la *plus-value* réalisée, ou le *flux net*, de chaque jour (30 derniers), semaine (16) ou mois (12), au-dessus de zéro en vert, en dessous en rouge ; un point sur la ligne de zéro marque une période avec des opérations mais à zéro. Le survol donne le détail ; un clic sur une barre affiche cette période. Sur un écran étroit, une date sur deux est masquée sous le graphique, et chaque ligne des tableaux devient une fiche (la carte, puis chaque valeur avec son libellé).
- **Opérations** de la période, filtrables (achats, ventes) et triables (récentes, plus-value) : prix, prix d'achat, plus-value en ₩ et en %, durée de détention. Un achat déjà revendu indique la plus-value de sa revente ; sinon « en stock ».
- **Cartes achetées en stock** : vos achats pas encore revendus et toujours dans votre collection, avec le prix du marché actuel et la plus-value latente (prix fiables seulement).

**Calcul de la plus-value.** Chaque vente est rapprochée du plus ancien achat encore en stock de la même carte, dans la même rareté et la même version (shiny ou non), acheté avant elle (« premier entré, premier sorti »). La plus-value est le prix de vente moins ce prix d'achat. Une vente sans achat correspondant (carte tirée d'un paquet, reçue par échange) n'entre pas dans la plus-value : elle compte dans les ventes et le flux net. Les montants sont ceux des enchères conclues (`final_price`) : le site ne prend pas de commission, le vendeur reçoit le prix final.

*Actualiser* relit l'historique ; il est aussi relu à l'ouverture de la page quand il date de plus de 5 minutes.

### Page Échanges

Un encart flottant donne la **valeur de chaque côté** de vos échanges en attente (prix du marché fiables, shiny comprises, plus les WikiBidous ajoutés), et l'écart en votre faveur ou non.

Quand vous composez une offre (*Proposer un échange*, fenêtre « Échanger avec … »), un bloc **Bilan** sous le nombre de cartes de chaque côté se met à jour à chaque carte ajoutée ou retirée : ce que vous donnez, ce que vous recevez (cartes au prix du marché fiable, plus les WikiBidous ajoutés) et la **différence** en votre faveur ou non, en ₩ et en pourcentage de ce que vous donnez. Une carte sans prix fiable n'est pas comptée : le bloc le signale et les montants passent en « ≈ ». Le site n'affiche que les cartes choisies de l'onglet ouvert : des cartes déjà choisies à l'ouverture de la fenêtre sont estimées dès que vous ouvrez leur onglet. Le bloc ne fait que lire : l'offre part toujours avec le bouton du site.

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
| **Retri complet** | Toute la collection | Après avoir modifié des profils ou des thèmes, ou mis à jour l'extension. Les étiquettes gérées qui ne correspondent plus sont retirées, **y compris celles que vous aviez corrigées à la main** : une confirmation est demandée |

L'aperçu détaille le nombre de cartes concernées, les étiquettes ajoutées et retirées, la répartition par thème et le détail carte par carte (avec un filtre). Comptez une à deux minutes : la base de WikiMasters est lente.

### Profils

Un profil d'intérêts décrit ce que collectionne un joueur. Chaque profil actif ajoute l'étiquette « Pour : pseudo » aux cartes qui lui correspondent, et guide la recherche d'échanges.

- **Mon profil** : ce que vous collectionnez. Vos amis peuvent l'importer pour savoir quoi vous proposer.
- **Profils de mes amis** : ajoutez-les à la main, ou importez le code ou le fichier JSON qu'un ami vous a envoyé.

L'**éditeur simple** suffit dans la plupart des cas :

- **Thèmes entiers** : toutes les cartes de ces thèmes ;
- **Mots-clés**, séparés par des virgules, cherchés dans le titre, la description et la première phrase de l'article. Un mot seul accepte son pluriel ; `*` en fin de mot accepte toutes les terminaisons (`haltérophil*`) ;
- **Exclusions** : mots qui écartent une carte ;
- **Seulement les cartes qui ont une image** (pour les mots-clés).

Les **règles avancées** (JSON) combinent thème, expression régulière, champ, conditions et exclusions, pour les cas précis.

Chaque profil se **teste** sur votre collection (combien de cartes recevraient l'étiquette, lesquelles), se **partage** (*Partager* : un code `WMT-P1.…` à copier-coller, ou *Télécharger en JSON*), et se met en pause avec la case *actif*. Supprimer un profil ne supprime pas son étiquette existante : le prochain retri complet ne la gérera simplement plus.

**Exporter / importer en JSON** (en haut de l'onglet) :

- *Exporter* donne tous vos profils, le vôtre et ceux de vos amis, en JSON à copier ou à télécharger (`wikimasters-profils-<date>.json`) : pratique pour les retrouver dans un autre navigateur ou pour les donner à un ami ;
- *Importer* accepte un code `WMT-P1.…`, un export JSON (un profil ou plusieurs), collé ou choisi dans un fichier. Un résumé s'affiche avant l'import : le profil qui porte votre pseudo devient le vôtre, un ami déjà présent (même pseudo) est remplacé en gardant sa case *actif*, les autres sont ajoutés. Un profil invalide (règle illisible, expression trop lente, nom en double) est écarté et signalé, sans bloquer les autres.

Les profils de la bande ne sont plus fournis avec l'extension. Ceux que vous aviez déjà importés restent dans vos profils, et se partagent comme les autres par *Exporter*.

### Échanges

Choisissez un ami, éventuellement des raretés et des thèmes précis (plutôt que votre profil), puis *Chercher*. Vous obtenez deux listes filtrables par thème et par texte :

- **À demander** : triées par liste de souhaits, puis cartes qu'il possède en plusieurs exemplaires, puis rareté. Les cartes déjà engagées dans un échange en cours sont signalées.
- **À proposer** : vos doublons d'abord.

Sélectionnez les cartes que vous voulez obtenir : la Toolbox en calcule la valeur, et **Proposer une offre équilibrée** choisit parmi vos cartes un lot de valeur équivalente en prix du marché. *Charger les prix* récupère les prix manquants des deux listes.

En bas de l'onglet, **Échanges en cours** détaille chaque échange en attente : ce que vous donnez, ce que vous recevez, leur valeur et l'écart.

### Prix

- **Valeur estimée** de votre collection, nombre d'exemplaires dont le prix est connu, valeur par rareté. Les exemplaires vendus trop peu de fois (*Prix incertain*) ne comptent pas dans la valeur.
- **Charger les prix** : les ventes conclues sont lues par lots de cartes, toute une collection se charge en quelques minutes. Choisissez les raretés, et seulement les cartes sans prix récent pour aller plus vite.
- **Mes cartes les plus chères** : classement filtrable par thème, prix fiables seulement (une Commune vendue une fois très cher n'y apparaît pas).
- **Filtrer ma collection** (bascule *Filtrer* à côté du classement ; mêmes filtres que sur la page Collection, *Jamais vendues* choisi d'office) : vos cartes les plus rares d'abord, filtrées par critères cumulables (doublons, sans image, GIF) et par vente. *Jamais vendues dans aucune rareté* ne garde que les cartes sans aucune vente conclue ; *dans la rareté de mon exemplaire*, celles qui ne se sont jamais vendues dans cette rareté (la pastille « vendue en … » indique les autres raretés vendues). *Vendues entre …* garde les cartes dont le prix du marché fiable dans leur rareté est dans l'intervalle choisi (bornes incluses). Seules les cartes dont les prix ont été chargés sont comptées : si certaines n'en ont pas encore, un bouton les charge.
  - **Une carte** : *Vendre* ouvre la fenêtre de mise aux enchères (sans prix de référence, la mise de départ est à choisir) ; la corbeille la défausse contre 1 WikiBidou, après confirmation.
  - **Plusieurs cartes** : cliquez sur les cartes pour les cocher, n'importe où sauf sur leur nom et leurs boutons (*Tout* coche la liste affichée), puis *Mettre aux enchères* (même mise de départ et même durée pour toutes, dans la limite des ventes simultanées autorisées par le site) ou *Défausser*, après une confirmation qui signale vos derniers exemplaires et les cartes shiny. Les cartes sont traitées une à une, *Arrêter* interrompt la série, et la première erreur l'arrête aussi : rien n'est jamais renvoyé automatiquement.
  - Un exemplaire par carte à chaque fois : jamais un favori (le site les verrouille), une carte shiny en dernier. La carte disparaît de la liste quand il ne vous en reste plus.

Le **prix du marché** d'une carte est la **médiane de ses 30 dernières ventes dans sa rareté**, hors cartes shiny : une vente aberrante (une Commune vendue 15 000 ₩) ne le déplace pas, contrairement à la moyenne des 200 dernières ventes affichée par le site. Une carte **shiny** a son propre prix, calculé sur les seules ventes shiny.

Un prix n'est **fiable** qu'à partir de 3 ventes, sans compter la toute première vente de la carte dans cette rareté, souvent faite à un prix sans rapport avec le marché (les deux nombres se règlent dans l'onglet *Réglages*). En dessous, le prix est affiché « ≈ » à titre indicatif : il ne compte ni dans les totaux (collection, paquet, échanges), ni dans les mises de départ proposées, ni dans les bonnes affaires.

Les prix sont gardés 48 heures (réglable) et réutilisés partout : pastilles, récapitulatifs, échanges.

### Marché

- **Mes enchères** : votre solde de WikiBidous, chaque enchère avec la mise actuelle, le temps restant et si vous êtes en tête ou dépassé. Quand vous êtes dépassé, un bouton propose la mise suivante : cliquez, vérifiez le montant dans la confirmation, c'est placé. Si la mise est devenue trop basse entre-temps, la Toolbox vous propose le minimum demandé par le site.
- **Mes ventes en cours**.
- **Mes doublons** : vos cartes en plusieurs exemplaires, les plus chères d'abord. Pour chacune :
  - *Vendre* ouvre une fenêtre pour choisir la mise de départ (pré-remplie avec le prix du marché s'il est fiable) et la durée (10 minutes à 12 heures). Le nombre de ventes simultanées autorisé par le site est affiché.
  - La corbeille **défausse** un exemplaire contre 1 WikiBidou, après une confirmation qui indique combien d'exemplaires il vous restera, si c'est une carte shiny et si elle vaut davantage aux enchères. Le solde affiché par le site se met à jour.

  Vous gardez toujours au moins un exemplaire : une carte quitte la liste quand il ne vous en reste qu'un. L'exemplaire vendu ou défaussé est le moins rare, jamais un favori (le site les verrouille), une carte shiny en dernier ; si tous vos exemplaires sont en favori, ni la vente ni la défausse ne sont possibles. L'étiquette `Doublon` de l'exemplaire restant est retirée au prochain tri.

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

### Images

Les cartes de toute votre collection classées selon leur image :

- **Sans image** : le site n'a pas d'image pour la carte, ou l'a masquée (image signalée, marquée « masquée par le site »). Avec l'option *Images manquantes*, la carte montre l'image trouvée sur Wikimedia ; une image masquée par le site n'est jamais remplacée. Une carte qui ne montre que le logo du site sur la texture de sa rareté, comme la carte sans image du site, signale un article qu'aucune image n'illustre, ni sur Wikipédia ni sur Wikidata (le logo pulse tant que la recherche est en cours).
- **GIF** : l'image est au format GIF, le plus souvent animée (quelques logos anciens sont des GIF fixes).

Chaque carte apparaît une fois par rareté, avec le nombre d'exemplaires. La liste se filtre par rareté et par titre ou description. La collection lue est gardée quelques minutes, comme pour les autres onglets.

### Succès

Les succès du site (*Posséder 1000 cartes*, *Conclure 5 échanges*…) et leurs récompenses en WikiBidous :

- **Indicateurs** : succès débloqués, nombre et montant des récompenses à réclamer, récompenses déjà reçues.
- **Tout réclamer** : réclame d'un clic la récompense de chaque succès débloqué qui ne l'a pas encore été, l'un après l'autre. Le solde affiché par le site se met à jour. À la première erreur, la réclamation s'arrête et la liste est relue.
- **Liste**, filtrable (*Tous*, *À réclamer*, *En cours*, *Réclamés*) : les succès à réclamer d'abord, puis ceux en cours, les plus avancés en premier (avec leur progression, par exemple 10 081 / 30 000), puis ceux déjà réclamés.

À l'ouverture de l'onglet (et avec *Actualiser*), la Toolbox fait la même synchronisation que la page *Succès* du site à chaque visite : les succès atteints sont débloqués et la progression des autres est mise à jour.

Avec l'option **Réclamer les succès automatiquement** (désactivée par défaut), les récompenses sont réclamées sans clic : au chargement d'une page WikiMasters, toutes les 15 minutes tant que l'onglet est visible, et quelques secondes après l'ouverture d'un paquet ou un échange. Un message indique ce qui a été reçu.

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

Le moteur est vérifié sur plus de 300 cartes étiquetées à la main à chaque modification (avec les thèmes par défaut). Si une carte est mal classée, corrigez son étiquette à la main sur le site (le tri des nouvelles cartes ne la touchera plus) et signalez-la dans les [issues](https://github.com/LeadOn/Wikimasters-card-sorter/issues) pour que les règles soient corrigées pour tout le monde.

### Les thèmes

Politique Française · Politique Internationale · Automobile & Transports · Pop-Culture & Divertissement · Technologie & Informatique · Sciences · Atome & Chimie · Sports · Monuments & Lieux historiques · Affaires Criminelles · Religion & Mythes · Histoire · Géographie & Territoires · Arts & Littérature · Personnalités · Faune & Flore · Astronomie & Espace · Militaire & Armement · Divers & Homonymies · Autre

C'est la liste par défaut : chacun peut la modifier, la compléter ou la réduire (voir [Personnaliser les thèmes](#personnaliser-les-thèmes)).

### Personnaliser les thèmes

L'onglet *Réglages* → **Thèmes de tri** liste les thèmes avec leur couleur. Pour chaque thème :

- **Nom et couleur** : le nom est celui de l'étiquette WikiMasters ;
- **Mots-clés** (bouton *Mots-clés*) : une expression par ligne, cherchée comme mot entier dans la description, la première phrase et le titre de la carte. `s?` rend une lettre facultative (`requins?`), `(?:a|b)` propose deux variantes. Les **noms ambigus** ne comptent qu'en tête de la description (« tour », « fort », « port ») ;
- **Séparer France / international** : deux étiquettes, selon la nationalité trouvée dans la description (comme *Politique Française* et *Politique Internationale*) ;
- **Supprimer** le thème, ou **Rétablir ce thème** s'il a été modifié.

*Ajouter un thème* en crée un nouveau, *Thèmes par défaut* revient à la liste d'origine. Le champ **Essayer** montre, avant d'enregistrer, le thème qu'obtiendrait une carte à partir de sa description (« footballeur danois »). Rien ne change tant que vous ne cliquez pas sur **Enregistrer**. L'étiquette des cartes sans thème reconnu (*Autre*) et la couleur de `Doublon` se règlent au même endroit.

**Partager une liste** : *Exporter* donne la liste affichée en JSON, à copier ou à télécharger (`wikimasters-themes-<date>.json`). *Importer* accepte ce JSON, collé ou choisi dans un fichier : la liste importée remplace celle de l'éditeur, vérifiée comme une saisie (noms en double, expressions invalides ou trop lentes signalés), et n'est enregistrée qu'avec **Enregistrer**. Un thème par défaut renommé dans la liste importée (« Sports » devenu « Sport ») est reconnu : votre étiquette sera renommée au prochain tri, comme si vous l'aviez renommé vous-même. La couleur de `Doublon` n'est pas exportée.

Les étiquettes WikiMasters suivent **au prochain tri**, toujours précédé d'un aperçu :

- **thème renommé** : son étiquette est renommée, avec ses cartes et vos corrections (le tri automatique des cartes tirées le fait aussi). Si une étiquette porte déjà le nouveau nom, l'ancienne est traitée comme celle d'un thème supprimé ;
- **thème supprimé** : son étiquette reste en place, et ses cartes comptent comme triées, jusqu'au prochain **retri complet**, qui reclasse ces cartes dans vos thèmes et supprime l'étiquette ; l'aperçu et la confirmation l'indiquent. Pour la garder comme étiquette personnelle, cliquez sur *Garder comme étiquette personnelle* dans les réglages : le tri ne la touchera plus ;
- **thème ajouté** ou **mots-clés modifiés** : appliqués aux nouvelles cartes ; lancez un retri complet pour reclasser toute la collection.

Les profils d'intérêts et les familles qui citent un thème par son nom d'origine (« Sports ») le reconnaissent après un renommage. Supprimer *Divers & Homonymies*, *Faune & Flore* ou *Personnalités* envoie dans *Autre* les cartes que ces thèmes recevaient par une règle à part (pages d'homonymie, noms latins sans description, biographies non reconnues). Les thèmes personnalisés restent dans votre navigateur : les scripts Node utilisent toujours la liste par défaut.

### Les raretés

`L` Légendaire · `UR` Ultra Rare · `SR` Super Rare · `R` Rare · `PC` Peu commune · `C` Commune

---

## Réglages

Chaque fonction se coupe indépendamment, dans l'onglet *Réglages* de la Toolbox. Les réglages restent dans votre navigateur.

| Groupe | Fonction | Par défaut |
|---|---|---|
| Cartes | Nouvel affichage des cartes | activée |
| Cartes | Pastille du thème | activée |
| Cartes | Prix du marché | activée |
| Cartes | Lien Wikipédia | activée |
| Cartes | Possédée / manquante | activée |
| Cartes | Images manquantes (requêtes anonymes à Wikimedia) | désactivée |
| Pages du site | Barre Toolbox sur la collection | activée |
| Pages du site | Infos dans la fiche d'une carte | activée |
| Pages du site | Analyse des enchères | activée |
| Pages du site | Enchère dans le titre de l'onglet | activée |
| Pages du site | Bonnes affaires du marché | activée |
| Pages du site | Échanges sur le profil d'un ami | activée |
| Paquets | Récapitulatif après un paquet | activée |
| Paquets | Statistiques de tirage | activée |
| Paquets | Bouton « Tout ouvrir » | activée |
| Paquets | Trier automatiquement les cartes tirées | désactivée |
| Paquets | Proposer de trier après un paquet | activée |
| Échanges | Bilan dans la fenêtre d'échange | activée |
| Échanges | Valeur des échanges | activée |
| Marché | Alerte de fin d'enchère | activée |
| Marché | Page Stonks | activée |
| Succès | Réclamer les succès automatiquement | désactivée |
| Confort | Son de notification | désactivée |

**Trier automatiquement les cartes tirées** : dès l'ouverture d'un paquet, les nouveaux exemplaires reçoivent leur thème, leurs étiquettes « Pour : … » et `Doublon`. Seuls les exemplaires qui viennent d'arriver sont touchés, rien n'est supprimé.

**Réclamer les succès automatiquement** : la récompense de chaque succès débloqué est réclamée sans clic (voir [Succès](#succès)).

**Langue** : l'interface de la Toolbox (panneau, blocs intégrés aux pages, popup, messages) est en français si le navigateur est réglé en français, en anglais sinon. C'est la première langue de la liste du navigateur qui compte, parmi le français et l'anglais (un navigateur réglé « allemand, puis français » affiche le français). Les noms des étiquettes (thèmes, `Doublon`, « Pour : … ») restent ceux de votre liste de thèmes, quelle que soit la langue : un joueur anglophone peut les renommer dans **Thèmes de tri**.

L'onglet règle aussi la **durée de validité d'un prix** (48 heures par défaut), le **nombre de ventes minimum pour un prix fiable** (3) et le **nombre de premières ventes ignorées** pour chaque carte et chaque rareté (1), le **délai de l'alerte de fin d'enchère** (2 minutes), les **thèmes de tri** (voir [Personnaliser les thèmes](#personnaliser-les-thèmes)) et la couleur de `Doublon`, et permet de vider le cache des prix, d'oublier les collections d'amis enregistrées ou de tout réinitialiser.

---

## Sécurité et vie privée

- **Aucune écriture sans clic.** Poser des étiquettes, enchérir, mettre en vente, défausser, ouvrir des paquets : rien ne se fait sans que vous cliquiez, et les actions importantes demandent une confirmation. Seules exceptions, les options que vous activez vous-même : *Trier automatiquement les cartes tirées* et *Réclamer les succès automatiquement*.
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
Le site a demandé une vérification anti-robot ou a renvoyé une erreur (limite d'ouvertures du jour, par exemple). Pour la vérification : ouvrez un paquet avec le bouton *Ouvrir* du site, validez la vérification qu'il affiche, puis relancez *Tout ouvrir*, qui ouvre alors les paquets restants. La Toolbox ne fait jamais cette vérification à votre place.

**Une carte n'a pas d'image, même avec l'option « Images manquantes ».**
Wikimedia n'a aucune image pour cet article (fréquent pour une personne peu connue ou une œuvre récente), c'est une page d'homonymie, le site a masqué son image, ou le sujet est sensible et Wikipédia ne lui donne pas d'image principale. Une recherche sans résultat est refaite au bout d'une semaine, ou dès qu'une mise à jour de la Toolbox ajoute une source d'images.

**Je préfère l'affichage des cartes du site.**
Coupez *Nouvel affichage des cartes* dans les réglages : les cartes reprennent immédiatement leur aspect d'origine.

**Une carte du récapitulatif indique « Défausse à vérifier » ou « Vente à vérifier ».**
Le site n'a pas répondu à temps : l'action a peut-être été faite. Vérifiez dans votre collection ou sur le Marché avant de recommencer ; la Toolbox ne renvoie jamais une défausse ou une vente d'elle-même.

**Une carte affiche « jamais vendue dans cette rareté ».**
Aucune vente conclue n'existe pour cette carte dans cette rareté : il n'y a pas de prix à calculer.

**Un prix est précédé de « ≈ », ou une carte affiche « indicatif ».**
La carte s'est vendue trop peu de fois pour que son prix soit représentatif (3 ventes au minimum par défaut, sa toute première vente n'étant pas comptée). Le prix reste affiché pour information, mais n'entre dans aucun calcul. Le minimum se règle dans l'onglet *Réglages*.

**Le prix de la Toolbox n'est pas celui du site.**
Le site affiche la moyenne des 200 dernières ventes ; la Toolbox, la médiane des 30 dernières, qui résiste aux ventes aberrantes et suit mieux le marché. La moyenne du site reste indiquée dans la fiche de la carte.

**Comment tout effacer ?**
Onglet *Réglages* → *Données*, ou désinstallez l'extension : tout ce qu'elle a enregistré est supprimé avec elle.

**Un problème, une idée ?**
Ouvrez une [issue sur GitHub](https://github.com/LeadOn/Wikimasters-card-sorter/issues).
