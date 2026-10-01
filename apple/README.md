# Kanstrimi — app Apple (Apple TV, iPhone ; iPad à venir)

`kanstrimi.xcodeproj` : **une cible `kanstrimi`, deux destinations** (tvOS 27 et iOS 27, plus l'extension tvOS `TopShelf`,
`TARGETED_DEVICE_FAMILY = 1,3` ; l'iPad ajoutera `2`). SwiftUI en français (`developmentRegion = fr` : les contrôles système suivent), Swift 6 (isolation `MainActor`
par défaut), Swift Testing, **AetherEngine 7.x en SPM** (`superuser404notfound/AetherEngine`, `upToNextMajorVersion` depuis
7.24.0 ; il tire `FFmpegBuild` et `LibDovi`). FFmpeg démuxe, VideoToolbox décode, le moteur pilote l'affichage
(HDR, Dolby Vision) sur tvOS. Le fournisseur ne sert pas de HLS : le moteur lit tout (TS en direct, MKV et MP4 en
VOD), sans relais ni AVPlayer d'hôte. Un seul moteur côté lecteur ; le direct en ouvre un second, muet, pour son aperçu.
**Build tvOS Simulateur en arm64 seulement** (`LibDovi` n'a pas de tranche x86_64 : `ARCHS=arm64 ONLY_ACTIVE_ARCH=NO`
en ligne de commande).

## Structure

