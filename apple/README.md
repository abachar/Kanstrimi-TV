# Kanstrimi — app Apple (Apple TV, iPhone ; iPad à venir)

`kanstrimi.xcodeproj` : **une cible `kanstrimi`, deux destinations** (tvOS 27 et iOS 27,
`TARGETED_DEVICE_FAMILY = 1,3` ; l'iPad ajoutera `2`). SwiftUI en français (`developmentRegion = fr` : les contrôles système suivent), Swift 6 (isolation `MainActor`
par défaut), Swift Testing, **VLCKit 4 en SPM** (miroir GitHub `videolan/vlckit`, révision figée
dans le projet ; le xcframework couvre iOS et tvOS). Le fournisseur ne sert pas de HLS : VLCKit lit
tout (TS en direct, MKV et MP4 en VOD), AVPlayer est écarté.

## Structure

| Dossier | Rôle |
|---|---|
| `App/` | `KanstrimiApp` (les seuls `#if` hors des fichiers dédiés : l'adaptateur `AppDelegate` d'iOS), `AppEnvironment` (services partagés, onglet courant, piles de navigation), `Navigation.swift` (`MainTab`, `Route`, covers tvOS, chrome iOS), `RootView` (appairage puis onglets, cover du lecteur, hooks de debug), `Preferences`, `DeviceStore` (jeton en Keychain), `OrientationLock+iOS` (rotation libre du lecteur, bouton plein écran). |
| `Contract/` | Types calqués sur `/player` (`server/src/player/types.ts`) : `Card` unique, `Version`, `Source`, `Season`, `Episode`, `Channel`, `Playback`… `nonisolated`, jamais sur la base. |
| `Client/` | Protocole `CatalogClient` ; `HTTPCatalogClient` (le serveur, URL compilée dans `Preferences.compiledServerURL`, jeton d'appareil en Keychain, erreurs mappées sur `CatalogError`, un GET retenté deux fois après 0,5 s puis 1,5 s sur une connexion tombée ou un 502-504 du proxy sans erreur JSON du serveur ; jamais une écriture, ni un délai dépassé) ; `MockCatalogClient` sur les fixtures JSON de `Client/Fixtures/` et ses `MockScenario` ; `SwitchingCatalogClient` bascule entre les deux. |
| `Player/` | Le lecteur, service transverse unique : `PlayerService` (VLCKit, bascule de source, échec après 10 s, surveillance du direct, avance rapide, épisode suivant, zapping), `VersionChooser` (langue × qualité × capacités de l'appareil), `PlayerScreen` (état, overlays et panneaux communs) avec `PlayerScreen+tvOS` (télécommande, `PressCatcher`) et `PlayerScreen+iOS` (gestes, contrôles tactiles, PiP), `PlayerDrawable+tvOS` / `+iOS` (la surface vidéo ; celle d'iOS porte le Picture-in-Picture). |
| `Features/` | Un dossier par écran : Appairage, Accueil, Catalogue, Fiche, Direct, Recherche, Réglages. Une seule vue par écran pour les deux plateformes. |
| `Shared/` | `Platform.swift` (**`Metrics` et les modificateurs par plateforme**), `Theme` (couleurs, badges, panneaux d'état), `CardViews`, `Stores` (chaînes récentes, sources en échec, file de progression, caches). |
| `scripts/` | `shot.sh <écran> <tvos\|iphone>` et `shot-all.sh <tvos\|iphone>` : captures du client de démo pour la revue UI, dans `ui-review/<écran>/<horodatage>-<cible>.png` (hors git). |
| `../kanstrimiTests/` | Swift Testing : client HTTP (serveur simulé), moteur de choix (dont le plafond FHD de l'iPhone), curseur et file de progression. Lancés sur les deux destinations. |

## Une vue, deux plateformes

Les vues ne contiennent pas de `#if os(...)`. Ce qui diffère passe par trois niveaux, du plus
partagé au plus spécifique :

1. **`Metrics`** (`Shared/Platform.swift`, `@Environment(\.metrics)`) : marges, largeurs d'affiche,
   tailles de titres, colonnes de grille, hauteurs de panneaux… `Metrics.tv` et `Metrics.phone` ;
   l'iPad sera un troisième jeu de valeurs. Une vue écrit `metrics.posterWidth`, jamais `250`.
   `metrics.compact` (iPhone) choisit une disposition tenue en main là où la télé garde la sienne :
   accueil, fiche, épisodes, lignes du Direct, appairage, carte d'épisode suivant, chargement du lecteur.
   Toute branche `compact` laisse le rendu tvOS inchangé.
   Les dispositions changent avec `ViewThatFits`, `LazyVGrid(.adaptive)` ou un `ScrollView(.horizontal)`
   qui fait défiler ce qui ne tient pas plutôt que de casser les libellés.
2. **Modificateurs qui cachent une API absente d'une plateforme**, tous dans `Platform.swift` :
   `cardButtonStyle()` (`.card` sur tvOS, retour tactile sur iOS), `prominentButtonStyle()` (libellé
   sombre sur iOS, la teinte de l'app étant blanche), `onBackCommand` (`onExitCommand` sur tvOS,
   rien sur iOS), `platformSheet` (cover sur tvOS, feuille sur iOS), `playerChromeInsets()`,
   `touchActivity()`, et côté iPhone seulement (sans effet sur tvOS) `phoneLargeTitle` (grand titre de la barre
   de navigation), `phoneFullWidth` (bouton principal pleine largeur), `touchContextMenu` (appui long sur une
   affiche : Lecture, Voir la fiche), `touchSwipe`. `Platform.isTV` et `Platform.deviceKind` servent aux rares présences ou
   absences d'un contrôle (bouton Fermer d'une feuille, QR code) et aux textes qui nomment l'appareil.
3. **Un fichier par plateforme** seulement là où l'entrée diffère vraiment : suffixe `+tvOS.swift`
   ou `+iOS.swift`, le fichier entier sous `#if os(...)`. Le lecteur (télécommande, gestes),
   la surface vidéo (PiP), l'orientation. Aucune exception de membre dans le groupe synchronisé
   du projet, sauf l'`Info.plist` partiel (`UIBackgroundModes` pour le PiP) que Xcode exclut des
   ressources.

**Navigation** : `env.open(id)` est l'unique point d'entrée vers une fiche. Sur tvOS c'est un
`fullScreenCover` au-dessus des onglets ; sur iOS un push dans la `NavigationStack` de l'onglet
courant (`AppEnvironment.paths`, `Route`). La grille d'un genre et l'écran d'une saga suivent la même règle. Le lecteur est
un `fullScreenCover` depuis la racine. L'iPhone garde cinq onglets : Réglages se
rejoint par la roue dentée de l'accueil. Sur iPhone, Films, Séries, Direct et Recherche portent le grand titre de la barre
de navigation ; la recherche garde le champ `searchable` en haut de son écran : posé sur la pile ou sur le `TabView`
avec l'onglet `role: .search`, iOS 27 (simulateur) n'affiche pas le champ dans la barre d'onglets (essayé le 2026-09-30).

**Lecteur iPhone** : il suit le téléphone, portrait ou paysage (`AppDelegate.orientations` élargi le temps de la
lecture) ; le bouton plein écran fait pivoter (`OrientationLock.rotate`). Les contrôles (`PlayerControls`) reprennent
la barre tvOS : en bas le titre, la progression (celle de l'émission en direct), les boutons de panneau à gauche
(direct : Programme · Récentes · Infos ; épisode : Épisodes · Infos ; film : Infos) et les menus Versions · Audio ·
Sous-titres à droite (un seul menu « … » s'il manque de place) ; les contrôles restent dans la zone sûre (encoche,
barre d'accueil), seuls la vidéo et les voiles vont aux bords ; la surface vidéo recale les vues et couches de VLCKit à
chaque mise en page (sinon l'image se décale après des rotations) ; en haut Fermer, PiP, plein écran ; au centre ±10 et
lecture/pause (films, épisodes), remplacés par l'indicateur de chargement. Gestes : tap = contrôles (ou ferme le
panneau), double tap gauche/droite = ±10 s, ±10 maintenu = avance/retour rapide, glisser horizontal = recherche.
Paysage : glisser vers la droite en direct = chaînes du groupe (liste à gauche, comme ◀ sur tvOS). Portrait : vidéo
centrée à son format, glisser vers le haut = chaînes en direct (liste montant du bas) ou premier panneau
(Épisodes / Infos), glisser vers le bas = fermer. Plus de zapping ni d'appui long. Picture-in-Picture par le
drawable `PiPVideoView` conforme à `VLCPictureInPictureDrawable` : VLCKit rend un
`VLCPictureInPictureWindowControlling` quand sa sortie vidéo le permet, `PlayerService.isMinimized`
cache l'écran sans arrêter la lecture, une fois l'image dans l'image démarrée (`stateChangeEventHandler`) : cachée
avant, la surface vidéo quitte la fenêtre et iOS abandonne. `Capabilities.iPhone` plafonne à la Full HD.

**Un seul choix, pas de bouton** (toutes plateformes) : Versions (fiche d'un film, « Versions · n » de l'accueil tvOS),
Langue (fiche d'une série) et l'appui long sur Lecture n'existent que si le sélecteur a plus d'une ligne
(`VersionPicker.lineCount`, une par source) ; dans le lecteur, Versions s'il y a plus d'une version, Audio avec plus
d'une piste, Sous-titres avec au moins une piste (sinon « Désactivés » serait le seul choix). Les pistes arrivent avec
la lecture : ces boutons apparaissent alors.

**Direct sur iPhone** : un menu sous le titre choisit la catégorie (Récentes, Favoris, puis les groupes rangés par
marché, « France » › « Sport »), trop nombreuses pour une ligne de pastilles.

**Fiche** : Lecture/Reprendre en bouton plein, les autres actions en pastilles rondes (`IconAction`) : sur tvOS le
libellé n'apparaît que sous la pastille focalisée, sur iPhone il est toujours affiché. Ma liste = cœur
(favori, comme dans le Direct). La bande-annonce (YouTube, que VLC ne lit pas) s'ouvre par `openURL` : l'app
YouTube sur tvOS (`youtube://`, `LSApplicationQueriesSchemes`), bouton masqué si elle manque ; la page web ailleurs.
Sous le titre, les tags de version montrent en plein celle que Lecture joue (qualité et langue),
les autres langues en contour ; pas de note « version choisie » ni de tableau des versions.
Le titre est dessiné par son logo TMDB (`logo`, `TitleLogo`) quand le serveur en sert un, dans la boîte
`Metrics.detailLogo` ; le texte le remplace pendant le chargement et en cas d'échec.

**Reprendre et vu** : appui long sur une carte de « Reprendre » (accueil) = Retirer ou Marquer comme vu ; fiche d'un film = bouton « Marquer comme vu » / « Vu » ; appui long sur un épisode = vu / non vu, sur un bouton de saison = toute la saison. La progression en attente du titre est oubliée (`ProgressQueue.drop`) pour qu'un rejeu ne le ramène pas.

**Barre du lecteur** (tvOS, `PlayerBar`) : un seul calque pour film, épisode et direct. Un appui (ouverture, changement de
chaîne, clic, ◀/▶, Lecture/Pause) l'affiche 4 s ; ▼ (ou appui long) donne le focus à ses boutons, ▲ le rend à la vidéo,
Retour ferme le panneau puis la barre puis le lecteur, 10 s sans geste la ferment. En haut le titre (en direct : EN DIRECT,
chaîne, émission) et la progression (en direct celle de l'émission, pleine sans guide) ; en bas à gauche les boutons texte
qui ouvrent un panneau (direct : Programme · Récentes · Infos ; film : Infos ; série : Épisodes de la saison · Infos),
à droite les icônes Versions · Audio · Sous-titres, chacune un menu déroulant. Panneau ouvert : titre et progression
s'effacent, les boutons remontent et le détail s'affiche dessous (▼), sur un voile sombre. Pas d'aide de télécommande à l'écran.
**Télécommande en direct** (tvOS) : ◀ chaînes du groupe (avec l'émission en cours), ▼ la barre ; ▲ et ▶ ne font rien ;
pas de zapping sur les flèches (sans numéros de chaîne, l'ordre ne s'apprend pas). L'iPhone non plus : voir
**Lecteur iPhone**. Le dialogue d'échec y propose « Réessayer · <version en cours> », puis « ou essayer une autre
version » et les autres versions sur une ligne (`playInstead`, sans la mémoriser), puis « Quitter » à part.
Le sélecteur de version de la fiche (`VersionPicker`, toutes plateformes) est une simple liste : un bouton par source de chaque
version (la recommandée d'abord, puis par langue et qualité décroissante ; la source sous la version sur iPhone),
qui lance la lecture aussitôt. Pas d'onglets
de langue, pas d'options « mémoriser » ni « par défaut », pas de bouton Lire : la meilleure version reste le choix
automatique.

**Programme du direct** : dans le lecteur, le bouton Programme (tvOS : dans la barre ; iPhone : « Programme ») ouvre le programme, qui remplace Infos : `GET /channels/{id}/programmes`, du programme en cours jusqu'à 6 h, rechargé à chaque zapping ; un échec se lit « Programme inconnu ».

**Direct** : jamais de pause, comme une télé (`PlayerService.togglePlayPause`/`pause` l'ignorent sur toutes les plateformes) ; Lecture relance seulement un flux arrêté par une coupure.
Une fois l'image affichée, un chien de garde compte les images affichées (`VLCMedia.statistics`) : 4 s sans
nouvelle image ou sans sortie vidéo = source en cause (le débit ne l'est pas), bascule d'échec : source suivante, nouvel essai
(nouveau jeton via le `302`), puis le dialogue. Un `.stopped` en direct (connexion fermée par l'amont, que `:http-reconnect`
n'a pas pu rouvrir) prend la même bascule : un direct n'a pas de fin.

**Réglages** (tvOS) : à gauche le nom de l'app et ce qui se lit sans se régler (appareil et code, serveur et version,
volumes du catalogue, langues, dernier import) ; à droite la liste des réglages seulement. Interrupteurs et choix y sont
des lignes dessinées par l'app (`FocusRow`, `ChoiceRow`) : le `Toggle` système laisse son titre clair sur le fond blanc de
focus, et sous tvOS 27 (Xcode 27A266a) la liste poussée par un `Picker` par défaut s'ouvre noire, même seule dans un
`NavigationStack` nu ; `ChoiceRow` ouvre un menu à la place. À retester à chaque version de tvOS.

**Tampons VLC** : `:network-caching` par média, réglable dans Réglages › Lecture : 1,5 s en direct (zapping rapide),
3 s en film ou épisode ; plafonné à 5 s, VLC remplissant le tampon avant la première image et une source
ayant 10 s pour démarrer. `:http-reconnect` rouvre une connexion HTTP tombée avant que le chien de garde n'intervienne.

**Films et épisodes par le démuxeur FFmpeg** (`:demux=avformat`) : le démuxeur MKV de VLC 4 abandonne l'index
(Cues) des fichiers du fournisseur juste après son CRC-32, et chaque saut relit alors le film depuis le début
(gel, `Error while reading SimpleBlock`). La reprise est un saut une fois la lecture lancée : avec `:start-time`,
avformat compte le temps depuis le point de reprise et raccourcit la durée d'autant. Le direct (TS) garde le
démuxeur de VLC.

**Coupure en film ou épisode** : même bascule, reprise à la position courante. Deux signaux une fois
l'image affichée : 15 s sans nouvelle image en lecture hors des 15 s qui suivent un saut (plus long qu'en
direct, le temps de rouvrir le fichier à la nouvelle position), ou un `.stopped` à plus de 60 s de la fin ;
plus près, c'est la fin du fichier (épisode suivant). Le `.stopped` ou l'erreur du média remplacé, reçus
après le lancement du suivant, sont ignorés jusqu'à l'ouverture de celui-ci.

**Avance rapide** (films, épisodes ; ◀ ▶ maintenus sur la télécommande via `PressCatcher`) : la cible avance
de 10, 30, 60, 120 puis 300 s par seconde (un palier toutes les 2 s), affichée à la place du temps
(`shownTime`, « ▶▶ ×30 ») ; l'image continue, un seul seek au relâchement : un MKV distant ne suit pas un
défilement réel.

## Fonctionnement

- **Appairage** : l'app demande un code à `POST /devices` et sonde `GET /devices/{code}` jusqu'à
  l'approbation, jeton en Keychain. L'Apple TV affiche un QR vers `/admin/pair/{code}` (à gauche
  les étapes et l'adresse de repli, à droite seulement le QR, le code et l'attente) ; l'iPhone
  affiche un lien « Ouvrir l'admin » (Safari), la validation se fait sur le même téléphone. Un `401`
  n'importe où dissocie l'appareil et ramène à l'appairage.
- **Catalogue** : une affiche ne porte aucun texte dessous ; l'année, la note et les pastilles qualité et
  langue sont dessinées dessus (sur iPhone l'année et la note seulement, l'indice en haut à gauche) (pas de genre : un titre en a plusieurs, la rangée dit déjà lequel) ; une seule
  carte pour les rangées et les grilles (`PosterCard` / `PosterCardLabel`). Même règle pour une saga (nombre de films
  sur l'affiche) et un studio (son logo seul, ou son nom sans logo). L'écran d'un studio
  (`GenreGridView(studio:)`) a sa tuile en tête et, en fond, le backdrop de son titre le plus récent (`Studio.backdrop`),
  comme une saga ; les films d'une saga vont du plus récent au plus ancien. Les rangées viennent du serveur ; « Voir tout » s'ouvre sur l'ordre du serveur (« Nouveautés »
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
les deux destinations se vérifient quand même, à chaque modification. À froid, le premier lancement du runner échoue.

- Compiler et tester sur les deux : `BuildProject` puis `RunAllTests` après `XcodeSwitchRunDestination`
  (« Apple TV 4K (3rd generation) » puis « iPhone 17 Pro », runtimes 27), ou en ligne de commande
  `xcodebuild -scheme kanstrimi -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=27.0' test`.
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
  `panel`, `opening` : met le lecteur dans cet état sans flux, une fausse image `PreviewFrame` à la place de la vidéo pour juger la transparence des overlays ; les previews du lecteur aussi).
  iPhone : `debug.tab settings` pousse Réglages depuis l'accueil, `debug.landscape` fait pivoter le lecteur,
  `debug.panel` (`Programme`, `Récentes`, `Épisodes`, `Infos`, `Chaînes`) ouvre ce panneau. Puis `xcrun simctl io <udid> screenshot`.
- Captures pour la revue UI : `scripts/shot-all.sh tvos` (puis `iphone`) compile en Debug, installe et capture
  les 15 écrans atteignables par ces clés, avec le même horodatage (`NOBUILD=1` pour sauter la compilation) ;
  `scripts/shot.sh <écran> <cible>` pour un seul écran (iPhone : `LANDSCAPE=1` pour le lecteur en paysage,
  `PANEL=<panneau>` pour un panneau ouvert). Sortie dans `ui-review/`, ignoré par git. Les clés `debug.*` s'effacent au lancement qui les lit, et le script
  remet `pref.useMock` comme il l'a trouvé : un lancement suivant depuis Xcode repart normalement. Ce qui demande
  focus ou défilement (résultats de recherche, grilles, panneau du lecteur, Programme du direct) passe par `ScreenTour`.

## Contraintes mesurées

- Fournisseur : proxy à jetons devant un pool de backends, MKV sans HLS, pas de plage
  d'octets fiable ; d'où VLCKit seul et une bascule de source plutôt qu'un retry aveugle.
- Reprise profonde dans un MKV sur simulateur (1140 s sur 4520 s) : son sans image, alors que
  120 s fonctionne. À mesurer sur Apple TV réel avant de conclure.
- iPhone (simulateur, sans flux réel) : portrait et paysage (bouton plein écran) vérifiés, contrôles
  tactiles, panneaux et liste des chaînes rendus dans chaque état du lecteur ; le tap passe par
  `DeviceInteractionSynthesize`, qui n'offre ni glisser ni rotation. Non vérifié faute de flux et de doigt : les glissers
  eux-mêmes, la rotation physique du téléphone, le PiP de bout en bout (`pictureInPictureReady` doit être appelé par VLCKit sur un vrai
  flux), la lecture en arrière-plan. À faire sur un iPhone réel contre le serveur.
