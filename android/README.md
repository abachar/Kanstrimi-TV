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
| `app/` | `KanstrimiApplication` (cache disque des images), `AppEnvironment` (préférences, appareil, client, info du serveur, notice, moteur et service du lecteur, `progressRevision`, `open(id)` / `navigate(route)`), `Navigation.kt` (`Route`, `Navigator` : une pile d'écrans par onglet, tenue à la main), `DeviceStore` (jeton et code), `Preferences` (dont celles du lecteur, par `PlaybackPreferences`), `MainActivity` (hooks `debug.*`). |
| `ui/` | `RootView` (appairage puis onglets, le lecteur par-dessus quand `player.isPresented`, notice), `MainTabs` (`NavigationSuiteScaffold` ; chaque onglet visité et chaque écran sous le sommet de sa pile restent composés mais ni mesurés ni dessinés, pour garder données et défilement), `Metrics.kt` (largeur d'affiche, marge, colonnes, lues de la largeur de la fenêtre : six affiches en paysage, cinq en portrait ; `LocalMetrics`), `Cards.kt` et `UpNextCard` (cartes bêtes : un `ContentItem` et une action, le parent donne la largeur ; `MenuPoster` ajoute le menu d'appui long Lecture / Voir la fiche), `Pieces.kt` (badges, art, logo ou titre, états, `LoadedScreen`, bouton Retour), `theme/`. |
| `features/` | Un dossier par écran : `home`, `catalog` (Films et Séries, grille paginée et filtres, sagas, acteur ; `Paginator`), `search`, `detail` (fiche film et série, épisodes, distribution, feuille des versions), `pairing`, `settings`. Le Direct arrive par lot. |
| `player/` | Le lecteur, service transverse unique, calqué sur `apple/kanstrimi/Player/` : `PlayerService` (phases, versions, pannes, marqueurs, suite, progression ; il parle au moteur par `PlaybackEngine`, que les tests remplacent), `ExoPlaybackEngine` (un ExoPlayer, session média, pistes, cues), `VersionChooser`, `PlaybackReporter` (+ `ProgressQueue`, `FailedSourcesStore`), `PlaybackContext`, `PlayerScreen` (plein écran tactile, image dans l'image), `PlayerControls`, `PlayerPanels` (Épisodes · Similaires · Distribution · Infos), `PlayerOverlays` (chargement, « Passer … », « À suivre », échec, toast), `PlayerDebug` (états mis en scène, fichier public). |
| `../scripts/` | `avd.sh` (crée l'émulateur « Tablet », 2 560 × 1 600 à 280 dpi), `shot.sh` / `shot-all.sh` (captures du client de démo dans `ui-review/`, hors git). |
| `app/src/test/` | `ContractTest` : décode chaque réponse enregistrée par le serveur ; `HttpCatalogClientTest` ; `player/` : `VersionChooserTest`, `ProgressQueueTest`, `PlayerServiceTest` (faux moteur `FakePlaybackEngine` : bascule de source, essais, dialogue, coupure, générique, suite, marqueurs, progression). |

## Choix

- **Le contrat est partagé** : les golden files de `apple/kanstrimiTests/Contract/` sont lus tels quels par
  `ContractTest` (chemin relatif) et embarqués comme assets du client de démo (`app/build.gradle.kts`). Un seul jeu de
  réponses pour les trois clients ; la CI du serveur les régénère.
- **Client léger** : les textes viennent écrits du serveur (`facts`, `badges`, `play_label`…), l'app les pose.
- **Jeton** : préférences privées de l'app (bac à sable, chiffrement au repos par Android), exclu des sauvegardes et
  des transferts (`xml/data_extraction_rules.xml`, `xml/backup_rules.xml`).
- **Une version** pour tous : `versionName` suit `MARKETING_VERSION` et `server/package.json`.
- **Français** à l'écran, anglais dans les commentaires, comme partout.

## Lecteur : choix et pièges

- **Un seul ExoPlayer** : construit au premier `load`, libéré à `stop()` ; un changement de source ou de titre
  réutilise l'instance (`stop` ferme la connexion avant que `prepare` n'en ouvre une autre, les deux passent par le
  thread de lecture dans l'ordre). Le fournisseur ne voit jamais deux connexions de l'app.
- **Décodeurs** : `DefaultRenderersFactory` sans extension par réflexion ; `FfmpegAudioRenderer`
  (`androidx.media3.decoder.ffmpeg`, le nom de classe est celui du module AndroidX, Jellyfin ne le renomme pas) ajouté
  explicitement après les renderers MediaCodec, donc pris seulement quand l'appareil n'a pas le codec. Décoder
  fallback activé. Les décodeurs « goldfish » de l'émulateur échouent au premier buffer sous GPU logiciel : ils sont
  filtrés par le `MediaCodecSelector` (aucun appareil réel n'en a).
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
- **Session média** : une `MediaSession` sur le lecteur (écouteurs, touches). La carte des réglages rapides demande
  un `MediaSessionService` avec notification : pas fait.
- **Qualité** : plafond FHD par défaut (`Preferences.maxQuality`), capacités de la tablette dans `VersionChooser.Capabilities.tablet`
  (pas de Dolby Vision : la version 4K DV n'est jamais choisie d'office).

## Vérifier

- **À chaque modification** : `./gradlew testDebugUnitTest lintDebug assembleDebug` dans `android/` (JDK 21 :
  `JAVA_HOME=$(/usr/libexec/java_home -v 21)` ; `local.properties` pointe sur le SDK). Lint échoue sur une erreur,
  pas sur un avertissement.
- **Écrans** : `scripts/shot-all.sh` compile, installe et capture ; `scripts/shot.sh <écran>` un seul (dont
  `Recherche-resultats`, `Fiche-film`, `Fiche-serie`, `Lecteur-pause`, `Lecteur-chargement`, `Lecteur-echec`,
  `Lecteur-episode-suivant`, `Lecteur-passer-intro`). L'émulateur
  se crée une fois par `scripts/avd.sh` et démarre sans fenêtre. Les hooks `debug.mock`, `debug.autopair`, `debug.unpair`,
  `debug.tab`, `debug.open` (un id de titre ou de saga, sa fiche poussée au-dessus de l'onglet), `debug.search` (la requête de
  départ de la recherche), `debug.play <id>` (+ `debug.playerState vodPaused | opening | failure | nextEpisode | nextTitle | panel | skipIntro`,
  le lecteur mis en scène sans flux) et `debug.playUrl <url>` (un fichier public, jamais le fournisseur) sont des extras
  de l'intent de lancement (`adb shell am start … --ez debug.mock true --es debug.tab home`). La première mise en plein
  écran affiche l'aide système « Viewing full screen » : la fermer une fois (`adb shell input tap`) avant les captures.
- **Moteur** : `debug.playUrl` avec un fichier de test public (MKV Matroska test5 : H.264, AAC, SRT ; un MKV DTS de
  samples.mplayerhq.hu : le son passe par FFmpeg) et `adb logcat -s kanstrimi.player` : les décodeurs choisis
  (`c2.android.avc.decoder`, `ffmpegLavc…-dca`) et les phases ; le panneau Infos montre MediaCodec / FFmpeg.
- **Appareil réel** : `adb install -r app/build/outputs/apk/debug/app-debug.apk`, l'appairage se fait par l'admin.

## Licence

[PolyForm Strict 1.0.0](../LICENSE.md) — voir le [README principal](../README.md#licence).
