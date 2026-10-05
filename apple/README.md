# Kanstrimi — app Apple (Apple TV, iPhone ; iPad à venir)

`kanstrimi.xcodeproj` : **une cible `kanstrimi`, deux destinations** (tvOS 27 et iOS 27), plus l'extension tvOS
`TopShelf`. SwiftUI en français, Swift 6 (isolation `MainActor` par défaut), Swift Testing, **AetherEngine 7.x** en SPM
(FFmpeg démuxe, VideoToolbox décode, le moteur pilote HDR et Dolby Vision). Le fournisseur ne sert pas de HLS : le moteur
lit tout, TS en direct, MKV et MP4 en VOD, sans relais ni AVPlayer d'hôte.

## Structure

| Dossier | Rôle |
|---|---|
| `App/` | Démarrage, `AppEnvironment` (services partagés, navigation), `RootView` (appairage puis onglets, lecteur, liens profonds, hooks de debug), `Preferences`, `DeviceStore` (jeton en Keychain, injectable pour les tests), `DeepLink` (seuls nos identifiants). |
| `Contract/` | Types calqués sur `/player` (`server/src/player/types.ts`). |
| `Client/` | `CatalogClient` : `HTTPCatalogClient` (le serveur), `MockCatalogClient` (fixtures JSON de démo), `SwitchingCatalogClient`. |
| `Player/` | Le lecteur, service transverse unique : `PlayerCore` (moteur, surface, options d'ouverture, partagé avec l'aperçu du Direct `LivePreview`), `PlayerService` (bascules, gels, zapping ; il parle au moteur par la façade `PlaybackEngine`, que les tests remplacent), `PlaybackReporter` (progression et file hors ligne), `PlayerMenus` (panneaux et menus communs aux deux plateformes), `VersionChooser`, `PlayerScreen` (+ `+tvOS`, `+iOS`), `SubtitleOverlay`, Picture-in-Picture. |
| `Features/` | Un dossier par écran, une seule vue pour les deux plateformes. |
| `Shared/` | `Platform.swift` (`Metrics` et modificateurs par plateforme), `Theme`, `CardViews` (images, rangées, grilles, menu d'une affiche), `ChannelViews` (logo, `LoadedChannelCard`, `channelItem`), `Stores`. |
| `Shared/Cards/` | Les cartes (`PosterCard`, `WideCard`, `ChannelCard`, `ProgrammeCard`, `UpNextCard`, `HeroBanner`, `SeeAllCard`, `RetryCard`, `StudioTile`, `CastCell`), un fichier chacune avec ses `#Preview` (données fixes). Composants bêtes : un modèle (`ContentItem` du contrat, `ChannelItem`…) et des actions en entrée, jamais `AppEnvironment` ni `.task` (vérifié par `CardsArchitectureTests`) ; charger, garder l'état, le focus et agir reste à l'écran. Le parent (rangée, grille, colonne) fixe la largeur, souvent depuis `Metrics` ; la carte prend toute celle qu'on lui donne et en tire sa hauteur. |
| `../TopShelf/` | Extension Top Shelf (tvOS seul) : appelle `GET /player/top-shelf`, carrousel plein écran. |
| `../Entitlements/` | Groupe de Keychain partagé par l'app et l'extension. |
| `scripts/` | `shot.sh` / `shot-all.sh` : captures du client de démo dans `ui-review/` (hors git). |
| `../kanstrimiTests/` | Swift Testing : client HTTP, choix de version, progression et file hors ligne, pannes du lecteur (faux moteur `FakePlaybackEngine` : bascule de source, essais, dialogue, coupure), liens. |

## Une vue, deux plateformes

Les vues ne contiennent pas de `#if os(...)`. Ce qui diffère passe par trois niveaux :

1. **`Metrics`** (`@Environment(\.metrics)`) : tailles, marges, colonnes. `Metrics.tv` et `Metrics.phone`, l'iPad sera un
   troisième jeu. `metrics.compact` choisit une disposition tenue en main, sans toucher au rendu tvOS.
2. **Modificateurs de `Platform.swift`** qui cachent une API absente d'une plateforme (`cardButtonStyle`, `onBackCommand`,
   `platformSheet`, `touchContextMenu`…).
3. **Un fichier par plateforme** (`+tvOS.swift`, `+iOS.swift`, entièrement sous `#if os`) seulement là où l'entrée diffère :
   lecteur, Picture-in-Picture, orientation, Top Shelf. Aucune exception de membre dans le groupe synchronisé du projet,
   sauf l'`Info.plist` partiel.