| Dossier | Rôle |
|---|---|
| `App/` | `KanstrimiApp` (les seuls `#if` hors des fichiers dédiés : l'adaptateur `AppDelegate` d'iOS), `AppEnvironment` (services partagés, onglet courant, piles de navigation), `Navigation.swift` (`MainTab`, `Route`, covers tvOS, chrome iOS), `RootView` (appairage puis onglets, cover du lecteur, hooks de debug), `Preferences`, `DeviceStore` (jeton en Keychain), `OrientationLock+iOS` (rotation libre du lecteur, bouton plein écran). |
| `Contract/` | Types calqués sur `/player` (`server/src/player/types.ts`) : `Card` unique, `Version`, `Source`, `Season`, `Episode`, `Channel`, `Playback`… `nonisolated`, jamais sur la base. |
| `Client/` | Protocole `CatalogClient` ; `HTTPCatalogClient` (le serveur, URL compilée dans `Preferences.compiledServerURL`, jeton d'appareil en Keychain, erreurs mappées sur `CatalogError`, un GET retenté deux fois après 0,5 s puis 1,5 s sur une connexion tombée ou un 502-504 du proxy sans erreur JSON du serveur ; jamais une écriture, ni un délai dépassé) ; `MockCatalogClient` sur les fixtures JSON de `Client/Fixtures/` et ses `MockScenario` ; `SwitchingCatalogClient` bascule entre les deux. |
| `Player/` | Le lecteur, service transverse unique : `PlayerService` (AetherEngine, bascule de source, échec après 10 s, chien de garde des gels, relances du direct, avance rapide, épisode suivant, zapping), `VersionChooser` (langue × qualité × capacités de l'appareil), `PlayerScreen` (état, overlays et panneaux communs) avec `PlayerScreen+tvOS` (télécommande, `PressCatcher`) et `PlayerScreen+iOS` (gestes, contrôles tactiles), `VideoSurface` (héberge la vue du moteur en SwiftUI), `SubtitleOverlay` (sous-titres dessinés par l'app), `PictureInPicture+iOS` / `+tvOS` (le Picture-in-Picture d'iOS ; sur tvOS, rien à brancher). |
| `Features/` | Un dossier par écran : Appairage, Accueil, Catalogue, Fiche, Direct, Recherche, Réglages. Une seule vue par écran pour les deux plateformes. |
| `Shared/` | `Platform.swift` (**`Metrics` et les modificateurs par plateforme**), `Theme` (couleurs, badges, panneaux d'état), `CardViews`, `Stores` (chaînes récentes, sources en échec, file de progression, caches). |
| `../TopShelf/` | Extension Top Shelf (tvOS seul, embarquée avec `platformFilters = (tvos)`) : `ContentProvider` lit le jeton et l'adresse du serveur dans le Keychain partagé, appelle `GET /player/top-shelf` et en fait un carrousel plein écran, style « détails ». Son petit lecteur de Keychain et son décodage du contrat sont recopiés à dessein : l'extension ne partage aucun fichier avec l'app. |
| `../Entitlements/` | `keychain-access-groups` = `$(AppIdentifierPrefix)dev.crafters.kanstrimi` pour l'app et l'extension : c'est le groupe par défaut de l'app, où le jeton était déjà rangé, donc rien à migrer. |
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

**Top Shelf** (tvOS) : six éléments au plus, composés par le serveur (dernier titre en cours, série commencée qui a reçu
un épisode depuis la dernière lecture, puis les tops films de la semaine ; titres avec fond seulement). Lecture suit
`kanstrimi://play/<id>` (film ou épisode, repris là où il en était), Plus d'infos `kanstrimi://open/<id>` (la fiche) :
`DeepLink`, `AppEnvironment.handle`. L'app écrit l'adresse du serveur dans le Keychain partagé (`DeviceStore.share`) et
appelle `topShelfContentDidChange()` après chaque lecture (`TopShelf+tvOS.swift`). Sans jeton ou hors ligne, tvOS garde
l'image fixe.

**Navigation** : `env.open(id)` est l'unique point d'entrée vers une fiche. Sur tvOS c'est un
`fullScreenCover` au-dessus des onglets ; sur iOS un push dans la `NavigationStack` de l'onglet
courant (`AppEnvironment.paths`, `Route`). La grille d'un genre, l'écran d'une saga et celui d'un acteur suivent la même règle. Le lecteur est
un `fullScreenCover` depuis la racine. L'iPhone garde cinq onglets : Réglages se
rejoint par la roue dentée de l'accueil. Sur iPhone, Films, Séries, Direct et Recherche portent le grand titre de la barre
de navigation ; la recherche garde le champ `searchable` en haut de son écran : posé sur la pile ou sur le `TabView`
avec l'onglet `role: .search`, iOS 27 (simulateur) n'affiche pas le champ dans la barre d'onglets (essayé le 2026-09-30).

**Lecteur iPhone** : il suit le téléphone, portrait ou paysage (`AppDelegate.orientations` élargi le temps de la
lecture) ; le bouton plein écran fait pivoter (`OrientationLock.rotate`). Les contrôles (`PlayerControls`) reprennent
la barre tvOS : en bas le titre, la progression (celle de l'émission en direct), les boutons de panneau à gauche
(direct : Programme · Récentes · Infos ; épisode : Épisodes · Infos ; film : Infos) et les menus Versions · Audio ·
Sous-titres à droite (un seul menu « … » s'il manque de place) ; les contrôles restent dans la zone sûre (encoche,
barre d'accueil), seuls la vidéo et les voiles vont aux bords ; la vue du moteur recale elle-même sa couche à
chaque mise en page ; en haut Fermer, PiP, plein écran ; au centre ±10 et
lecture/pause (films, épisodes), remplacés par l'indicateur de chargement. Gestes : tap = contrôles (ou ferme le
panneau), double tap gauche/droite = ±10 s, ±10 maintenu = avance/retour rapide, glisser horizontal = recherche.
Paysage : glisser vers la droite en direct = chaînes du groupe (liste à gauche, comme ◀ sur tvOS). Portrait : vidéo
centrée à son format, glisser vers le haut = chaînes en direct (liste montant du bas) ou premier panneau
(Épisodes / Infos), glisser vers le bas = fermer. Plus de zapping ni d'appui long. Picture-in-Picture (`PictureInPicture+iOS`) : le
moteur dessine soit dans un `AVPlayerLayer` (routes vidéo natives), soit dans une couche d'échantillons (route logicielle, par
exemple un direct 1080i désentrelacé) ; le contrôleur AVKit est reconstruit selon `engine.$videoRoute`, ses commandes passent par
`PlayerService` (pas de pause en direct). `PlayerService.isMinimized`
cache l'écran sans arrêter la lecture, une fois l'image dans l'image démarrée (`didStart`) : cachée
avant, la surface vidéo quitte la fenêtre et iOS abandonne. Lancée par iOS au balayage vers l'accueil (app hors premier plan), l'image dans
l'image ne cache rien : au retour, iOS la referme et remet la vidéo dans le lecteur resté ouvert. La vue du moteur est gardée par le service (le moteur ne tient ses vues
qu'en `weak`), elle survit donc à ce masquage. `Capabilities.iPhone` plafonne à la Full HD.

**Un seul choix, pas de bouton** (toutes plateformes) : Versions (fiche d'un film, « Versions · n » de l'accueil tvOS),
Langue (fiche d'une série) et l'appui long sur Lecture n'existent que si le sélecteur a plus d'une ligne
(`VersionPicker.lineCount`, une par source) ; dans le lecteur, Versions s'il y a plus d'une version, Audio avec plus
d'une piste, Sous-titres avec au moins une piste (sinon « Désactivés » serait le seul choix). Les pistes arrivent avec
la lecture : ces boutons apparaissent alors.

**Direct sur iPhone** : un menu sous le titre choisit la catégorie (Récentes, Les plus regardées, Favoris, puis les groupes rangés par
marché, « France » › « Sport »), trop nombreuses pour une ligne de pastilles.

**Chaînes les plus regardées** : pendant la lecture d'une chaîne, `PlayerService` envoie le temps regardé depuis la première image
(`POST /playback/{id}/watch-time`, toutes les 30 s, en quittant la chaîne et sur un échec ; l'aperçu du Direct ne compte pas).
Le serveur en tire la rangée d'accueil « Chaînes les plus regardées » (juste après « Reprendre ») et le rang `watched_rank` des
chaînes, d'où la catégorie « Les plus regardées » du Direct, choisie par défaut quand Récentes est vide. Une carte de chaîne
d'une rangée (`ChannelCard` : logo sur une tuile 16:9, programme en cours) lance la chaîne. Un type de rangée inconnu de
l'app (`HomeRowKind.other`) s'affiche en rangée simple au lieu de faire échouer l'accueil.

**Fiche** : Lecture/Reprendre en bouton plein, les autres actions en pastilles rondes (`IconAction`) : sur tvOS le
libellé n'apparaît que sous la pastille focalisée, sur iPhone il est toujours affiché. Ma liste = cœur
(favori, comme dans le Direct). La bande-annonce (YouTube, que le lecteur ne lit pas) s'ouvre par `openURL` : l'app
YouTube sur tvOS (`youtube://`, `LSApplicationQueriesSchemes`), bouton masqué si elle manque ; la page web ailleurs.
Sous le titre, les tags de version montrent en plein celle que Lecture joue (qualité et langue),
les autres langues en contour ; pas de note « version choisie » ni de tableau des versions.
Le titre est dessiné par son logo TMDB (`logo`, `TitleLogo`) quand le serveur en sert un, dans la boîte
`Metrics.detailLogo` ; le texte le remplace pendant le chargement et en cas d'échec.

**Distribution** (`CastRow`, 10 acteurs) : photos rondes avec nom et rôle ; film : sous les boutons, série : après les
épisodes. Un acteur ouvre `PersonView` (cover sur tvOS, push sur iPhone) : ses films puis ses séries visibles, une
section vide n'apparaît pas. Un acteur sans `id` (fiche pas encore recopiée par le serveur) n'est pas cliquable.
« Réalisation » reste en texte sous le résumé.

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
Le direct se charge avec `isLive` et `preferredDecodePath: .software` : le moteur décode lui-même (FFmpeg, désentrelacement compris)
au lieu de servir AVPlayer par son HLS local, qui attend trois groupes d'images entiers avant de démarrer. Mesuré sur simulateur
(TF1 4K, groupes de 6 à 13 s) : image en 0,6 s contre 6,0 s. Le décodage est au processeur : fluidité du 4K à juger sur Apple TV.
`liveJoinProfile: .fastZap` reste posé pour le cas où le moteur reprendrait la route HLS. L'aperçu de l'écran Direct (`PreviewPlayer`,
`Features/Live/LiveView.swift`) est un **second `AetherEngine`**, créé au premier aperçu (l'iPhone n'en crée jamais), muet
(`volume = 0`), sur la même route logicielle, qui ne touche ni la session audio ni le mode d'affichage du téléviseur (`suppressDisplayCriteria`). Le compte du
fournisseur n'autorise qu'une connexion : l'aperçu est coupé avant toute lecture.

**Réglages** (tvOS) : à gauche le nom de l'app et ce qui se lit sans se régler (appareil et code, serveur et version,
volumes du catalogue, langues, dernier import) ; à droite la liste des réglages seulement. Interrupteurs et choix y sont
des lignes dessinées par l'app (`FocusRow`, `ChoiceRow`) : le `Toggle` système laisse son titre clair sur le fond blanc de
focus, et sous tvOS 27 (Xcode 27A266a) la liste poussée par un `Picker` par défaut s'ouvre noire, même seule dans un
`NavigationStack` nu ; `ChoiceRow` ouvre un menu à la place. À retester à chaque version de tvOS.

**Moteur** : chaque lecture passe par `engine.load(url:startPosition:options:)`, avec `maxConcurrentSourceRequests: 1` (une seule
connexion, ce qui coupe aussi les requêtes parallèles spéculatives). Pas de `stop()` entre deux chargements : `load` démonte la session
précédente et garde les critères d'affichage d'un épisode au suivant ; `stop()` du service arrête le moteur et rend au téléviseur son mode.
`PlayerService` active la session audio (`setActive(true)`, sans `setCategory` : le moteur déclare la sienne) avant chaque chargement.
Les états du moteur (`playbackPhase`) se lisent ainsi : `.loading` = ouverture ; `.playing` ; `.paused` ; `.seeking`, `.rebuffering` et
`.stalled` = lecture (ou pause), sauf tant que la session n'a jamais joué (toujours ouverture) ; `.ended` = fin, ou coupure ; `.error` =
coupure. `.ended` est terminal : rejouer, c'est recharger. Le temps vient de l'horloge du moteur, échantillonnée toutes les 0,5 s (chaque
tick est une transaction de rendu, et un `Menu` ouvert clignote sous tvOS), ignoré tant qu'un saut est en vol.
Le moteur lit par `URLSession` et le `302` mène à une URL `http://` du fournisseur (un pool d'adresses IP) : `Info.plist` porte
`NSAllowsArbitraryLoads`, sans quoi App Transport Security refuse l'ouverture (`sourceOpenFailed`, « Input/output error »).

**Coupures et gels** (un seul chemin : `handleStreamFailure`, source suivante, deux nouveaux essais au même endroit avec un nouveau
jeton par le `302`, puis le dialogue). Signaux :
- **démarrage** : 10 s après le chargement sans première image ou sans `.playing` ;
- **gel** : une fois démarré, le chien de garde compte les secondes passées en `.rebuffering` ou `.stalled` : 4 s en direct, 15 s en film
  ou épisode (plus long : rouvrir un fichier distant à la nouvelle position prend du temps), compteur remis à zéro pendant les 15 s qui suivent un saut ;
- **fin** : `.ended` en direct (un direct n'a pas de fin), ou à plus de 60 s de la fin d'un film ou épisode, est une coupure ; plus
  près, c'est la fin du fichier (épisode suivant) ;
- **`.error`** du moteur, journalisé avec son type et son code ; l'échec du `throw` de `load` n'est pas compté en double ;
- **`liveSourceReset`** (direct) : la source a redémarré du début et le moteur a parqué la session. Même bascule, gardée : une relance
  à la fois, 5 s au moins entre deux (le reste est différé), 3 au plus par chaîne choisie (remis à zéro par `play(channel:in:)` et
  `retryFromServer`) ; au-delà, le dialogue d'échec directement, jamais une sortie silencieuse.
Une fois l'image affichée, un nouvel essai réussi remet le compte à zéro et efface la source des échecs.

**Pas de tampon réglable** : AetherEngine n'a pas d'équivalent au `:network-caching` de l'ancien moteur (son `forwardBufferSegments` est
une avance, pas un délai de démarrage) ; Réglages › Lecture n'a donc plus de réglage de tampon.

**Démuxeur et reprise** : le moteur démuxe avec FFmpeg (MKV, MP4, TS). La reprise d'un film
ou d'un épisode passe au chargement (`startPosition`), sans saut une fois la lecture lancée ; pas de reprise en direct.

**Sous-titres** : le moteur ne les dessine pas. `SubtitleOverlay`, posé par `PlayerScreen` au-dessus de la vidéo et sous les contrôles, observe
lui-même le moteur (repères et horloge source) et ne se redessine que si l'ensemble des repères visibles change : texte centré en bas
du cadre de l'image, 16:9 centré (taille `Metrics.subtitleSize` ; en portrait iPhone, au bas de l'image et non de l'écran, un peu plus haut),
images (PGS, DVB) placées selon leur position dans ce cadre. Aucun sous-titre au départ ; rien n'est
dessiné sans piste choisie. Dans la fenêtre de PiP logicielle, le moteur incruste lui-même les repères actifs. Changer de piste audio ou
de sous-titres recharge brièvement la session (noir d'environ 1 s, attendu).

**Carte « En lecture »** (iPhone, `NowPlaying+iOS`) : écran verrouillé, Centre de contrôle, écouteurs. `PlayerService` y publie le titre,
le sous-titre (série, ou programme en cours d'une chaîne), l'image (fond du titre, logo de la chaîne), la durée, la position et
l'état, à chaque changement d'état, de titre ou de position, pas à chaque tick : le système fait avancer le temps seul. Les commandes
passent par le service et gardent ses règles : lecture, pause, ±10 s et déplacement dans un film ; en direct, ni pause ni saut, et
précédent / suivant zappent. Par `MPNowPlayingInfoCenter` et `MPRemoteCommandCenter` directement, pas par la session du moteur
(`ownsVideoNowPlayingSession`), qui n'existe que sur la route AVPlayer et laisserait le direct sans carte. Rien sur tvOS.

**HDR et Dolby Vision** (tvOS) : pilotés par le moteur (Match Content, critères d'affichage), l'app ne fait rien. Le direct d'aperçu les supprime.

**Faits du flux** (`StreamFacts`, en bas du panneau Infos, à la place de l'ancienne ligne « version · source ») : des pastilles, l'image
puis le son, chacun derrière son icône. Image : définition (d'après la largeur lue), plage dynamique réellement affichée (SDR compris),
codec, cadence, débit (déclaré par le fichier, sinon mesuré sur ce qui a été lu : un direct n'en déclare pas). Son : langue de la version, codec et canaux de la piste en cours, Atmos. Avant que le flux soit lu, les pastilles
disent ce qu'annonce l'étiquette du fournisseur ; ensuite une pastille passe en ambre là où le flux est en dessous de cette étiquette
(« HDR10 » pour un Dolby Vision annoncé). Pastilles ambre aussi pour un film décodé par l'app, l'adaptation au contenu désactivée (tvOS),
un son réencodé ou abandonné. « Source B » n'apparaît que si la version a plusieurs sources. Les previews et états mis en scène
montrent un échantillon.

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
  d'octets fiable, un seul flux par compte ; d'où une seule connexion côté moteur, l'aperçu du direct coupé avant toute lecture,
  et une bascule de source plutôt qu'un retry aveugle.
- tvOS Simulateur : arm64 seulement (`LibDovi`).
- Simulateur Apple TV contre le serveur local (2026-10-01) : un MKV HEVC 4K reprend à 808 s, première image en 3 s (décodage
  logiciel, le simulateur n'a pas de décodeur HEVC matériel) ; une chaîne démarre en 9 s (route native : HLS local lu par AVPlayer),
  puis la source a livré moins vite que le temps réel au bout de 32 s et le gel de 4 s a relancé la lecture.
- iPhone (simulateur, sans flux réel) : portrait et paysage (bouton plein écran) vérifiés, contrôles
  tactiles, panneaux et liste des chaînes rendus dans chaque état du lecteur ; le tap passe par
  `DeviceInteractionSynthesize`, qui n'offre ni glisser ni rotation.

## Vérifié sur appareil (2026-10-01, Apple TV 4K + LG G3, iPhone)

Depuis le passage à AetherEngine : lecture des films et du direct, Dolby Vision affiché par le téléviseur (MKV profil 8, « Adapter au
contenu : Plage ») et retour du téléviseur en SDR à la fermeture (retour, bouton TV, chaîne SDR enchaînée ; le noir de quelques
secondes est la bascule HDMI), zapping du direct par la route logicielle et fluidité d'une chaîne 4K, seuil de gel du direct à 4 s
(les accrocs repartent seuls, aucune relance de trop), Atmos rendu par des AirPods Max (EAC3 + JOC copié tel quel), saut profond
dans un MKV, reprise depuis « Reprendre » et avance rapide, sous-titres dessinés par l'app, PGS et texte compris (paysage et portrait),
Picture-in-Picture d'une chaîne et d'un film sur iPhone, par le bouton du lecteur comme par le balayage vers l'accueil, et
boutons de sa fenêtre, rotation physique du téléphone, focus de la barre tvOS sur le bouton du panneau ouvert.

La pastille « Atmos » vient de `TrackInfo.isAtmos`, juste quand l'audio est en tête du fichier ; la confirmation du moteur
(`LoadOptions.confirmAtmos`) ouvrirait une seconde connexion, exclue par le fournisseur.

## Défauts constatés sur appareil

- **Retour du PiP d'une chaîne** (route logicielle, par le bouton comme par le balayage) : une fois l'image revenue au centre, un
  bref éclair montre l'image de la fenêtre PiP à la place de la vidéo, puis le direct continue. Cosmétique ; les films n'ont rien.
- **Son perdu sur le direct** sans réaction de l'app : le chien de garde ne regarde que la phase du moteur (`.rebuffering`,
  `.stalled`), un son coupé pendant `.playing` lui échappe. Cause inconnue, en attente d'un cas reproduit : relever les
  journaux `AetherEngine` et `dev.crafters.kanstrimi` (Console.app, Apple TV branchée) autour de la coupure. Le moteur
  n'expose aucun état du son ; seul `installAudioTap()` (son décodé) permettrait de voir un flux qui cesse d'envoyer du
  son, pas un tampon vidé par le système (journalisé « AE#549 », le son revient seul) ni une sortie audio perdue.

## À mesurer sur appareil

- Atmos par une barre de son en HDMI.
- Sous-titres en image (PGS) sur Apple TV, film à bandes noires. Les sous-titres ne passent pas dans la fenêtre PiP.
