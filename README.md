# Kanstrimi

Système de streaming **personnel et mono-utilisateur**. Il se branche sur **un** fournisseur
Xtream Codes, importe son catalogue, le nettoie, l'enrichit via **TMDB** et le sert à
l'app Apple maison (Apple TV et iPhone, iPad à venir).

Principe directeur : **le serveur ne relaie jamais la vidéo**. Il sert des métadonnées et
répond `302` vers le flux d'origine ; les identifiants du fournisseur ne sortent jamais du serveur.

```
Fournisseur Xtream ──► server/ ──► Postgres (catalogue filtré, enrichi, groupé)
                          │
                          ├──► API REST /player + images ──► apple/
                          └──► 302 ──────────────────────► le flux vidéo, en direct
```

## Composants

| Dossier | Rôle | Pile | Doc |
|---|---|---|---|
| `server/` | Import, filtrage, enrichissement, groupement des variantes, diffusion, admin web | Node 22, Hono, Postgres + Drizzle, Hono JSX + HTMX + Tailwind 4 / Basecoat | [`server/README.md`](server/README.md) |
| `apple/` | Client natif Apple TV 4K et iPhone (iPad à venir), consomme `/player` | SwiftUI, Swift 6, tvOS 27 + iOS 27, AetherEngine 7 (FFmpeg + VideoToolbox), une cible et deux destinations | [`apple/README.md`](apple/README.md) |

Le contrat entre les deux est le code : `server/src/player/types.ts` côté serveur,
`apple/kanstrimi/Contract/` côté app, et les fixtures JSON de `apple/kanstrimi/Client/Fixtures/`.

## Conventions communes

- **Français** dans l'interface, les messages d'erreur, les journaux, les commits et la doc ;
  **anglais** dans les commentaires de code.
- Chaque dossier porte ses décisions structurantes dans son `README.md`.

## Décisions figées

- **Un seul client : l'app Apple** (tvOS et iOS, un seul code). L'API Xtream-compatible pour les players du marché
  (TiviMate, Smarters…) était un prototype ; elle a été retirée le 2026-09-27.
- Pas de multi-utilisateur, pas de multi-fournisseur, un seul mot de passe (admin web et
  compte client IPTV).
- Abandonné : Rust + Askama, SQLite, client Fire TV, AVPlayer côté app Apple (le fournisseur
  ne sert pas de HLS ; AetherEngine lit tout, MKV et TS compris, sans relais).

## Pistes

Ce qui vient après la V1.2 (tvOS et iPhone), par version, puis les idées non planifiées.

- **V1.3** :
  - **Collections thématiques** : dernière rangée d'accueil prévue, par IA validée dans l'admin ou par genres et mots-clés TMDB.
  - **« Si vous avez aimé… »** : titres proches (recommandations TMDB croisées avec le catalogue) dans un panneau de la
    fiche d'un film ou d'une série, et proposés à la fin d'un film ou du dernier épisode connu d'une série.
- Non planifiées :
  - **Vidéo d'aperçu du Top Shelf** : tvOS la joue quand on s'attarde sur un élément du carrousel, mais il lui faut une vidéo
    directe (HLS ou MP4). Les bandes-annonces TMDB sont sur YouTube (pas de lien direct) : à reprendre si une source directe se présente.
  - **Liste d'attente** : ajouter un film pas encore au catalogue (sortie récente, par son titre) et recevoir une notification
    dès qu'il devient disponible, c'est-à-dire qu'une source visible existe.
  - **Fond qui suit le focus (tvOS, POC)** : un film ou une série qui prend le focus change le fond de l'écran pour son
    affiche, pour éviter les grands aplats noirs.
  - **« Director's Cut » / « Extended »** : reconnaître ces mentions dans le nettoyage des noms, pour ne pas gêner le rapprochement TMDB et le regroupement.
