# Fiche du Chrome Web Store

Textes à copier dans l'onglet **Fiche Play Store / Store listing** du tableau de bord développeur, une
fois par langue (anglais par défaut, puis français : voir « Fiche multilingue » dans `README.md`).
Le nom et le résumé viennent du manifeste (`extension/build.mjs`, `_locales`) : ils ne se saisissent pas ici.

| Champ | Valeur |
|---|---|
| Nom (manifeste) | WikiMasters Toolbox |
| Résumé anglais (`_locales/en`, 132 car. max) | Unofficial tools for WikiMasters: card sorting, market prices, filters, trades, auctions, packs, families and achievements. |
| Résumé français (`_locales/fr`) | Outils non officiels pour WikiMasters : tri des cartes, prix du marché, filtres, échanges, enchères, paquets, familles et succès. |
| Catégorie | Mode de vie › Jeux |
| Langues | Anglais (par défaut, `default_locale`) et français |
| Icône du store | `extension/static/icons/128.png` (128 × 128, marge de 16 px) |
| Captures d'écran (1280 × 800) | `store/images/capture-1.png` à `capture-5.png` (légendes ci-dessous) |
| Petite vignette promotionnelle (440 × 280) | `store/images/promo-440x280.png` |
| Grande vignette (1400 × 560, facultative) | `store/images/promo-1400x560.png` |
| Site officiel / page d'accueil | https://github.com/LeadOn/Wikimasters-card-sorter |
| URL d'assistance | https://github.com/LeadOn/Wikimasters-card-sorter/issues |

## Captures d'écran

Les captures actuelles montrent l'interface en français. La fiche anglaise peut les reprendre en attendant
des captures en anglais (même procédure, interface passée en anglais : voir `README.md`).

