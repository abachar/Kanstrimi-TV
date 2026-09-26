# Kanstrimi

Système de streaming **personnel et mono-utilisateur**. Il se branche sur un fournisseur
**Xtream Codes**, importe son catalogue, le nettoie, l'enrichit via **TMDB**, et le
rediffuse vers des applications de salon.

Principe directeur : **le serveur ne relaie jamais la vidéo**. Il sert des métadonnées et
répond en `302` vers le flux d'origine. La bande passante vidéo ne le traverse pas.

```
Fournisseur Xtream ──► server/ ──► Postgres (catalogue filtré + enrichi)
                          │
                          ├──► API Xtream-compatible ──► TiviMate, IPTV Smarters…
                          ├──► API REST /api/v1       ──► tvOS/
                          └──► 302 ────────────────────► le flux vidéo, en direct
```

## Les deux dossiers

### `server/` — implémenté, en service

Node 22 + Hono + Postgres/Drizzle, admin rendue côté serveur (Hono JSX + HTMX +
Bootstrap 5). Compilé par esbuild en un bundle autonome pour la production.

Il expose une **API Xtream-compatible** (`player_api.php`, `get.php`, `xmltv.php`,
redirections de flux) : n'importe quel player IPTV du marché s'y connecte comme à un vrai
serveur Xtream. Et l'**API REST `/api/v1`** de l'app tvOS (contrat : `docs/api-v1-tvos.md`),
servie depuis les contenus groupés. Le traitement se fait en quatre étapes indépendantes —
lire la source, appliquer les filtres, enrichir via TMDB, grouper les variantes.

👉 **Lire `server/CLAUDE.md` avant toute modification** : conventions, modèle de
sécurité (chiffrement des secrets, coffre en RAM) et pièges.

### `tvOS/` — interface complète en maquette, sur données statiques

`tvOS/kanstrimi.xcodeproj` : SwiftUI, Swift 6 (isolation `MainActor` par défaut), tvOS 27,
Apple TV 4K uniquement, Swift Testing, **VLCKit 4 en SPM** (miroir GitHub `videolan/vlckit`,
révision figée dans le projet). Tous les écrans du flow existent et tournent sur le
simulateur, alimentés par un client mock ; **aucun appel réseau** autre que les trois flux
de démo de `Client/DemoStreams.swift`. L'appairage réel viendra en dernier.

Organisation de `tvOS/kanstrimi/` :

| Dossier | Rôle |
|---|---|
| `Contract/` | Types calqués sur `/api/v1` tel qu'arrêté dans `docs/api-v1-tvos.md` (`Card` unique, `Version`, `Source`, `Season`, `Episode`, `Channel`, `Playback`…), `nonisolated`, jamais sur la base. |
| `Client/` | Protocole `CatalogClient`, `MockCatalogClient` sur les fixtures JSON de `Client/Fixtures/`, `MockScenario` (hors ligne, 401, saison en erreur…) piloté depuis Réglages › Démo. |
| `Player/` | **Le lecteur, service transverse unique** : `PlayerService` (VLCKit, bascule de source, échec après 10 s, épisode suivant, zapping), `VersionChooser` (moteur de choix), écran et panneaux. |
| `Features/` | Un dossier par fonctionnalité : Appairage, Accueil, Catalogue, Fiche, Direct, Recherche, Réglages. |
| `Shared/` | Thème, badges, cartes, formats, stores locaux (chaînes récentes, sources en échec, file de progression, cache de l'accueil, cache EPG). |

Avant de coder, lire dans l'ordre :

- `tvOS/FLOW.md` — **le document de référence** : écrans, gestes, états, et ce que chaque
  écran impose à l'API REST (`/api/v1/...`, servie par `server/`, contrat dans
  `docs/api-v1-tvos.md`).
- `tvOS/ux/` — export du canvas UX (23 artboards en HTML) : source d'inspiration pour la
  mise en page, les couleurs et les textes ; `FLOW.md` cite ses numéros entre crochets.
