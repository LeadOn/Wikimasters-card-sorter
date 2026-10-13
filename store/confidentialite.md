# Onglet « Pratiques de confidentialité » du Chrome Web Store

Réponses à copier dans l'onglet **Privacy practices / Pratiques de confidentialité**. Elles doivent
rester exactes : si l'extension se met à envoyer des données ailleurs, il faut mettre à jour cet
onglet et `PRIVACY.md` avant de publier la nouvelle version.

## Objectif unique

```
Compléter le jeu WikiMasters (wiki-masters.com) avec des outils de gestion de collection : classement des cartes en étiquettes, doublons, prix du marché, échanges entre amis, suivi des enchères et des paquets. L'extension n'agit que sur wiki-masters.com.
```

## Justification des autorisations

**storage**
```
Enregistrer sur l'appareil les réglages, les profils d'intérêts, les familles de cartes et les caches (prix de vente, collections d'amis), pour ne pas les redemander au site à chaque visite.
```

**unlimitedStorage**
```
Le cache des collections d'amis (jusqu'à plusieurs dizaines de milliers de cartes chacune) et celui des prix de vente dépassent la limite de 10 Mo de chrome.storage.local. Ces données restent sur l'appareil et peuvent être effacées depuis les réglages de l'extension.
```

**Autorisation d'hôte (https://www.wiki-masters.com/\*, https://wiki-masters.com/\*)**
```
L'extension ne fonctionne que sur wiki-masters.com : elle y ajoute ses outils (entrée de menu, badges sur les cartes, blocs dans les pages) et lit les réponses que le site reçoit déjà pour savoir quelles cartes sont affichées. Elle n'a accès à aucun autre site.
```

## Code distant

**Non, je n'utilise pas de code distant.** Tout le JavaScript est inclus dans le paquet (aucun
`eval`, aucun script chargé depuis un serveur).

## Utilisation des données

Cocher :

- [x] **Informations d'authentification** — le jeton de session WikiMasters est lu dans les cookies
  du site pour authentifier les requêtes de l'extension auprès de WikiMasters ; il n'est ni enregistré
  ni transmis à un tiers.
- [x] **Contenu du site Web** — cartes, collection, étiquettes, enchères lues sur WikiMasters et gardées
  en cache sur l'appareil.

Ne pas cocher les autres types (informations personnelles, santé, finances, communications,
localisation, historique Web, activité de l'utilisateur).

Cocher les trois déclarations :

- [x] Je ne vends ni ne transfère les données des utilisateurs à des tiers, en dehors des cas d'utilisation approuvés.
- [x] Je n'utilise ni ne transfère les données des utilisateurs à des fins sans rapport avec l'objectif unique de mon article.
- [x] Je n'utilise ni ne transfère les données des utilisateurs pour déterminer leur solvabilité ou pour accorder des prêts.

## URL des règles de confidentialité

```
https://github.com/LeadOn/Wikimasters-card-sorter/blob/main/PRIVACY.md
```

(Valable une fois `PRIVACY.md` poussé sur la branche `main` du dépôt public.)