`Platform.isTV` dans une vue ne sert qu'aux capacités (focus, couvertures, télécommande) ; une disposition passe par `metrics.compact`.

`env.open(id)` est l'unique entrée vers une fiche : cover sur tvOS, push dans l'onglet courant sur iPhone. Une saga, un studio, un acteur ou une grille s'ouvre de même par `env.open(route, cover: $cover)` : l'écran qui ouvre garde un `@State cover: Route?` et le modificateur `.routeCover($cover)` (couverture sur tvOS, rien sur iPhone).

## Choix et pièges

- **Une seule connexion au fournisseur** : `maxConcurrentSourceRequests: 1`, et l'aperçu du Direct (son propre
  `PlayerCore`, sonore dès que l'image paraît) est coupé avant toute lecture. Pas d'option du moteur qui ouvrirait une seconde connexion (`confirmAtmos`).
- **ATS** : `NSAllowsArbitraryLoads`, les `stream_url` sont des URL `http://` du fournisseur.
- **Direct** : décodé par le moteur (`preferredDecodePath: .software`), image en 0,6 s contre 6 s par le HLS local
  d'AVPlayer ; jamais de pause, comme une télé. Fenêtre de retour de 30 s (`dvrWindowSeconds`) : seule voie où le moteur
  décode le son à part, sinon une chaîne HE-AAC à 50 i/s (Canal+ Foot) saccade ; le son démarre ~0,8 s plus tard.
