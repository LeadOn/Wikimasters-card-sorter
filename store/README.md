# Publier WikiMasters Toolbox sur le Chrome Web Store

Tout ce que le tableau de bord demande est dans ce dossier :

| Fichier | Contenu |
|---|---|
| `fiche.md` | Textes de la fiche (description, catégorie, liens) |
| `confidentialite.md` | Réponses de l'onglet « Pratiques de confidentialité » |
| `../PRIVACY.md` | Politique de confidentialité (URL publique une fois poussée sur GitHub) |
| `images/capture-*.png` | Captures d'écran 1280 × 800 (pseudos des autres joueurs masqués) |
| `images/promo-440x280.png` | Petite vignette promotionnelle (obligatoire) |
| `images/promo-1400x560.png` | Grande vignette (facultative) |
| `promo.html` | Gabarit des vignettes (`promo.html?large` pour la grande) |

## Première publication

1. **Pousser le dépôt** (`git push`) : l'URL de `PRIVACY.md` doit être en ligne avant la soumission.
2. **Construire le paquet** : `npm run package` → `dist/wikimasters-toolbox-chrome-<version>.zip`.
3. **Compte développeur** (<https://chrome.google.com/webstore/devconsole>) : validation en deux étapes
   activée, adresse e-mail de contact vérifiée (onglet *Compte*), et déclaration de **non-commerçant**
   (projet non commercial, obligation européenne).
4. **Nouvel élément** → importer le `.zip`.
5. **Fiche** : copier `fiche.md` ; importer les captures et la vignette 440 × 280.
6. **Pratiques de confidentialité** : copier `confidentialite.md`.
7. **Distribution** :
   - *Non répertorié* pour commencer : seules les personnes qui ont le lien peuvent l'installer
     (idéal pour la bande) ; la visibilité peut passer en *Public* plus tard ;
   - tous les pays, gratuit.
8. **Envoyer pour examen**. Comptez de quelques heures à quelques jours ; l'e-mail de contact reçoit la
   décision, et l'extension est publiée dès son acceptation (sauf si vous avez choisi de publier
   vous-même après l'examen).

## Mises à jour

1. Augmenter `version` dans `package.json` (le Web Store refuse un numéro déjà publié).
2. `npm test && npm run package`.
3. Tableau de bord → l'élément → *Paquet* → *Importer un nouveau paquet* → *Envoyer pour examen*.
4. Si l'extension demande de nouvelles autorisations ou utilise de nouvelles données, mettre à jour
   `confidentialite.md`, `PRIVACY.md` et l'onglet correspondant **avant** l'envoi : les utilisateurs
   devront accepter les nouvelles autorisations.

## Causes fréquentes de refus (déjà traitées)

- **Autorisations superflues** : Chrome ne demande que l'accès à wiki-masters.com (Supabase et
  Wikipédia répondent aux requêtes du site sans autorisation d'hôte).
- **Code distant ou obfusqué** : tout est dans le paquet, minifié mais lisible ; pas d'`eval`.
- **Données non déclarées** : session et contenu du site déclarés, politique de confidentialité en ligne.
- **Marque d'un tiers** : le nom contient « WikiMasters » ; la description et la vignette précisent
  « non officielle », et l'icône n'utilise pas le logo du site.
