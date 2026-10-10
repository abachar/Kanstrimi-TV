# Kanstrimi — app Android (tablette)

`android/` : **une app Kotlin + Jetpack Compose**, tablette d'abord (Galaxy Tab S9 ; les téléphones viendront par
l'adaptatif). AGP 9, Kotlin 2.4, Compose BOM 2026.09, Material 3 adaptive (rail ou barre selon la largeur), Coil pour
les images, OkHttp + kotlinx.serialization pour `/player`. Lecteur : Media3 1.9 ExoPlayer avec le décodeur FFmpeg de
Jellyfin (`org.jellyfin.media3:media3-ffmpeg-decoder`, qui fixe la version de Media3) pour DTS et TrueHD, absents de la
Tab S9 ; la vidéo par MediaCodec, HDR10+ natif, pas de Dolby Vision sur cet appareil (la couche HEVC de base se lit).

## Structure

| Dossier (`app/src/main/kotlin/dev/crafters/kanstrimi/`) | Rôle |
|---|---|
| `contract/` | `Wire.kt` : les types calqués sur `server/src/player/types.ts`, kotlinx.serialization, clés inconnues ignorées, valeur d'énumération inconnue → `OTHER`. |
| `client/` | `CatalogClient` (une méthode par route), `HttpCatalogClient` (le serveur : jeton Bearer en HTTPS ou sur le LAN seulement, 502-504 du proxy retentés deux fois sur un GET, 401 → appareil dissocié), `MockCatalogClient` (le client de démo). |
| `app/` | `KanstrimiApplication` (cache disque des images), `AppEnvironment` (préférences, appareil, client, info du serveur, notice, moteur et service du lecteur, `progressRevision`, `open(id)` / `navigate(route)` ; pour le Direct : `liveVersion`, `guide`, `nowPlaying`, `watchChannel`), `LiveStores.kt` (`LiveGuide` : la règle du programme en cours ; `ChannelCache` : `GET /channels/{id}` gardé une minute ; `RecentChannels` : 20 chaînes récentes en préférences), `Navigation.kt` (`Route`, `Navigator` : une pile d'écrans par onglet, tenue à la main), `DeviceStore` (jeton et code), `Preferences` (dont celles du lecteur, par `PlaybackPreferences`), `MainActivity` (hooks `debug.*`). |
| `ui/` | `RootView` (appairage puis onglets, le lecteur par-dessus quand `player.isPresented`, notice), `MainTabs` (`NavigationSuiteScaffold` ; chaque onglet visité et chaque écran sous le sommet de sa pile restent composés mais ni mesurés ni dessinés, pour garder données et défilement), `Metrics.kt` (largeur d'affiche, marge, colonnes, lues de la largeur de la fenêtre : six affiches en paysage, cinq en portrait ; `LocalMetrics`), `Cards.kt` et `UpNextCard` (cartes bêtes : un `ContentItem` ou un `ChannelItem` et une action, le parent donne la largeur ; `MenuPoster` ajoute le menu d'appui long Lecture / Voir la fiche ; `ChannelCard`, `ProgrammeCard`), `ChannelViews.kt` (`LoadedChannelCard` : la carte nourrie de ce que l'appareil sait de la chaîne, `channelItem`, `ChannelRow`), `Pieces.kt` (badges, art, logo ou titre, `ChannelLogo`, états, `LoadedScreen`, bouton Retour, heures et « il y a … »), `theme/`. |
| `features/` | Un dossier par écran : `home`, `live` (le Direct en trois colonnes : catégories, chaînes, aperçu et programme), `catalog` (Films et Séries, grille paginée et filtres, sagas, acteur ; `Paginator`), `search`, `detail` (fiche film et série, épisodes, distribution, feuille des versions), `pairing`, `settings`. |
| `player/` | Le lecteur, service transverse unique, calqué sur `apple/kanstrimi/Player/` : `PlayerService` (phases, versions, pannes, marqueurs, suite, progression, direct et zapping ; il parle au moteur par `PlaybackEngine`, que les tests remplacent), `ExoPlaybackEngine` (un ExoPlayer, session média, pistes, cues), `MpvPlaybackEngine` + `MpvSurface` (libmpv, pour ce qu'ExoPlayer ne décode pas), `FallbackPlaybackEngine` (la façade que le lecteur voit : ExoPlayer puis mpv), `PlaybackService` (la session prêtée au système), `LivePreview` (le second ExoPlayer de l'aperçu du Direct), `VersionChooser`, `PlaybackReporter` (+ `ProgressQueue`, `FailedSourcesStore`), `PlaybackContext`, `PlayerScreen` (plein écran tactile, image dans l'image), `PlayerControls`, `PlayerPanels` (direct : Programme · Récentes · Infos ; sinon Épisodes · Similaires · Distribution · Infos), `LiveOverlays` (liste des chaînes, panneaux du direct), `PlayerOverlays` (chargement, « Passer … », « À suivre », échec, toast), `PlayerDebug` (états mis en scène, fichier public). |
| `../scripts/` | `avd.sh` (crée l'émulateur « Tablet », 2 560 × 1 600 à 280 dpi), `shot.sh` / `shot-all.sh` (captures du client de démo dans `ui-review/`, hors git). |
| `app/src/test/` | `ContractTest` : décode chaque réponse enregistrée par le serveur ; `HttpCatalogClientTest` ; `app/LiveGuideTest` (programme en cours, guide de la version, chaînes récentes), `app/DeepLinkTest` (identifiants admis, absence longue) ; `player/` : `VersionChooserTest`, `ProgressQueueTest`, `PlayerServiceTest` (faux moteur `FakePlaybackEngine` : bascule de source, essais, dialogue, coupure, générique, suite, marqueurs, progression, direct : guide, zapping, temps regardé, qualité mémorisée). |

## Choix

- **Le contrat est partagé** : les golden files de `apple/kanstrimiTests/Contract/` sont lus tels quels par
  `ContractTest` (chemin relatif) et embarqués comme assets du client de démo (`app/build.gradle.kts`). Un seul jeu de
  réponses pour les trois clients ; la CI du serveur les régénère.
- **Client léger** : les textes viennent écrits du serveur (`facts`, `badges`, `play_label`…), l'app les pose.
- **Jeton** : préférences privées de l'app (bac à sable, chiffrement au repos par Android), exclu des sauvegardes et
  des transferts (`xml/data_extraction_rules.xml`, `xml/backup_rules.xml`).
- **Une version** pour tous : `versionName` suit `MARKETING_VERSION` et `server/package.json`.
- **Français** à l'écran, anglais dans les commentaires, comme partout.
- **Client de démo** : le guide des chaînes enregistrées est décalé au présent (le programme en cours a commencé il y a
  vingt minutes), sinon les captures montreraient un programme terminé.

## Direct : choix et pièges

- **Trois colonnes** comme l'iPad, sans focus : un tap choisit la chaîne (carte soulignée, aperçu et programme à
  droite), un second tap, l'aperçu ou « Regarder » la lit ; choisir une catégorie choisit sa première chaîne. Au
  retour du lecteur la chaîne lue reste choisie (un zap la déplace) et son aperçu repart ; l'écran recharge
  `GET /channels` quand `progressRevision` bouge (le temps regardé change « Les plus regardées »).
- **Une seule connexion au fournisseur** : l'aperçu (`LivePreview`, son propre ExoPlayer, muet jusqu'à la première
  image puis sonore, 400 ms de temporisation) ne tourne que quand l'onglet Direct est celui à l'écran, rien de poussé
  au-dessus, le lecteur baissé et l'app devant ; il est coupé de façon synchrone avant toute lecture (`watch`,
  `env.watchChannel`). Un échec du flux laisse « Aperçu indisponible », sans nouvel essai.
- **Programme en cours** : une seule règle, `LiveGuide.nowPlaying` (le détail reçu tant que son programme dure,
  sinon la copie de la liste), portée par `env.channelItem` jusqu'à `ChannelCard` ; `LoadedChannelCard` demande le
  détail quand rien n'est connu. Le guide montré est celui de la version lue ou de départ (`env.guide`,
  `Channel.guide(version)` : une qualité peut avoir le sien). Les lignes du Direct ne demandent rien : la colonne de
  droite montre déjà le programme de la chaîne choisie.