- **Pannes** : un seul chemin (`handleStreamFailure`) : source suivante, deux essais, puis le dialogue ; une reprise
  rouvre les liens du fournisseur tels quels (ils n'expirent pas), seul « Réessayer » les redemande au serveur
  (`/playback`, `/channels/{id}`). Seuils dans `PlayerService`.
- **Retour après 10 min d'absence** : l'accueil et le Direct se rechargent (`resumeRevision`). Une action qui échoue
  hors de la vue (Reprendre, lien, marquer vu) le dit par un message commun (`env.attempt`).
- **Sous-titres** : dessinés par l'app (`SubtitleOverlay`), le moteur ne le fait pas ; placés sur le cadre de l'image.
- **Picture-in-Picture (iPhone)** : le lecteur ne se cache qu'une fois l'image dans l'image démarrée, sinon iOS
  l'abandonne ; lancée par iOS au balayage vers l'accueil, elle ne cache rien.
- **Carte « En lecture » (iPhone)** : par `MPNowPlayingInfoCenter` directement, la session du moteur laissant le direct sans carte.
- **Version de départ** (`VersionChooser.start`) : celle mémorisée pour le titre ou la chaîne, sinon la meilleure. La
  lecture, l'aperçu du Direct et le guide affiché s'en servent : TF1 passée en FHD rouvre, s'aperçoit et se guide en FHD.
- **Programme en cours** : une seule règle, `env.nowPlaying(on:)` (guide de la liste, sinon le détail reçu tant que
  le programme dure), portée par `env.channelItem` jusqu'à `ChannelCard` ; `LoadedChannelCard` le demande. Les lignes
  du Direct tvOS ne demandent rien : la colonne de droite montre déjà celui de la chaîne en focus.
- **Guide du direct** : celui de la version lue, ou de départ (`env.guide(of:)`) ; une qualité sans guide prend celui
  de la qualité inférieure la plus proche, sinon supérieure (calculé par le serveur).
- **Chaînes les plus regardées** : `PlayerService` envoie le temps regardé (`POST /playback/{id}/watch-time`) ; l'accueil
  et le Direct se rechargent en quittant le lecteur.
- **Top Shelf** : tvOS n'affiche aucun titre dans le carrousel et l'API publique n'a pas de logo séparé : le serveur dessine
  le logo dans l'image. Jeton et adresse du serveur passent par le Keychain partagé ; Jouer et En savoir plus ouvrent
  `kanstrimi://play/<id>` et `kanstrimi://open/<id>`. L'extension ne partage aucun fichier avec l'app.
- **Éditions** (« Version longue », « Director's Cut ») : une version à part, jamais choisie d'office tant que le
  montage habituel existe ; elle se prend dans le sélecteur, puis la langue de la série la garde.
- **« Si vous avez aimé… »** : « Titres similaires » en bas de la fiche ; dans le lecteur, `PlayerService` demande
  `/playback/{id}/suggestions` 3 s après le démarrage (panneau « Similaires », carte « À suivre » après un film ou le
  dernier épisode). Une série suggérée se lit par `/playback/{série}`, qui renvoie l'épisode où elle reprend.
- **Distribution dans le lecteur** : panneau « Distribution » (film, ou série pour un épisode) tiré de `cast` de
  `/playback`, la même bande que la fiche (`CastStrip`). Choisir un acteur quitte le lecteur (position gardée) pour ses
  titres ; tvOS les montre en couverture (`presentedPerson`), comme une fiche.
- **Récap, intro et générique** : une fois le fichier ouvert, `PlayerService` envoie sa durée et ses chapitres
  (`mediaChapters` du moteur) à `POST /playback/{id}/markers` ; le serveur répond ce qui se passe (`skips` : le récap,
  l'intro, chacun avec le nom de son bouton) et le début du générique, l'app ne décide rien. « Passer le récap » et
  « Passer l'intro » sautent à leur fin : un bouton sur iPhone ; sur tvOS un bouton dessiné, le clic sur la vidéo le
  prend (la surface garde la télécommande). Passé le début du générique, le titre est rapporté vu.
- **Enchaînement** : la carte « À suivre » paraît au début du générique quand le serveur le donne, pour le décompte
  qu'il dit, puis la suite part ; sinon les 15 dernières secondes du fichier se décomptent sur le temps restant (la
  carte atteint 0 à la vraie fin). Puis 1 s de noir et la suite, sa barre affichée. Sans fin du moteur 2 s après 0, la
  suite part quand même ; lecture automatique coupée ou carte annulée : retour à la fiche. Revenir avant le moment de la
  carte la retire.
- **Accueil** : un type de rangée inconnu de l'app s'affiche en rangée simple au lieu de faire échouer l'écran.
- **Carrousel de l'accueil** : les éléments du serveur, un toutes les 8 s, retenu tant que ses boutons ont le focus
  (tvOS), qu'un doigt le touche (iPhone) ou que le sélecteur de version est ouvert. tvOS : deux butées invisibles
  de part et d'autre des boutons tournent le carrousel ; elles ne prennent le focus qu'une fois dans la rangée.
  « Lecture » joue `play_id` (l'épisode pour une série), « Fiche » ouvre la carte.
- **tvOS 27** : la liste poussée par un `Picker` s'ouvre noire ; `ChoiceRow` ouvre un menu à la place. À retester à
  chaque version.
- **iOS 27** : le champ de recherche reste en haut de son écran (avec `role: .search`, il n'apparaît pas), toujours
  affiché (`searchField`) : sinon iOS le cache jusqu'à ce qu'on tire le contenu, et l'écran vide n'a rien à tirer.

## Vérifier

Pas de `Simulator.app` : ni télécommande ni doigt à piloter.

- **À chaque modification**, compiler et tester sur les deux destinations (« Apple TV 4K (3rd generation) » et
  « iPhone 17 Pro », runtimes 27) : outils Xcode (`BuildProject`, `RunAllTests`) ou
  `xcodebuild -scheme kanstrimi -destination 'id=<udid>' test`. Démarrer le simulateur iPhone avant.
- **Simulateur tvOS en arm64 seulement** (`LibDovi`).
- **Écrans** : `#Preview` de `Features/ScreenPreviews.swift` et `Player/PlayerPreviews.swift` ; captures par
  `scripts/shot.sh <écran> <tvos|iphone>`. L'app se pilote par des clés `debug.*` dans `UserDefaults`, listées dans
  `RootView.debugHooks`. Ce qui demande focus ou défilement passe par la visite `ScreenTour` (cible `kanstrimiUITests`).
- **Appareils réels** : `xcodebuild … -destination 'id=<udid>' -allowProvisioningUpdates build`, puis
  `xcrun devicectl device install app` et `device process launch`.

## Défauts constatés sur appareil

- **Retour du PiP d'une chaîne** : un bref éclair de l'image PiP avant la vidéo. Cosmétique.
- **Son perdu sur le direct** sans réaction de l'app (le chien de garde ne voit que la phase du moteur). Si ça se
  reproduit : relever les journaux `AetherEngine` et `dev.crafters.kanstrimi` dans Console.app autour de la coupure.

## À mesurer sur appareil

- Atmos par une barre de son en HDMI.
- Sous-titres en image (PGS) sur Apple TV, film à bandes noires.

## Licence

[PolyForm Strict 1.0.0](../LICENSE.md) — voir le [README principal](../README.md#licence).
