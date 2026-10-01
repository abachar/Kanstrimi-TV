# Kanstrimi — app Apple (Apple TV, iPhone ; iPad à venir)

`kanstrimi.xcodeproj` : **une cible `kanstrimi`, deux destinations** (tvOS 27 et iOS 27), plus l'extension tvOS
`TopShelf`. SwiftUI en français, Swift 6 (isolation `MainActor` par défaut), Swift Testing, **AetherEngine 7.x** en SPM
(FFmpeg démuxe, VideoToolbox décode, le moteur pilote HDR et Dolby Vision). Le fournisseur ne sert pas de HLS : le moteur
lit tout, TS en direct, MKV et MP4 en VOD, sans relais ni AVPlayer d'hôte.

## Structure

| Dossier | Rôle |
|---|---|
| `App/` | Démarrage, `AppEnvironment` (services partagés, navigation), `RootView` (appairage puis onglets, lecteur, liens profonds, hooks de debug), `Preferences`, `DeviceStore` (jeton en Keychain), `DeepLink`. |
| `Contract/` | Types calqués sur `/player` (`server/src/player/types.ts`). |
| `Client/` | `CatalogClient` : `HTTPCatalogClient` (le serveur), `MockCatalogClient` (fixtures JSON de démo), `SwitchingCatalogClient`. |
| `Player/` | Le lecteur, service transverse unique : `PlayerService` (moteur, bascules, gels, zapping), `VersionChooser`, `PlayerScreen` (+ `+tvOS`, `+iOS`), `SubtitleOverlay`, Picture-in-Picture. |
| `Features/` | Un dossier par écran, une seule vue pour les deux plateformes. |
| `Shared/` | `Platform.swift` (`Metrics` et modificateurs par plateforme), `Theme`, `CardViews`, `Stores`. |
| `../TopShelf/` | Extension Top Shelf (tvOS seul) : appelle `GET /player/top-shelf`, carrousel plein écran. |
| `../Entitlements/` | Groupe de Keychain partagé par l'app et l'extension. |
| `scripts/` | `shot.sh` / `shot-all.sh` : captures du client de démo dans `ui-review/` (hors git). |
| `../kanstrimiTests/` | Swift Testing : client HTTP, choix de version, files et liens. |

## Une vue, deux plateformes

Les vues ne contiennent pas de `#if os(...)`. Ce qui diffère passe par trois niveaux :

1. **`Metrics`** (`@Environment(\.metrics)`) : tailles, marges, colonnes. `Metrics.tv` et `Metrics.phone`, l'iPad sera un
   troisième jeu. `metrics.compact` choisit une disposition tenue en main, sans toucher au rendu tvOS.
2. **Modificateurs de `Platform.swift`** qui cachent une API absente d'une plateforme (`cardButtonStyle`, `onBackCommand`,
   `platformSheet`, `touchContextMenu`…).
3. **Un fichier par plateforme** (`+tvOS.swift`, `+iOS.swift`, entièrement sous `#if os`) seulement là où l'entrée diffère :
   lecteur, Picture-in-Picture, orientation, Top Shelf. Aucune exception de membre dans le groupe synchronisé du projet,
   sauf l'`Info.plist` partiel.

`env.open(id)` est l'unique entrée vers une fiche : cover sur tvOS, push dans l'onglet courant sur iPhone.

## Choix et pièges

- **Une seule connexion au fournisseur** : `maxConcurrentSourceRequests: 1`, et l'aperçu du Direct (un second moteur,
  muet) est coupé avant toute lecture. Pas d'option du moteur qui ouvrirait une seconde connexion (`confirmAtmos`).
- **ATS** : `NSAllowsArbitraryLoads`, le `302` du serveur mène à des URL `http://` du fournisseur.
- **Direct** : décodé par le moteur (`preferredDecodePath: .software`), image en 0,6 s contre 6 s par le HLS local
  d'AVPlayer ; jamais de pause, comme une télé.
- **Pannes** : un seul chemin (`handleStreamFailure`) : source suivante, deux essais avec un nouveau jeton, puis le
  dialogue. Seuils dans `PlayerService`.
- **Sous-titres** : dessinés par l'app (`SubtitleOverlay`), le moteur ne le fait pas ; placés sur le cadre de l'image.
- **Picture-in-Picture (iPhone)** : le lecteur ne se cache qu'une fois l'image dans l'image démarrée, sinon iOS
  l'abandonne ; lancée par iOS au balayage vers l'accueil, elle ne cache rien.
- **Carte « En lecture » (iPhone)** : par `MPNowPlayingInfoCenter` directement, la session du moteur laissant le direct sans carte.
- **Version de départ** (`VersionChooser.start`) : celle mémorisée pour le titre ou la chaîne, sinon la meilleure. La
  lecture, l'aperçu du Direct et le guide affiché s'en servent : TF1 passée en FHD rouvre, s'aperçoit et se guide en FHD.
- **Guide du direct** : celui de la version lue, ou de départ (`env.guide(of:)`) ; une qualité sans guide prend celui
  de la qualité inférieure la plus proche, sinon supérieure (calculé par le serveur).
- **Chaînes les plus regardées** : `PlayerService` envoie le temps regardé (`POST /playback/{id}/watch-time`) ; l'accueil
  et le Direct se rechargent en quittant le lecteur.
- **Top Shelf** : tvOS n'affiche aucun titre dans le carrousel et l'API publique n'a pas de logo séparé : le serveur dessine
  le logo dans l'image. Jeton et adresse du serveur passent par le Keychain partagé ; Jouer et En savoir plus ouvrent
  `kanstrimi://play/<id>` et `kanstrimi://open/<id>`. L'extension ne partage aucun fichier avec l'app.
- **Éditions** (« Version longue », « Director's Cut ») : une version à part, jamais choisie d'office tant que le
  montage habituel existe ; elle se prend dans le sélecteur, puis la langue de la série la garde.
- **Accueil** : un type de rangée inconnu de l'app s'affiche en rangée simple au lieu de faire échouer l'écran.
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
