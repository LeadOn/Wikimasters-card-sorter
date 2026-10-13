# Politique de confidentialité — WikiMasters Toolbox

*Dernière mise à jour : 13 octobre 2026*

WikiMasters Toolbox est une extension de navigateur **non officielle** pour le jeu [WikiMasters](https://www.wiki-masters.com/). Elle n'est ni éditée ni approuvée par WikiMasters. Son code source est public : <https://github.com/LeadOn/Wikimasters-card-sorter>.

## En bref

- Aucune donnée n'est envoyée à l'auteur de l'extension ni à un tiers : pas de serveur, pas de compte, pas de publicité, pas de statistiques d'usage.
- L'extension ne communique qu'avec WikiMasters (son site et sa base de données), pour votre compte, comme le fait le site lui-même.
- Tout ce qu'elle enregistre reste dans votre navigateur.

## Données utilisées

| Donnée | Usage | Où elle va |
|---|---|---|
| **Session WikiMasters** (jeton de connexion lu dans les cookies du site) | Authentifier les requêtes que l'extension fait à WikiMasters pour vous : lire votre collection, vos étiquettes et les prix du marché, poser des étiquettes, mettre en vente, enchérir, défausser une carte ou ouvrir des paquets quand vous cliquez sur le bouton correspondant | Uniquement wiki-masters.com et sa base de données (`cyrxjeppjqsxxjayfrur.supabase.co`). Jamais enregistrée par l'extension |
| **Contenu du site** (cartes, collection, étiquettes, enchères, échanges, collection d'un ami consultée) | Afficher les outils (thèmes, prix, doublons, échanges…) | Gardé en cache dans le stockage local de l'extension, sur votre appareil |
| **Vos réglages**, profils d'intérêts, familles, statistiques de tirage | Fonctionnement de l'extension | Stockage local de l'extension, sur votre appareil |
| **Titre d'une carte sans image** (option « Images manquantes », désactivée par défaut) | Chercher une illustration de l'article | Requêtes anonymes (sans cookie ni référent) aux services de Wikimedia : `fr.wikipedia.org`, `en.wikipedia.org`, `www.wikidata.org` et, pour l'article dans une autre langue, d'autres éditions de Wikipédia (`de.wikipedia.org`, `es.wikipedia.org`…) ; l'image trouvée est chargée depuis Wikimedia Commons |

L'extension ne lit pas votre historique de navigation et n'agit sur aucun autre site que wiki-masters.com.

## Partage

Aucune donnée n'est vendue, partagée ou transmise à des tiers. Les codes de partage (profils, familles) ne sont créés que lorsque vous cliquez sur « Partager », et c'est vous qui les transmettez à qui vous voulez ; ils ne contiennent pas vos possessions.

## Conservation et suppression

Les données restent dans le stockage local du navigateur jusqu'à ce que vous les supprimiez : boutons de l'onglet « Réglages » de la Toolbox (cache des prix, collections d'amis), ou désinstallation de l'extension, qui efface tout.

## Contact

Questions ou problèmes : <https://github.com/LeadOn/Wikimasters-card-sorter/issues>.

---

## Privacy policy (English summary)

WikiMasters Toolbox is an **unofficial** extension for WikiMasters. It has no server and sends nothing to its author or to any third party: no account, no ads, no analytics. It only talks to WikiMasters (wiki-masters.com and its Supabase database), using your existing WikiMasters session to read your collection and market prices and, only when you click, to tag cards, list or bid on auctions, discard a card, or open packs. Settings, caches and your data stay in the extension's local storage on your device until you clear them or uninstall the extension. The optional "missing images" feature (off by default) sends the title of a card without an image to Wikimedia services (Wikipedia, Wikidata), anonymously; the image found is loaded from Wikimedia Commons. Contact: <https://github.com/LeadOn/Wikimasters-card-sorter/issues>.