À importer dans cet ordre (la première sert d'aperçu dans les résultats de recherche) :

| Fichier | Montre |
|---|---|
| `capture-1.png` | La page Collection : nouvel affichage des cartes et barre Toolbox |
| `capture-2.png` | Les filtres de toute la collection (ici les cartes en GIF), avec vente et défausse sur place |
| `capture-3.png` | Le panneau Toolbox, onglet Prix : valeur de la collection et cartes les plus chères |
| `capture-4.png` | La fiche d'une carte : nouvel affichage et bloc Toolbox (prix du marché, thème, familles) |
| `capture-5.png` | Le panneau Toolbox, onglet Tri : aperçu avant application |

## Description détaillée (français)

```
Extension non officielle, faite par des joueurs pour des joueurs. Elle n'est ni éditée ni approuvée par WikiMasters.

WikiMasters Toolbox ajoute à wiki-masters.com les outils qui manquent pour gérer une grosse collection : directement dans les pages du site, et dans un panneau « Toolbox » ouvert depuis le menu. L'interface est en français ou en anglais selon votre navigateur, et s'adapte aux petits écrans.

UN NOUVEL AFFICHAGE DES CARTES
• L'image occupe toute la carte, encadrée aux couleurs de sa rareté ; titre, étiquettes et statistiques passent en surimpression.
• Sur chaque carte : prix du marché, thème, carte déjà possédée ou nouvelle, lien vers l'article Wikipédia.
• En option : les cartes sans image en reçoivent une, cherchée sur Wikimedia (Wikipédia, Wikidata). Une image masquée par le site n'est jamais remplacée.

TRI AUTOMATIQUE
• Un thème par carte (Histoire, Sciences, Sports, Pop-Culture…), déduit de la description Wikipédia et posé en étiquette WikiMasters.
• « Trier les nouvelles cartes » depuis la page Collection : aperçu, puis application en un clic. Vos corrections et vos étiquettes personnelles ne sont jamais modifiées.
• Étiquette « Doublon » sur les cartes possédées en plusieurs exemplaires, et « Pour : pseudo » sur celles qui intéressent un ami.
• En option : tri des cartes dès l'ouverture d'un paquet.

FILTRES DE TOUTE LA COLLECTION
• Doublons, cartes sans image, GIF : des critères cumulables, sur toute la collection et pas seulement la page affichée.
• Par vente : cartes jamais vendues, ou vendues entre X et Y ₩.
• Par mots-clés à inclure ou à exclure, par rareté et par thème.
• Les cartes trouvées se mettent aux enchères ou se défaussent une à une ou en lot.

PRIX ET MARCHÉ
• Prix du marché de chaque carte dans sa rareté : médiane des dernières ventes, prix à part pour les shiny, « ≈ » quand la carte s'est trop peu vendue.
• Sur la page d'une enchère : écart entre la mise et le prix du marché.
• Le titre de l'onglet d'une enchère affiche le temps restant et si vous êtes en tête (✓) ou surenchéri (✗), et clignote quand quelqu'un surenchérit : surveillez l'enchère depuis un autre onglet.
• Pastilles « bonne affaire » et « trop cher » sur le marché.
• Valeur de votre collection et vos cartes les plus chères.
• Suivi de vos enchères, surenchère en un clic (avec confirmation), alerte avant la fin.

STONKS : VOTRE HISTORIQUE DE TRADING
• Une page « Stonks » dans le menu du site : vos achats et ventes aux enchères, par jour, semaine ou mois.
• Plus-value de l'achat-revente : chaque vente est rapprochée de son achat, avec le rendement, la part des reventes gagnantes et la durée de détention.
• Vue « Achat-revente » pour n'afficher que les cartes achetées puis revendues ; ou tout l'historique, avec le flux net et la plus-value latente des cartes achetées encore en stock.
• Historique seulement : aucune action d'achat ou de vente depuis cette page.

ÉCHANGES
• Profils d'intérêts : décrivez ce que vous collectionnez, vos amis importent votre profil avec un code.
• Sur le profil d'un ami : ses cartes qui vous intéressent, les vôtres qui l'intéressent, et une proposition équilibrée en prix du marché.
• Valeur de chaque côté des échanges en cours.

PAQUETS
• Récapitulatif après chaque paquet : nouveautés, doublons, prix de chaque carte, valeur totale.
• Vente ou défausse sur place, carte par carte ou en lot ; « Ouvrir le prochain » pour enchaîner.
• Taux de drop par rareté.
• « Tout ouvrir » : seulement sur votre clic, après confirmation. Aucune ouverture automatique.

FAMILLES
• Groupes de cartes à compléter, choisies une à une ou remplies par une recherche, avec les cartes manquantes en vente. Partageables par code.

SUCCÈS
• Tous vos succès, leur progression (ex. 10 081 / 30 000 cartes) et leurs récompenses en WikiBidous.
• « Tout réclamer » : toutes les récompenses disponibles en un clic.
• En option : réclamation automatique dès qu'un succès est débloqué.

VOS DONNÉES
• Tout reste dans votre navigateur : aucun serveur, aucun compte, aucune publicité, aucune statistique d'usage.
• L'extension utilise votre session WikiMasters pour lire votre collection et les prix, uniquement auprès de WikiMasters.
• Rien n'est écrit sur votre compte sans un clic de votre part, sauf les options automatiques que vous activez vous-même (tri des cartes tirées, réclamation des succès).
• Chaque fonction se désactive dans les réglages.

Guide complet, code source et politique de confidentialité : https://github.com/LeadOn/Wikimasters-card-sorter
```

## Captions (English)

| File | Shows |
|---|---|
| `capture-1.png` | The Collection page: new card layout and Toolbox bar |
| `capture-2.png` | Filters across the whole collection (here, GIF cards), with selling and discarding in place |
| `capture-3.png` | The Toolbox panel, Prices tab: collection value and most valuable cards |
| `capture-4.png` | A card's detail window: new layout and Toolbox block (market price, theme, families) |
| `capture-5.png` | The Toolbox panel, Sort tab: preview before applying |

## Detailed description (English)

```
Unofficial extension, made by players for players. It is not published or endorsed by WikiMasters.

WikiMasters Toolbox adds to wiki-masters.com the tools you need to manage a big collection: right inside the site's pages, and in a "Toolbox" panel opened from the menu. The interface is in English or French depending on your browser, and adapts to small screens.

A NEW CARD LAYOUT
• The image fills the whole card, framed in its rarity's colors; title, tags and stats are overlaid.
• On every card: market price, theme, already owned or new, link to the Wikipedia article.
• Optional: cards without an image get one, looked up on Wikimedia (Wikipedia, Wikidata). An image hidden by the site is never replaced.

AUTOMATIC SORTING
• One theme per card (history, science, sports, pop culture…), deduced from the Wikipedia description and stored as a WikiMasters tag. Theme names can be renamed in the settings.
• "Sort new cards" from the Collection page: preview, then apply in one click. Your fixes and your own tags are never changed.
• A "Doublon" tag on cards you own more than once, and "Pour : name" on cards a friend would like.
• Optional: sort cards as soon as a pack is opened.

FILTERS ACROSS YOUR WHOLE COLLECTION
• Duplicates, cards without an image, GIFs: combinable criteria, across the whole collection, not just the page shown.
• By sales: cards never sold, or sold between X and Y ₩.
• By keywords to include or exclude, by rarity and by theme.
• Matching cards can be put up for auction or discarded one by one or in bulk.

PRICES AND MARKET
• Market price of each card in its rarity: median of recent sales, separate prices for shiny cards, "≈" when a card has sold too rarely.
• On an auction page: gap between the bid and the market price.
• An auction's tab title shows the time left and whether you lead (✓) or were outbid (✗), and flashes when someone outbids you: keep an eye on it from another tab.
• "Good deal" and "overpriced" badges on the market.
• Your collection's value and your most valuable cards.
• Your auctions at a glance, one-click outbid (with confirmation), alert before the end.

STONKS: YOUR TRADING HISTORY
• A "Stonks" page in the site menu: your auction purchases and sales, by day, week or month.
• Resale profit: each sale is matched with its purchase, with the return, the share of winning resales and the holding time.
• A "Resales" view showing only cards bought then resold; or the full history, with net cash flow and the unrealized profit of cards you bought and still hold.
• History only: nothing can be bought or sold from this page.

TRADES
• Interest profiles: describe what you collect, and friends import your profile with a code.
• On a friend's profile: their cards you want, your cards they want, and a balanced offer at market prices.
• Value of each side of your pending trades.

PACKS
• A recap after each pack: new cards, duplicates, price of each card, total value.
• Sell or discard in place, card by card or in bulk; "Open next" to keep going.
• Drop rates by rarity.
• "Open all": only on your click, after confirmation. Packs are never opened automatically.

FAMILIES
• Sets of cards to complete, hand-picked or filled from a search, with missing cards on sale. Shareable by code.

ACHIEVEMENTS
• All your achievements, their progress (e.g. 10,081 / 30,000 cards) and their WikiBidou rewards.
• "Claim all": every available reward in one click.
• Optional: claim automatically as soon as an achievement is unlocked.

YOUR DATA
• Everything stays in your browser: no server, no account, no ads, no usage statistics.
• The extension uses your WikiMasters session to read your collection and prices, only from WikiMasters.
• Nothing is written to your account without a click from you, except the automatic options you turn on yourself (sorting pulled cards, claiming achievements).
• Every feature can be turned off in the settings.

Full guide (in French), source code and privacy policy: https://github.com/LeadOn/Wikimasters-card-sorter
```