- **Version de départ** (`PlayerService.startChoice`) : celle mémorisée pour la chaîne (un changement de qualité dans
  le lecteur la mémorise), sinon la meilleure ; la lecture, l'aperçu et les badges s'en servent.
- **Lecteur en direct** : jamais de pause ni de recherche (seul « ▶ » reparaît si le moteur a été arrêté, perte du
  focus audio) ; barre du programme en cours, heure de début à gauche, « Ensuite : … · 20:00 » à droite ; « Chaînes »
  (ou un glissé vers la droite) ouvre la liste de la catégorie de départ en panneau latéral, un tap zappe sur le même
  ExoPlayer ; panneaux Programme (`GET /channels/{id}/programmes` de la version lue), Récentes, Infos. L'app quittée
  arrête une chaîne (une télé éteinte), là où un film attend. Pannes : le même chemin que la VOD ; « Réessayer »
  redemande `GET /channels/{id}`.
- **Temps regardé** : `POST /playback/{id}/watch-time` toutes les 10 s et en quittant la chaîne (zap compris), le
  serveur somme ; `progressRevision` ne bouge qu'en quittant le lecteur, pas à chaque zap. Pas de progression ni de
  marqueurs en direct.
- **Media3 en direct** : un flux TS en HTTP, `DefaultLoadControl` par défaut ; si le moteur expose une fenêtre
  dynamique (HLS, DASH), `seekToDefaultPosition` au premier `READY` la rejoint au bord du direct. À mesurer sur la
  Tab S9 avec de vrais flux : le délai à l'image, un zap enchaîné (le `stop` ferme-t-il la connexion avant le
  `prepare` suivant), et le son HE-AAC à 50 i/s (Canal+ Foot) qui saccadait sur Apple TV, réglé là par une fenêtre
  de retour de 30 s ; si cela se reproduit, jouer sur `DefaultLoadControl` (tampon minimal) ou sur le décodage
  audio par FFmpeg.