- `tvOS/ETUDE.md` — contraintes mesurées (VLCKit seul, pas de HLS, MKV, pool amont).
- `tvOS/README.md` — cahier des charges fonctionnel d'origine.

Vérification visuelle : cette installation Xcode 27 n'a pas de `Simulator.app`, donc pas de
télécommande à piloter ; on rend les écrans avec les `#Preview` de
`Features/ScreenPreviews.swift` et `Player/PlayerPreviews.swift` (outil `RenderPreview` du
MCP Xcode), et les tests avec `RunAllTests`. Pour voir le lecteur tourner sans télécommande :
`xcrun simctl spawn <udid> defaults write dev.crafters.kanstrimi debug.autoplay live` (ou un
identifiant de contenu, plus `debug.resumeAt` en secondes), puis lancer et capturer avec
`xcrun simctl io <udid> screenshot`. Les trois URL de démo vivent dans
`Client/DemoStreams.local.json`, hors dépôt (identifiants fournisseur).

## Le cahier des charges est vivant

`docs/cahier-des-charges.md` dit ce que le système doit faire et l'état de chaque exigence
(fait, prévu avec le bloc du backlog, non planifié, abandonné). Le mettre à jour quand une
fonctionnalité aboutit ou qu'une décision change la cible. Les choix techniques d'origine
(Rust + Askama, SQLite, API REST en premier) y sont listés comme abandonnés : ne pas
s'en étonner en lisant `_Old/`.

## Conventions

- **Français** dans l'interface, les messages d'erreur, les journaux et les commits ;
  anglais dans les commentaires de code.
- Les décisions structurantes sont consignées dans `server/CLAUDE.md`, pas ici.
- `_Old/` et les données locales sont hors dépôt.

## Chercher l'inspiration dans `_Old/`

`_Old/` contient les tentatives précédentes du même projet, réduites à leurs sources et
leurs docs (4 Mo ; dépendances, builds et fichiers de secrets supprimés). **Hors dépôt**,
exclu par `.gitignore`, mais présent sur le disque. Aucun n'a de `.git`. Ne rien y
modifier, ne rien y committer — on y lit, on y copie.

| Dossier | Ce qu'on y trouve |
|---|---|
| `_Old/kanstrimi/` | Serveur **TanStack Start + Drizzle** (7 000 lignes, nov. 2025). `server/src/services/sync/cleanNames.ts` extrait les tags langue et qualité et nettoie les titres, calibré sur 283 000 entrées réelles : **la base du groupement des variantes** (bloc 1). Aussi une grammaire nearley de filtres, une API REST tvOS avec suivi de progression (`server/src/routes/api/`). Son `CLAUDE.md` décrit un service Claude qui n'a jamais été écrit. |
| `_Old/Kanstrimi TV/` | App **tvOS Carthage**, la plus récente (12 000 lignes, nov. 2025) : MV + SwiftData, Nuke, lecteurs AVPlayer et VLC avec sélecteurs audio et sous-titres. `Domain/Models/Movies/Movie+Variants.swift` : algorithme de groupement, désactivé parce que trop lent côté client — à faire côté serveur. |
| `_Old/_Kanstrimi TV/` | App **tvOS CocoaPods** (15 000 lignes, oct. 2025) : MVVM par feature, EPG avec préchargement, auto-play, `ARCHITECTURE.md` et `CHANGELOG.md` détaillés. |
| `_Old/kk/` | Squelette **Rust** de 50 lignes, sans intérêt. Vaut par son `README.md` : la spec fonctionnelle dont `server/BACKLOG.md` est tiré (DSL de filtres, import TMDB hors-ligne). |

Les deux apps tvOS parlent **directement à Xtream** ; leur couche réseau est à jeter,
leurs lecteurs, Focus Engine et EPG sont la référence pour `tvOS/`.

Réflexe utile : avant d'implémenter une fonctionnalité listée dans `server/BACKLOG.md`
(groupement des variantes, API REST, collections IA), regarder si une version existe
déjà dans `_Old/`.
