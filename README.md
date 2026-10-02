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

## Pistes

Ce qui vient après la V1.2 (tvOS et iPhone), par version, puis les idées non planifiées.

- **V1.3** :
  - **Fond qui suit le focus (tvOS, POC)** : un film qui prend le focus change le fond de l'écran pour son fond TMDB
    flouté, pour éviter les grands aplats noirs. POC sur l'écran Films, branche `poc/fond-focus`, mis de côté.
- Non planifiées :
  - **Écran Films façon Prime Video (tvOS)** : deux rangées de films seulement en bas de l'écran ; le haut est un hero
    (fond, logo ou titre, infos) qui affiche le film en focus et change à chaque déplacement.
  - **Collections thématiques** : dernière rangée d'accueil prévue, par IA validée dans l'admin ou par genres et mots-clés TMDB.
  - **« Si vous avez aimé… »** : titres proches (recommandations TMDB croisées avec le catalogue) dans un panneau de la
    fiche d'un film ou d'une série, et proposés à la fin d'un film ou du dernier épisode connu d'une série.
  - **Notification de la liste d'attente** : une alerte push (APNs) sur l'iPhone, une pastille sur l'Apple TV, quand un film
    attendu arrive. Demande le programme Apple Developer payant.
  - **Vidéo d'aperçu du Top Shelf** : tvOS la joue quand on s'attarde sur un élément du carrousel, mais il lui faut une vidéo
    directe (HLS ou MP4). Les bandes-annonces TMDB sont sur YouTube (pas de lien direct) : à reprendre si une source directe se présente.
