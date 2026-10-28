# Fiche du Chrome Web Store

Textes à copier dans l'onglet **Fiche Play Store / Store listing** du tableau de bord développeur.
Le nom et le résumé viennent du manifeste (`extension/build.mjs`) : ils ne se saisissent pas ici.

| Champ | Valeur |
|---|---|
| Nom (manifeste) | WikiMasters Toolbox |
| Résumé (manifeste, 132 car. max) | Outils non officiels pour WikiMasters : tri des cartes, prix du marché, filtres, échanges, enchères, paquets et familles. |
| Catégorie | Mode de vie › Jeux |
| Langue | Français |
| Icône du store | `extension/static/icons/128.png` (128 × 128, marge de 16 px) |
| Captures d'écran (1280 × 800) | `store/images/capture-1.png` à `capture-5.png` (légendes ci-dessous) |
| Petite vignette promotionnelle (440 × 280) | `store/images/promo-440x280.png` |
| Grande vignette (1400 × 560, facultative) | `store/images/promo-1400x560.png` |
| Site officiel / page d'accueil | https://github.com/LeadOn/Wikimasters-card-sorter |
| URL d'assistance | https://github.com/LeadOn/Wikimasters-card-sorter/issues |

## Captures d'écran

À importer dans cet ordre (la première sert d'aperçu dans les résultats de recherche) :

| Fichier | Montre |
|---|---|
| `capture-1.png` | La page Collection : nouvel affichage des cartes et barre Toolbox |
| `capture-2.png` | Les filtres de toute la collection (ici les cartes en GIF), avec vente et défausse sur place |
| `capture-3.png` | Le panneau Toolbox, onglet Prix : valeur de la collection et cartes les plus chères |
| `capture-4.png` | La fiche d'une carte : nouvel affichage et bloc Toolbox (prix du marché, thème, familles) |
| `capture-5.png` | Le panneau Toolbox, onglet Tri : aperçu avant application |

## Description détaillée

```
Extension non officielle, faite par des joueurs pour des joueurs. Elle n'est ni éditée ni approuvée par WikiMasters.

WikiMasters Toolbox ajoute à wiki-masters.com les outils qui manquent pour gérer une grosse collection : directement dans les pages du site, et dans un panneau « Toolbox » ouvert depuis le menu. L'interface s'adapte aussi aux petits écrans.

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

VOS DONNÉES
• Tout reste dans votre navigateur : aucun serveur, aucun compte, aucune publicité, aucune statistique d'usage.
• L'extension utilise votre session WikiMasters pour lire votre collection et les prix, uniquement auprès de WikiMasters.
• Rien n'est écrit sur votre compte sans un clic de votre part.
• Chaque fonction se désactive dans les réglages.

Guide complet, code source et politique de confidentialité : https://github.com/LeadOn/Wikimasters-card-sorter
```
