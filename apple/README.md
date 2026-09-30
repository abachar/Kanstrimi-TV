# Kanstrimi — app Apple (Apple TV, iPhone, Mac ; iPad à venir)

`kanstrimi.xcodeproj` : **une cible `kanstrimi`, trois destinations** (tvOS 27, iOS 27, et macOS 27,
`TARGETED_DEVICE_FAMILY = 1,3` ; l'iPad ajoutera `2`). SwiftUI, Swift 6 (isolation `MainActor`
par défaut), Swift Testing, **VLCKit 4 en SPM** (miroir GitHub `videolan/vlckit`, révision figée
dans le projet ; le xcframework couvre iOS, tvOS et macOS). Le fournisseur ne sert pas de HLS : VLCKit lit
tout (TS en direct, MKV et MP4 en VOD), AVPlayer est écarté.

## Structure

| Dossier | Rôle |
|---|---|
| `App/` | `KanstrimiApp` (les seuls `#if` hors des fichiers dédiés : l'adaptateur `AppDelegate` d'iOS et la scène `Settings` de macOS), `AppEnvironment` (services partagés, onglet courant, piles de navigation), `Navigation.swift` (`MainTab`, `Route`, covers tvOS, chrome iOS), `RootView` (appairage puis onglets, cover du lecteur, hooks de debug), `Preferences`, `DeviceStore` (jeton en Keychain), `OrientationLock+iOS` (paysage forcé du lecteur). |
| `Contract/` | Types calqués sur `/player` (`server/src/player/types.ts`) : `Card` unique, `Version`, `Source`, `Season`, `Episode`, `Channel`, `Playback`… `nonisolated`, jamais sur la base. |
| `Client/` | Protocole `CatalogClient` ; `HTTPCatalogClient` (le serveur, URL compilée dans `Preferences.compiledServerURL`, jeton d'appareil en Keychain, erreurs mappées sur `CatalogError`, un GET retenté deux fois après 0,5 s puis 1,5 s sur une connexion tombée ou un 502-504 du proxy sans erreur JSON du serveur ; jamais une écriture, ni un délai dépassé) ; `MockCatalogClient` sur les fixtures JSON de `Client/Fixtures/` et ses `MockScenario` ; `SwitchingCatalogClient` bascule entre les deux. |
| `Player/` | Le lecteur, service transverse unique : `PlayerService` (VLCKit, bascule de source, échec après 10 s, surveillance du direct, avance rapide, épisode suivant, zapping), `VersionChooser` (langue × qualité × capacités de l'appareil), `PlayerScreen` (état, overlays et panneaux communs) avec `PlayerScreen+tvOS` (télécommande, `PressCatcher`) et `PlayerScreen+iOS` (gestes, contrôles tactiles, PiP), `PlayerDrawable+tvOS` / `+iOS` (la surface vidéo ; celle d'iOS porte le Picture-in-Picture). |
| `Features/` | Un dossier par écran : Appairage, Accueil, Catalogue, Fiche, Direct, Recherche, Réglages. Une seule vue par écran pour les deux plateformes. |
| `Shared/` | `Platform.swift` (**`Metrics` et les modificateurs par plateforme**), `Theme` (couleurs, badges, panneaux d'état), `CardViews`, `Stores` (chaînes récentes, sources en échec, file de progression, caches). |
| `../kanstrimiTests/` | Swift Testing : client HTTP (serveur simulé), moteur de choix (dont le plafond FHD de l'iPhone), curseur et file de progression. Lancés sur les trois destinations. |

## Une vue, trois plateformes

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
   rien sur iOS), `platformSheet` (cover sur tvOS, feuille sur iOS et Mac), `platformCover` (cover sur tvOS et iOS, feuille sur Mac), `playerPresentation`, `playerChromeInsets()`,
   `touchActivity()`. `Platform.isTV` et `Platform.deviceKind` servent aux rares présences ou
   absences d'un contrôle (bouton Fermer d'une feuille, QR code) et aux textes qui nomment l'appareil.
3. **Un fichier par plateforme** seulement là où l'entrée diffère vraiment : suffixe `+tvOS.swift`
   ou `+iOS.swift`, le fichier entier sous `#if os(...)`. Le lecteur (télécommande, gestes, clavier/souris),
   la surface vidéo (PiP), l'orientation. Aucune exception de membre dans le groupe synchronisé
   du projet, sauf l'`Info.plist` partiel (`UIBackgroundModes` pour le PiP) que Xcode exclut des
   ressources.

**Navigation** : `env.open(id)` est l'unique point d'entrée vers une fiche. Sur tvOS c'est un
`fullScreenCover` au-dessus des onglets ; sur iOS un push dans la `NavigationStack` de l'onglet
courant (`AppEnvironment.paths`, `Route`). La grille d'un genre et l'écran d'une saga suivent la même règle. Le lecteur est
un `fullScreenCover` depuis la racine sur iOS et tvOS, et une superposition plein cadre dans la fenêtre (`overlay`/`ZStack`) sur Mac. L'iPhone garde cinq onglets : Réglages se
rejoint par la roue dentée de l'accueil.

**Lecteur iPhone** : paysage forcé pendant la lecture (`AppDelegate.orientations` +
`requestGeometryUpdate`), tap = contrôles, double tap gauche/droite = ±10 s, ±10 maintenu = avance/retour rapide, glisser horizontal =
recherche, glisser vertical en direct = zapping, appui long = panneau. Picture-in-Picture par le
drawable `PiPVideoView` conforme à `VLCPictureInPictureDrawable` : VLCKit rend un
`VLCPictureInPictureWindowControlling` quand sa sortie vidéo le permet, `PlayerService.isMinimized`
cache l'écran sans arrêter la lecture. `Capabilities.iPhone` plafonne à la Full HD.

**Lecteur Mac** : espace = pause, flèches = ±10 s (maintenues : avance rapide) ou zapping, F = plein écran, Échap = fermer, survol = affiche les contrôles.

**Reprendre et vu** : appui long sur une carte de « Reprendre » (accueil) = Retirer ou Marquer comme vu ; fiche d'un film = bouton « Marquer comme vu » / « Vu » ; appui long sur un épisode = vu / non vu, sur un bouton de saison = toute la saison. La progression en attente du titre est oubliée (`ProgressQueue.drop`) pour qu'un rejeu ne le ramène pas.

**Programme du direct** : dans le lecteur, le panneau (tvOS : flèche droite ; iPhone : « Programme » ou « ⋯ ») ouvre sur l'onglet Programme, qui remplace Infos : `GET /channels/{id}/programmes`, du programme en cours jusqu'à 6 h, rechargé à chaque zapping ; un échec se lit « Programme inconnu ».

**Direct** : jamais de pause, comme une télé (`PlayerService.togglePlayPause`/`pause` l'ignorent sur toutes les plateformes) ; Lecture relance seulement un flux arrêté par une coupure.
Une fois l'image affichée, un chien de garde compte les images affichées (`VLCMedia.statistics`) : 4 s sans
nouvelle image ou sans sortie vidéo = source en cause (le débit ne l'est pas), bascule d'échec : source suivante, nouvel essai
(nouveau jeton via le `302`), puis le dialogue. Un `.stopped` en direct (connexion fermée par l'amont, que `:http-reconnect`
n'a pas pu rouvrir) prend la même bascule : un direct n'a pas de fin.

**Tampons VLC** : `:network-caching` par média, réglable dans Réglages › Lecture : 1,5 s en direct (zapping rapide),
3 s en film ou épisode ; plafonné à 5 s, VLC remplissant le tampon avant la première image et une source
ayant 10 s pour démarrer. `:http-reconnect` rouvre une connexion HTTP tombée avant que le chien de garde n'intervienne.

**Coupure en film ou épisode** : même bascule, reprise à la position courante. Deux signaux une fois
l'image affichée : 15 s sans nouvelle image en lecture (plus long qu'en direct, un seek dans un MKV
distant fige l'image quelques secondes), ou un `.stopped` à plus de 60 s de la fin ; plus près, c'est la
fin du fichier (épisode suivant).

**Avance rapide** (films, épisodes ; ◀ ▶ maintenus sur la télécommande via `PressCatcher`) : la cible avance
de 10, 30, 60, 120 puis 300 s par seconde (un palier toutes les 2 s), affichée à la place du temps
(`shownTime`, « ▶▶ ×30 ») ; l'image continue, un seul seek au relâchement : un MKV distant ne suit pas un
défilement réel.

## Fonctionnement

- **Appairage** : l'app demande un code à `POST /devices` et sonde `GET /devices/{code}` jusqu'à
  l'approbation, jeton en Keychain. L'Apple TV affiche un QR vers `/admin/pair/{code}` ; l'iPhone
  affiche un lien « Ouvrir l'admin » (Safari), la validation se fait sur le même téléphone. Un `401`
  n'importe où dissocie l'appareil et ramène à l'appairage.
- **Catalogue** : les rangées viennent du serveur ; « Voir tout » s'ouvre sur l'ordre du serveur (« Nouveautés »
  et « Derniers épisodes » par arrivée, les genres par date de sortie), modifiable dans la grille et jamais
  mémorisé. « Top 10 de la semaine » (rangée `top10` du serveur) affiche le rang à côté de l'affiche. Après
  « Nouveautés » viennent les « Studios » (`/movies/studios`, `/series/studios`, grille = la liste filtrée par
  `studio`) et, dans Films, les « Sagas » (`/movies/sagas`, « Voir tout » paginé) ; la fiche d'un film mène à
  sa saga. `Paginator` est générique (titres par `ListQuery`, sagas par `SagaQuery`). Le client de
  démonstration tire sagas et studios de `Fixtures/sagas.json` et `Fixtures/studios.json`.
- **Lecture** : `stream_url` est un lien signé vers le serveur, relu à chaque lecture ; le
  serveur répond `302` vers le fournisseur. Le choix de la version suit l'ordre de langues
  des Réglages, les préférences par titre, les capacités de l'appareil, et bascule de source après échec.
- Réglages › Appareil › « Client de démonstration » passe sur le mock sans relancer ; les
  `#Preview` et les scénarios de démo forcent le mock. Ses flux (`demo://…`) ne se lisent pas :
  la lecture se teste contre le serveur, local ou de prod.

## Vérifier

Pas de `Simulator.app` sur cette installation Xcode 27, donc ni télécommande ni doigt à piloter ;
les trois destinations se vérifient quand même, à chaque modification. À froid, le premier lancement du runner échoue.

- Compiler et tester sur les trois : `BuildProject` puis `RunAllTests` après `XcodeSwitchRunDestination`
  (« Apple TV 4K (3rd generation) », « iPhone 17 Pro » puis « Mac », runtimes 27), ou en ligne de commande
  `xcodebuild -scheme kanstrimi -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=27.0' test` (et `-destination 'platform=macOS' test` pour le Mac).
  Démarrer le simulateur iPhone avant (`xcrun simctl boot`).
- Visite pilotée (tvOS) : la cible `kanstrimiUITests` (`ScreenTour`, schéma `ScreenTour`) appuie sur la
  télécommande (`XCUIRemote`) et enregistre une capture par étape : focus, défilement, panneaux du lecteur.
  Ignorée sans `CAPTURE_DIR` : `TEST_RUNNER_CAPTURE_DIR=/chemin xcodebuild -scheme ScreenTour -destination
  'platform=tvOS Simulator,name=Apple TV 4K (3rd generation)' test`. Les booléens passés en argument de lancement
  s'écrivent `<true/>` (l'app lit `as? Bool`).
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
- Mac : non vérifié faute de flux réel, les raccourcis clavier, le plein écran, le sandbox et le Keychain. À faire sur un vrai Mac.
