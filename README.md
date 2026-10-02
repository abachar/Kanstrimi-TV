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
- **Une seule version** pour l'app et le serveur : `MARKETING_VERSION` de toutes les cibles Apple (extension Top Shelf
  comprise) et `version` de `server/package.json` (que l'app affiche dans ses réglages) avancent ensemble.

## Pistes

Ce qui vient après la V1.3 (tvOS et iPhone), par version, puis les idées non planifiées.

- **V1.4 « Si vous avez aimé… »** : des titres proches tirés des recommandations TMDB, croisées avec le catalogue visible.
  - **Données** : table `tmdb_recommendations` (type, id TMDB, ids recommandés dans l'ordre, date), remplie à la demande
    par un appel `/recommendations` et valable 7 jours. Le croisement avec le catalogue se fait à chaque lecture, le
    pipeline ne change pas.
  - **Fiche** d'un film ou d'une série : une rangée de posters, 20 titres au plus, récupérée à l'ouverture.
  - **Lecteur** : un panneau de 5 suggestions détaillées (titre, année, durée, résumé) ; une sélection lance la lecture.
  - **Fin d'un film** : la carte « À suivre » propose le film suivant de la saga s'il est sorti après, sinon la première
    recommandation, avec compte à rebours et démarrage automatique, comme pour un épisode.
  - **Enchaînement** (films et épisodes) : un compte à rebours de 10 s qui se termine à la fin réelle du fichier, pour ne
    couper ni le générique ni une scène finale, puis 1 s d'écran noir pour marquer la transition. La suite démarre avec
    la barre de progression affichée, qui montre son titre, puis la barre se masque comme d'habitude. Lecture
    automatique coupée ou rien à suivre : la fin du fichier ramène à la fiche, comme aujourd'hui.
  - **Fin d'une série** : l'épisode suivant comme aujourd'hui ; après le dernier épisode connu, une autre série, lancée sur
    son premier épisode.
  - **Accueil** : une rangée « Recommandé pour vous », films et séries mélangés, tirée des 30 derniers titres regardés et de
    Ma liste, placée avant « Nouveautés ». Sans historique, pas de rangée.
  - **Exclusions** : un titre vu n'est jamais proposé ; la fin de lecture écarte aussi les titres en cours, l'accueil
    écarte aussi Ma liste.
  - **Réglage** : « Épisode suivant automatique » devient « Lecture automatique de la suite » et vaut pour les films.
- Non planifiées :
  - **Fond qui suit le focus (tvOS, POC)** : un film qui prend le focus change le fond de l'écran pour son fond TMDB
    flouté, pour éviter les grands aplats noirs. POC sur l'écran Films, branche `poc/fond-focus`, mis de côté.
  - **Écran Films façon Prime Video (tvOS)** : deux rangées de films seulement en bas de l'écran ; le haut est un hero
    (fond, logo ou titre, infos) qui affiche le film en focus et change à chaque déplacement.
  - **Collections thématiques** : dernière rangée d'accueil prévue, par IA validée dans l'admin ou par genres et mots-clés TMDB.
  - **Proposition dès le générique de fin** : lancer la carte « À suivre » au début du générique plutôt qu'à la fin du
    fichier. Demande de détecter ce début (chapitres MKV à mesurer sur appareil, rien aujourd'hui).
  - **Notification de la liste d'attente** : une alerte push (APNs) sur l'iPhone, une pastille sur l'Apple TV, quand un film
    attendu arrive. Demande le programme Apple Developer payant.