## Lecteur : choix et pièges

- **Un seul ExoPlayer** : construit au premier `load`, libéré à `stop()` ; un changement de source ou de titre
  réutilise l'instance (`stop` ferme la connexion avant que `prepare` n'en ouvre une autre, les deux passent par le
  thread de lecture dans l'ordre). Le fournisseur ne voit jamais deux connexions de l'app.
- **Décodeurs** : `DefaultRenderersFactory` sans extension par réflexion ; `FfmpegAudioRenderer`
  (`androidx.media3.decoder.ffmpeg`, le nom de classe est celui du module AndroidX, Jellyfin ne le renomme pas) ajouté
  explicitement après les renderers MediaCodec, donc pris seulement quand l'appareil n'a pas le codec. Décoder
  fallback activé. Les décodeurs « goldfish » de l'émulateur échouent au premier buffer sous GPU logiciel : ils sont
  filtrés par le `MediaCodecSelector` (aucun appareil réel n'en a).
- **Deux moteurs, mpv derrière ExoPlayer.** Android ne donne le décodeur MPEG-2 logiciel qu'au profil TV
  (`domain="tv"` dans `media_codecs.xml`, vérifié sur la Tab S9 : aucun décodeur MPEG-2, ni Qualcomm ni logiciel) et la
  bibliothèque FFmpeg de Jellyfin ne décode que le son : ExoPlayer jouerait une chaîne MPEG-2 (beaucoup de SD) son
  seul sur écran noir. `ExoPlaybackEngine.unsupportedVideo` le voit dès les pistes (`NO_UNSUPPORTED_TYPE` sur toute la
  vidéo) et `FallbackPlaybackEngine` rouvre le même flux sur `MpvPlaybackEngine` : libmpv (`dev.jdtech.mpv:libmpv`, le
  build de Findroid, FFmpeg complet), `vo=gpu-next` sur la `SurfaceView` de `MpvSurface`, `hwdec=mediacodec` pour les
  codecs que l'appareil a, FFmpeg sinon. Le lecteur ne voit qu'une phase de chargement qui continue ; `usesMpv` choisit
  la surface. Pièges : mpv ouvert sans surface abandonne la vidéo pour de bon (le `loadfile` attend `attach`) ; la
  surface détruite doit passer `vo=null` avant `detachSurface` ; les sous-titres, mpv les dessine lui-même (pas de
  `SubtitleView`) ; pas de carte média système pendant mpv (la session est celle d'ExoPlayer). Si mpv ne décode pas
  non plus, le dialogue « Image non prise en charge » ; l'aperçu du Direct, ExoPlayer seul, dit « lisible en plein
  écran ». `abiFilters` arm64 seul : libmpv pèse 24 Mo par ABI (APK debug 72 Mo, release 32 Mo).
- **Marqueurs** : Media3 ne lit pas les chapitres Matroska ; `POST /playback/{id}/markers` part avec la durée et une
  liste de chapitres vide. Le serveur ne peut donc donner que ce qu'IntroDB/SkipDB connaissent, pas le dernier chapitre.
- **Pannes** : un seul chemin (`handleStreamFailure`) : source suivante, deux essais, puis le dialogue ; seuils dans
  `PlayerService` (10 s sans image, 15 s de rebuffering en VOD, une fin à plus de 60 s de la durée est une coupure).
- **Vu** : passé le début du générique, le rapport de progression part à la durée (le serveur marque vu), comme l'app
  Apple, pas de `setWatched` à part. La progression part toutes les 10 s, à la pause et à l'arrêt ; hors ligne elle
  attend dans `ProgressQueue` (préférences) et rejoue au prochain succès.
- **Sous-titres** : `SubtitleView` de media3-ui (une `AndroidView`), nourrie par les cues du moteur : SRT/ASS/PGS d'un
  MKV. media3-ui-compose 1.9 n'a pas de vue de sous-titres Compose.
- **Surface** : `ContentFrame` de media3-ui-compose (SurfaceView, `ContentScale.Fit`). Les API Media3 hors `common`
  demandent `@androidx.annotation.OptIn(UnstableApi::class)` (le `@OptIn` de Kotlin ne vaut pas pour ce marqueur).
- **Image dans l'image** : `supportsPictureInPicture` dans le manifeste, ratio pris de `videoSize`, entrée automatique
  au geste d'accueil pendant la lecture (Android 12+). Fenêtre fermée = lecteur arrêté (l'activité est alors `CREATED`,
  pas `STARTED`) ; l'app quittée sans PiP met en pause.
- **Session média** : `PlaybackService`, un `MediaSessionService` de Media3 démarré avec le premier flux et arrêté
  avec le moteur, prête la session du lecteur au système : notification, écran de verrouillage, réglages rapides,
  et le processus reste au premier plan pendant la lecture. Le lecteur lui-même reste dans `ExoPlaybackEngine`.
  Démarré par `startService` (pas `startForegroundService`) et la session lui est remise dans `onStartCommand`
  (`addSession`) : c'est Media3 qui passe le service au premier plan quand la lecture démarre et l'en sort quand la
  session est libérée (la session se libère avant `stopSelf`). Démarré au premier plan par nous sans que Media3
  connaisse la session, le système tuait l'app 30 s plus tard (`ForegroundServiceDidNotStartInTimeException`).
- **Liens `kanstrimi://open/<id>` et `kanstrimi://play/<id>`** (`DeepLink`) : une fiche poussée, un titre lu où il
  en était, une chaîne jouée ; seuls nos identifiants passent. `MainActivity` est `singleTask` : un lien reçu en
  cours de route arrive par `onNewIntent`.
- **Retour après 10 min d'absence** (`AbsenceClock`, `resumeRevision`) : l'accueil et le Direct se rechargent.
- **Release** : R8 avec `proguard-rules.pro` (sérialiseurs de kotlinx.serialization, classes JNI du décodeur
  FFmpeg), signée avec la clé de debug tant qu'une clé de release n'existe pas : installable, pas publiable.
  `./gradlew assembleRelease` → `app/build/outputs/apk/release/app-release.apk` (11 Mo contre 51 en debug).
- **Qualité** : plafond FHD par défaut (`Preferences.maxQuality`), capacités de la tablette dans `VersionChooser.Capabilities.tablet`
  (pas de Dolby Vision : la version 4K DV n'est jamais choisie d'office).

## Vérifier

- **À chaque modification** : `./gradlew testDebugUnitTest lintDebug assembleDebug` dans `android/` (JDK 21 :
  `JAVA_HOME=$(/usr/libexec/java_home -v 21)` ; `local.properties` pointe sur le SDK). Lint échoue sur une erreur,
  pas sur un avertissement.
- **Écrans** : `scripts/shot-all.sh` compile, installe et capture ; `scripts/shot.sh <écran>` un seul (dont
  `Recherche-resultats`, `Fiche-film`, `Fiche-serie`, `Direct`, `Lecteur-pause`, `Lecteur-chargement`, `Lecteur-echec`,
  `Lecteur-episode-suivant`, `Lecteur-passer-intro`, `Lecteur-direct`). L'émulateur
  se crée une fois par `scripts/avd.sh` et démarre sans fenêtre. Les hooks `debug.mock`, `debug.autopair`, `debug.unpair`,
  `debug.tab`, `debug.open` (un id de titre ou de saga, sa fiche poussée au-dessus de l'onglet), `debug.search` (la requête de
  départ de la recherche), `debug.play <id>` (un titre, ou `live` / `live:<id>` pour une chaîne de la démo ;
  + `debug.playerState vodPaused | opening | failure | nextEpisode | nextTitle | panel | skipIntro | livePlaying`,
  le lecteur mis en scène sans flux), `debug.playUrl <url>` (un fichier public, jamais le fournisseur) et `debug.codecs`
  (les décodeurs vidéo de l'appareil sous le tag `kanstrimi.codecs`) sont des extras
  de l'intent de lancement (`adb shell am start … --ez debug.mock true --es debug.tab home`). La première mise en plein
  écran affiche l'aide système « Viewing full screen » : la fermer une fois (`adb shell input tap`) avant les captures.
- **Moteur** : `debug.playUrl` avec un fichier de test public (MKV Matroska test5 : H.264, AAC, SRT ; un MKV DTS de
  samples.mplayerhq.hu : le son passe par FFmpeg) et `adb logcat -s kanstrimi.player` : les décodeurs choisis
  (`c2.android.avc.decoder`, `ffmpegLavc…-dca`) et les phases ; le panneau Infos montre MediaCodec / FFmpeg. En debug,
  l'`EventLogger` de Media3 (tag `EventLogger`) liste les pistes et pourquoi une est écartée (`supported=…`). Un
  fichier local se sert par `python3 -m http.server 8765` + `adb reverse tcp:8765 tcp:8765` et `http://localhost:8765/…`
  (`ffmpeg -f lavfi -i testsrc2 … -c:v mpeg2video -f mpegts` fabrique un flux MPEG-2 sans fournisseur).
- **Appareil réel** : `adb install -r app/build/outputs/apk/debug/app-debug.apk`, l'appairage se fait par l'admin.

## Licence

[PolyForm Strict 1.0.0](../LICENSE.md) — voir le [README principal](../README.md#licence).
