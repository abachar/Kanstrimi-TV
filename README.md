# Kanstrimi

Système de streaming **personnel et mono-utilisateur**. Il se branche sur **un** fournisseur
Xtream Codes, importe son catalogue, le nettoie, l'enrichit via **TMDB** et le sert à
l'app Apple maison (Apple TV et iPhone, iPad à venir).

Principe directeur : **le serveur ne relaie jamais la vidéo**. Il sert des métadonnées et
répond `302` vers le flux d'origine. Ce `302` porte les identifiants du fournisseur (dans son `Location`) :
les liens de lecture sont signés par appareil et ne valent qu'un quart d'heure.

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

Le contrat entre les deux est le code : `server/src/player/types.ts` côté serveur, `apple/kanstrimi/Contract/` côté
app. De vraies réponses du serveur (`apple/kanstrimiTests/Contract/`) le vérifient des deux côtés : le serveur échoue si
leur forme change, l'app si elle ne les décode plus. Les fixtures de `apple/kanstrimi/Client/Fixtures/` ne servent
qu'au client de démo.

## Conventions communes

- **Français** dans l'interface, les messages d'erreur, les journaux, les commits et la doc ;
  **anglais** dans les commentaires de code.
- Chaque dossier porte ses décisions structurantes dans son `README.md`.
- **Une seule version** pour l'app et le serveur : `MARKETING_VERSION` de toutes les cibles Apple (extension Top Shelf
  comprise) et `version` de `server/package.json` (que l'app affiche dans ses réglages) avancent ensemble.

## Pistes

Ce qui vient après la V1.4 (tvOS et iPhone), par version, puis les idées non planifiées.

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
