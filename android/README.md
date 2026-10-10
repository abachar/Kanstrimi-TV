# Kanstrimi — app Android (tablette)

`android/` : **une app Kotlin + Jetpack Compose**, tablette d'abord (Galaxy Tab S9 ; les téléphones viendront par
l'adaptatif). AGP 9, Kotlin 2.4, Compose BOM 2026.09, Material 3 adaptive (rail ou barre selon la largeur), Coil pour
les images, OkHttp + kotlinx.serialization pour `/player`. Lecteur à venir : Media3 ExoPlayer avec le décodeur FFmpeg
de Jellyfin (`org.jellyfin.media3:media3-ffmpeg-decoder`, qui fixe la version de Media3) pour DTS et TrueHD, absents
de la Tab S9 ; la vidéo par MediaCodec, HDR10+ natif, pas de Dolby Vision sur cet appareil.

## Structure

| Dossier (`app/src/main/kotlin/dev/crafters/kanstrimi/`) | Rôle |
|---|---|
| `contract/` | `Wire.kt` : les types calqués sur `server/src/player/types.ts`, kotlinx.serialization, clés inconnues ignorées, valeur d'énumération inconnue → `OTHER`. |
| `client/` | `CatalogClient` (une méthode par route), `HttpCatalogClient` (le serveur : jeton Bearer en HTTPS ou sur le LAN seulement, 502-504 du proxy retentés deux fois sur un GET, 401 → appareil dissocié), `MockCatalogClient` (le client de démo). |
| `app/` | `KanstrimiApplication` (cache disque des images), `AppEnvironment` (préférences, appareil, client, info du serveur, notice, `open(id)` / `navigate(route)`), `Navigation.kt` (`Route`, `Navigator` : une pile d'écrans par onglet, tenue à la main), `DeviceStore` (jeton et code), `Preferences`, `MainActivity` (hooks `debug.*`). |
| `ui/` | `RootView` (appairage puis onglets, notice), `MainTabs` (`NavigationSuiteScaffold` ; chaque onglet visité et chaque écran sous le sommet de sa pile restent composés mais ni mesurés ni dessinés, pour garder données et défilement), `Metrics.kt` (largeur d'affiche, marge, colonnes, lues de la largeur de la fenêtre : six affiches en paysage, cinq en portrait ; `LocalMetrics`), `Cards.kt` (cartes bêtes : un `ContentItem` et une action, le parent donne la largeur ; `MenuPoster` ajoute le menu d'appui long Lecture / Voir la fiche), `Pieces.kt` (badges, art, logo ou titre, états, `LoadedScreen`, bouton Retour), `theme/`. |
| `features/` | Un dossier par écran : `home`, `catalog` (Films et Séries, grille paginée et filtres, sagas, acteur ; `Paginator`), `search`, `detail` (fiche film et série, épisodes, distribution, feuille des versions), `pairing`, `settings`. Direct et lecteur arrivent par lots. |
| `../scripts/` | `avd.sh` (crée l'émulateur « Tablet », 2 560 × 1 600 à 280 dpi), `shot.sh` / `shot-all.sh` (captures du client de démo dans `ui-review/`, hors git). |
| `app/src/test/` | `ContractTest` : décode chaque réponse enregistrée par le serveur ; `HttpCatalogClientTest`. |

## Choix

- **Le contrat est partagé** : les golden files de `apple/kanstrimiTests/Contract/` sont lus tels quels par
  `ContractTest` (chemin relatif) et embarqués comme assets du client de démo (`app/build.gradle.kts`). Un seul jeu de
  réponses pour les trois clients ; la CI du serveur les régénère.
- **Client léger** : les textes viennent écrits du serveur (`facts`, `badges`, `play_label`…), l'app les pose.
- **Jeton** : préférences privées de l'app (bac à sable, chiffrement au repos par Android), exclu des sauvegardes et
  des transferts (`xml/data_extraction_rules.xml`, `xml/backup_rules.xml`).
- **Une version** pour tous : `versionName` suit `MARKETING_VERSION` et `server/package.json`.
- **Français** à l'écran, anglais dans les commentaires, comme partout.

## Vérifier

- **À chaque modification** : `./gradlew testDebugUnitTest lintDebug assembleDebug` dans `android/` (JDK 21 :
  `JAVA_HOME=$(/usr/libexec/java_home -v 21)` ; `local.properties` pointe sur le SDK). Lint échoue sur une erreur,
  pas sur un avertissement.
- **Écrans** : `scripts/shot-all.sh` compile, installe et capture ; `scripts/shot.sh <écran>` un seul. L'émulateur se
  crée une fois par `scripts/avd.sh` et démarre sans fenêtre. Les hooks `debug.mock`, `debug.autopair`, `debug.unpair`,
  `debug.tab`, `debug.open` (un id de titre ou de saga, sa fiche poussée au-dessus de l'onglet) et `debug.search` (la requête
  de départ de la recherche) sont des extras de l'intent de lancement
  (`adb shell am start … --ez debug.mock true --es debug.tab movies --es debug.open tmdb:movie:603`).
- **Appareil réel** : `adb install -r app/build/outputs/apk/debug/app-debug.apk`, l'appairage se fait par l'admin.

## Licence

[PolyForm Strict 1.0.0](../LICENSE.md) — voir le [README principal](../README.md#licence).
