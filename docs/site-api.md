# API de wiki-masters.com (relevée le 12/10/2026)

Routes observées dans le trafic du site et dans son code client. Elles ne sont pas documentées par
le site et peuvent changer sans préavis : l'extension les regroupe dans `extension/src/content/api/`.

## Authentification

- Session `@supabase/ssr` dans les cookies `sb-cyrxjeppjqsxxjayfrur-auth-token.0`, `.1`, … :
  concaténation = `base64-` + JSON de session en base64url (`access_token`, `user.id`).
  Le pseudo est dans `user.user_metadata.username` (et dans les claims du JWT).
- Routes `/api/...` du site : cookies de session (même origine), le header `Bearer` n'est pas accepté.
- Supabase REST (`https://cyrxjeppjqsxxjayfrur.supabase.co/rest/v1/`) : headers `apikey` (clé publique
  « anon », présente dans le code du site) et `Authorization: Bearer <access_token>`. La RLS limite
  `user_cards` au joueur connecté.
- Plusieurs écritures peuvent répondre `{code: "human_verification_required"}` : le site affiche alors
  une vérification Cloudflare Turnstile (`POST /api/human-check {token}`). L'extension s'arrête et
  demande au joueur de faire la vérification sur le site.

## Collection

| Route | Réponse |
|---|---|
| `GET /api/my-collection?sort=rarity&page=N&stats=0[&tag=…][&q=…]` | `{collection: [{id, card_id, count, starred, is_shiny, obtained_at, tags: [...], card: {...}}], pendingTradeCardIds}` (50 / page) |
| `GET /api/my-collection/stats?sort=rarity` | `{total, totalUnique, rarityCounts, tagOptions: [{id, name, color, cardCount}]}` |
| Supabase `user_cards?select=*,cards(*)` | exemplaires du joueur avec la carte complète (résumé compris) |
| Supabase `tags`, `user_card_tags`, `wishlist_items` | étiquettes, associations, liste de souhaits |
| `POST /api/user-cards/{id}/discard` (sans corps, `id` d'un exemplaire `user_cards`) | défausse contre 1 WikiBidou ; réponse JSON, `{error}` si refusée (favori verrouillé, carte engagée dans un échange…). Utilisée par le récapitulatif de paquet et les doublons du Marché |
| `POST /api/user-cards/bulk-discard {card_ids}` | défausse groupée : `{discarded_count, failed}` (non utilisé) |

## Catalogue

| Route | Réponse |
|---|---|
| `GET /api/cards?page=N&sort=…&q=…&rarity=…[&wishlist=1]` | `{cards, total, rarityCounts, friendOwners: {card_id: [{username, rarities}]}, ownedCardIds, wishlistCardIds}` — ~2,8 millions de cartes |

## Amis

| Route | Réponse |
|---|---|
| `GET /api/friends` | `{friendships: [{status, requester: {id, username}, addressee: {...}}]}` |
| `GET /api/profile/{pseudo}` | `{profile, isFriend, …}` |
| `GET /api/profile/{pseudo}/collection?page=N&sort=rarity&stats=0|1&pending=1[&rarity=L…]` | `{collection: [{…, owned_by_viewer}], total, rarityCounts, tagOptions, pendingTradeCardIds}` — 50 / page, souvent lente (jusqu'à 30 s) |

## Marché

| Route | Réponse |
|---|---|
| `GET /api/marketplace?page=1&limit=50&sort=…[&q=…][&rarity=…][&mine=1]` | `{auctions, hasMore}` ; avec `mine=1` : `selling`, `bidding`, `won`, `history` |
| `GET /api/marketplace/mine` | `{sellingCount, maxConcurrentAuctions}` |
| `GET /api/marketplace/{id}` | `{auction, bids}` |
| `POST /api/marketplace {card_id, base_amount, duration_minutes}` | `{auction_id}` — **`card_id` est l'id de l'exemplaire (`user_cards.id`)**, pas celui de la carte (relevé dans le formulaire du site : `userCardId` → `card_id`) ; avec un id de carte, le site répond que la carte n'est pas possédée. Un favori ne peut pas être mis en vente. Durées : 10, 30, 60, 180, 360, 720 |
| `POST /api/marketplace/{id}/bid {amount}` | erreurs : `bid_too_low` (+ `min`), `insufficient_balance`, `human_verification_required` |
| `GET /api/marketplace/cards/{card_id}/sales?scope=summary` | `{summary: {RARETÉ: {average, count, latest}}, isPro}` — moyenne **hors ventes shiny** (vérifié le 14/10/2026). **~12 s par carte**, souvent en 500 : dernier recours seulement |
| Supabase `auctions?status=eq.settled_sold&card_id=in.(…)&select=id,card_id,snapshot_rarity,final_price,settled_at,is_shiny&order=card_id,settled_at.desc,id` | ventes conclues, lisibles directement, **par lots de cartes** (pagination 1 000 lignes, `id` en dernier pour un ordre stable). Autres colonnes utiles : `seller_id`, `winner_id`, `base_amount` (mise de départ). Le résumé du site = par rareté, moyenne arrondie des 200 dernières ventes **non shiny**, nombre, dernière vente ; `core/prices.js` → `summarizeSales` le reproduit et garde en plus les 30 derniers prix (médiane, premières ventes ignorées) et un résumé à part des ventes shiny. Lots pondérés par rareté (`priceBatches`) : un lot de cartes rares trop gros dépasse le délai du serveur (`57014`). |
| Supabase `auctions?select=id,card_id,snapshot_rarity,final_price,settled_at,is_shiny,seller_id,winner_id&status=eq.settled_sold&seller_id=eq.{moi}&order=settled_at.desc,id.asc` (puis `winner_id=eq.{moi}`) | mes ventes, puis mes achats conclus : historique de la page Stonks (pagination 1 000 lignes, dédoublonnée par `id` ; ~4 s chacune). Pas de commission sur les ventes : la notification `marketplace_auction_sold` annonce « vendue pour N wikibidous » avec N = `final_price` (vérifié le 15/10/2026). Statuts : `active`, `settled_sold`, `settled_unsold` |
| `GET /api/marketplace/cards/{card_id}/sales` | historique complet (`pro_required` pour les non-Pro) |
| `GET /api/wikibidous` | `{balance}` |

## Échanges

| Route | Réponse |
|---|---|
| `GET /api/trades[?active=1]` | `{trades: [{id, status, initiator_id, recipient_id, initiator_wikibidous, recipient_wikibidous, items: [{card_id, user_card_id, offered_by, snapshot_rarity, card}]}]}` |
| `POST /api/trades {recipient_id, items: [{user_card_id, card_id, offered_by}], initiator_wikibidous, recipient_wikibidous}` | création |
| `PATCH /api/trades/{id} {action: "accept"|"cancel"|…}` | réponse |

## Paquets

| Route | Réponse |
|---|---|
| Supabase `POST rpc/sync_profile_packs` | profil avec `packs_remaining`, `packs_last_regen_at` (appelé par la page /pulls) |
| `POST /api/packs/open` (sans corps), `/api/packs/pro-daily`, `/api/packs/special` | `{cards: [{…carte, summary, user_card_id}], packs_remaining, owned_copies}` ou `{error, human_verification_required}`. La page révèle les cartes une à une ; le bouton du bas affiche « Encore N cartes » puis « Continuer ». |
| `POST /api/packs/open` trop tôt (relevé le 13/10/2026) | moins de 2 s après l'ouverture précédente : **429** `{error: "Ouverture trop rapide…", rate_limited: true, rate_limit_daily, retry_after: <date ISO>, packs_remaining}` + `Retry-After: 1`, sans consommer de paquet. Une ouverture en série espacée de 2,4 s a reçu un **403** `{human_verification_required: true}` au 2e paquet ; la page affiche alors une vérification Turnstile (`POST /api/human-check {token}`) puis relance l'ouverture. Une fois la vérification faite par le joueur, 7 paquets ont été ouverts à la suite, 2,4 s d'écart, sans nouvelle demande. |

## Interface (pour les badges)

- Une carte affichée : `div` dont la classe contient `glow-<rareté>` (`glow-l`, `glow-ur`, …) et
  `rounded-2xl`, avec le titre dans un `h3`. Pas d'identifiant dans le DOM : la carte est retrouvée
  par son titre dans les réponses observées.
- Menu : `nav a[href="/collection"]`, `/trades`, `/marketplace`, `/pulls`, `/global-collection`, … L'entrée active
  porte la classe `bg-[var(--color-accent)]/10 text-[var(--color-accent)]`. Le contenu des pages défile dans `<main>`
  (pas dans la fenêtre) ; une page met son titre à 24 px du bord et 44 px du haut. Sur mobile, la barre du bas
  (`nav` : Paquets, Collection, Échanges, Marché) a un bouton *Plus* qui rend, dans le même `nav`, les autres
  entrées (Profil… Classement, Paramètres) ; ce menu se ferme sur un appui en dehors.
- Solde de WikiBidous : pastille fixée en haut à droite (38 px de haut).
- Solde de WikiBidous affiché : le site le relit quand `window` reçoit l'événement
  `wikimasters:wikibidous-balance-refresh` (`window.dispatchEvent(new CustomEvent(…))`, ce qu'il fait
  lui-même après une défausse). L'extension l'émet après chaque défausse.
