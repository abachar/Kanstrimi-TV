# Kanstrimi — app Apple (Apple TV, iPhone ; iPad à venir)

`kanstrimi.xcodeproj` : **une cible `kanstrimi`, deux destinations** (tvOS 27 et iOS 27,
`TARGETED_DEVICE_FAMILY = 1,3` ; l'iPad ajoutera `2`). SwiftUI, Swift 6 (isolation `MainActor`
par défaut), Swift Testing, **VLCKit 4 en SPM** (miroir GitHub `videolan/vlckit`, révision figée
dans le projet ; le xcframework couvre iOS et tvOS). Le fournisseur ne sert pas de HLS : VLCKit lit
tout (TS en direct, MKV et MP4 en VOD), AVPlayer est écarté.

## Structure

| Dossier | Rôle |
|---|---|
| `App/` | `KanstrimiApp` (le seul `#if` hors des fichiers dédiés : l'adaptateur `AppDelegate` d'iOS), `AppEnvironment` (services partagés, onglet courant, piles de navigation), `Navigation.swift` (`MainTab`, `Route`, covers tvOS, chrome iOS), `RootView` (appairage puis onglets, cover du lecteur, hooks de debug), `Preferences`, `DeviceStore` (jeton en Keychain), `OrientationLock+iOS` (paysage forcé du lecteur). |
| `Contract/` | Types calqués sur `/player` (`server/src/player/types.ts`) : `Card` unique, `Version`, `Source`, `Season`, `Episode`, `Channel`, `Playback`… `nonisolated`, jamais sur la base. |
| `Client/` | Protocole `CatalogClient` ; `HTTPCatalogClient` (le serveur, URL compilée dans `Preferences.compiledServerURL`, jeton d'appareil en Keychain, erreurs mappées sur `CatalogError`) ; `MockCatalogClient` sur les fixtures JSON de `Client/Fixtures/` et ses `MockScenario` ; `SwitchingCatalogClient` bascule entre les deux. |
| `Player/` | Le lecteur, service transverse unique : `PlayerService` (VLCKit, bascule de source, échec après 10 s, épisode suivant, zapping), `VersionChooser` (langue × qualité × capacités de l'appareil), `PlayerScreen` (état, overlays et panneaux communs) avec `PlayerScreen+tvOS` (télécommande, `PressCatcher`) et `PlayerScreen+iOS` (gestes, contrôles tactiles, PiP), `PlayerDrawable+tvOS` / `+iOS` (la surface vidéo ; celle d'iOS porte le Picture-in-Picture). |
| `Features/` | Un dossier par écran : Appairage, Accueil, Catalogue, Fiche, Direct, Recherche, Réglages. Une seule vue par écran pour les deux plateformes. |
| `Shared/` | `Platform.swift` (**`Metrics` et les modificateurs par plateforme**), `Theme` (couleurs, badges, panneaux d'état), `CardViews`, `Stores` (chaînes récentes, sources en échec, file de progression, caches). |
| `../kanstrimiTests/` | Swift Testing : client HTTP (serveur simulé), moteur de choix (dont le plafond FHD de l'iPhone), curseur et file de progression. Lancés sur les deux destinations. |

## Une vue, deux plateformes

Les vues ne contiennent pas de `#if os(...)`. Ce qui diffère passe par trois niveaux, du plus
partagé au plus spécifique :

1. **`Metrics`** (`Shared/Platform.swift`, `@Environment(\.metrics)`) : marges, largeurs d'affiche,
   tailles de titres, colonnes de grille, hauteurs de panneaux… `Metrics.tv` et `Metrics.phone` ;
   l'iPad sera un troisième jeu de valeurs. Une vue écrit `metrics.posterWidth`, jamais `250`.
   Les dispositions changent avec `ViewThatFits`, `LazyVGrid(.adaptive)` ou un `ScrollView(.horizontal)`
   qui fait défiler ce qui ne tient pas plutôt que de casser les libellés.
2. **Modificateurs qui cachent une API absente d'une plateforme**, tous dans `Platform.swift` :
   `cardButtonStyle()` (`.card` sur tvOS, retour tactile sur iOS), `prominentButtonStyle()` (libellé
   sombre sur iOS, la teinte de l'app étant blanche), `onBackCommand` (`onExitCommand` sur tvOS,
   rien sur iOS), `platformSheet` (cover sur tvOS, feuille sur iOS), `playerChromeInsets()`,
   `touchActivity()`. `Platform.isTV` et `Platform.deviceKind` servent aux rares présences ou
   absences d'un contrôle (bouton Fermer d'une feuille, QR code) et aux textes qui nomment l'appareil.
3. **Un fichier par plateforme** seulement là où l'entrée diffère vraiment : suffixe `+tvOS.swift`
   ou `+iOS.swift`, le fichier entier sous `#if os(...)`. Le lecteur (télécommande contre gestes),
   la surface vidéo (PiP), l'orientation. Aucune exception de membre dans le groupe synchronisé
   du projet, sauf l'`Info.plist` partiel (`UIBackgroundModes` pour le PiP) que Xcode exclut des
   ressources.

**Navigation** : `env.open(id)` est l'unique point d'entrée vers une fiche. Sur tvOS c'est un
`fullScreenCover` au-dessus des onglets ; sur iOS un push dans la `NavigationStack` de l'onglet
courant (`AppEnvironment.paths`, `Route`). La grille d'un genre suit la même règle. Le lecteur est
un `fullScreenCover` depuis la racine sur les deux. L'iPhone garde cinq onglets : Réglages se
rejoint par la roue dentée de l'accueil.

**Lecteur iPhone** : paysage forcé pendant la lecture (`AppDelegate.orientations` +
`requestGeometryUpdate`), tap = contrôles, double tap gauche/droite = ±10 s, glisser horizontal =
recherche, glisser vertical en direct = zapping, appui long = panneau. Picture-in-Picture par le
drawable `PiPVideoView` conforme à `VLCPictureInPictureDrawable` : VLCKit rend un
`VLCPictureInPictureWindowControlling` quand sa sortie vidéo le permet, `PlayerService.isMinimized`
cache l'écran sans arrêter la lecture. `Capabilities.iPhone` plafonne à la Full HD.

## Fonctionnement

- **Appairage** : l'app demande un code à `POST /devices` et sonde `GET /devices/{code}` jusqu'à
  l'approbation, jeton en Keychain. L'Apple TV affiche un QR vers `/admin/pair/{code}` ; l'iPhone
  affiche un lien « Ouvrir l'admin » (Safari), la validation se fait sur le même téléphone. Un `401`
  n'importe où dissocie l'appareil et ramène à l'appairage.
- **Lecture** : `stream_url` est un lien signé vers le serveur, relu à chaque lecture ; le
  serveur répond `302` vers le fournisseur. Le choix de la version suit l'ordre de langues
  des Réglages, les préférences par titre, les capacités de l'appareil, et bascule de source après échec.
- Réglages › Appareil › « Client de démonstration » passe sur le mock sans relancer ; les
  `#Preview` et les scénarios de démo forcent le mock. Ses flux (`demo://…`) ne se lisent pas :
  la lecture se teste contre le serveur, local ou de prod.

## Vérifier

Pas de `Simulator.app` sur cette installation Xcode 27, donc ni télécommande ni doigt à piloter ;
les deux destinations se vérifient quand même, à chaque modification.

- Compiler et tester sur les deux : `BuildProject` puis `RunAllTests` après `XcodeSwitchRunDestination`
  (« Apple TV 4K (3rd generation) » puis « iPhone 17 Pro », runtimes 27), ou en ligne de commande
  `xcodebuild -scheme kanstrimi -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=27.0' test`.
  Démarrer le simulateur iPhone avant (`xcrun simctl boot`) : à froid, le premier lancement du
  runner échoue.
- Écrans : `#Preview` de `Features/ScreenPreviews.swift` et `Player/PlayerPreviews.swift`
  (`RenderPreview` ; index et noms parfois décalés), sur chaque destination.
- Sans main ni télécommande, l'app se pilote par `UserDefaults` (`xcrun simctl spawn <udid>
  defaults write dev.crafters.kanstrimi <clé> <valeur>`, DEBUG seulement, lus au lancement) :
  `pref.useMock` (mock), `debug.autopair` / `debug.unpair`, `debug.tab` (`home` … `settings`),
  `debug.open` (identifiant de contenu), `debug.autoplay` (`live`, `live:<id>` ou un identifiant,
  plus `debug.resumeAt`), `debug.playerState` (`vodPaused`, `livePlaying`, `failure`, `nextEpisode`,
  `panel`, `opening` : met le lecteur dans cet état sans flux). Puis `xcrun simctl io <udid> screenshot`.

## Contraintes mesurées

- Fournisseur : proxy à jetons devant un pool de backends, MKV sans HLS, pas de plage
  d'octets fiable ; d'où VLCKit seul et une bascule de source plutôt qu'un retry aveugle.
- Reprise profonde dans un MKV sur simulateur (1140 s sur 4520 s) : son sans image, alors que
  120 s fonctionne. À mesurer sur Apple TV réel avant de conclure.
- iPhone (simulateur, sans flux réel) : paysage forcé et retour en portrait vérifiés, contrôles
  tactiles rendus dans chaque état du lecteur. Non vérifié faute de flux et de doigt : les gestes
  eux-mêmes, le PiP de bout en bout (`pictureInPictureReady` doit être appelé par VLCKit sur un vrai
  flux), la lecture en arrière-plan. À faire sur un iPhone réel contre le serveur.
