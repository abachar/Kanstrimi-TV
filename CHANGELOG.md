# Changelog

Tous les changements notables de ce projet seront documentés dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

---

## [0.11.1] - 2025-10-31

### Corrigé
- **Affichage des catégories** : Correction du bug empêchant l'affichage des catégories dans LiveTV, Movies et Series
  - Problème : Les `#Predicate` SwiftData ne supportent pas les comparaisons avec enum
  - Solution : Migration de `contentType` de `Category.ContentType` (enum) vers `String` dans le modèle SwiftData
  - Impact : LiveTVView, MoviesView et SeriesView affichent maintenant correctement les catégories existantes
  - Fichiers modifiés : `Category.swift`, `LiveTVView.swift`, `MoviesView.swift`, `SeriesView.swift`, `CategoryService.swift`

- **Enrichissement TMDB des Details** : Correction du bug empêchant l'enrichissement TMDB des films et séries
  - Problème : `syncAccount` créait des `MovieDetail` et `SeriesDetail` partiels, puis `loadDetailsIfNeeded` les trouvait existants et ne les enrichissait jamais avec TMDB (casting, images, etc.)
  - Solution : Suppression de la création des Details dans `syncAccount`, et vrai lazy loading via `loadDetailsIfNeeded`
  - Impact : Les images des acteurs et données TMDB sont maintenant correctement chargées à l'ouverture des fiches détaillées
  - Fichiers modifiés : `AccountService.swift`, `MovieService.swift`, `SeriesService.swift`

### Modifié
- **Modèle Category** : `contentType` stocké comme `String` au lieu de `Category.ContentType` (enum)
  - L'enum `ContentType` est conservé pour la validation et la sécurité de type (utilisé dans l'init)
  - Conversion automatique vers String lors de la création : `self.contentType = contentType.rawValue`
  - Permet l'utilisation de Predicates efficaces : `#Predicate { $0.contentType == "live" }`

- **AccountService.syncAccount()** : Ne crée plus les `MovieDetail` et `SeriesDetail` lors de la synchronisation
  - Suppression de la création de `MovieDetail` (étape Movies)
  - Suppression de la création de `SeriesDetail` (étape Series)
  - Les Details sont maintenant créés à la demande via `loadDetailsIfNeeded`

- **MovieService.loadDetailsIfNeeded()** : Gestion complète de la création et de l'enrichissement des `MovieDetail`
  - Vérifie si le `MovieDetail` existe et est déjà enrichi (genre != nil)
  - Si absent : crée un nouveau `MovieDetail` complet avec données Xtream + TMDB
  - Si présent mais non enrichi : enrichit avec données Xtream + TMDB
  - Charge systématiquement les images des acteurs via TMDB API

- **SeriesService.loadDetailsIfNeeded()** : Documentation clarifiée
  - Crée le `SeriesDetail`, les saisons et épisodes à la demande (lazy loading)
  - Commentaire mis à jour pour refléter la création au lieu de l'enrichissement

### Technique
- **Architecture optimisée** : Chaque vue filtre uniquement ses catégories via Predicate (pas de chargement de toutes les catégories)
- **SwiftData Predicates** : `#Predicate<Category> { $0.contentType == "live" }` fonctionne maintenant correctement
- **CategoryService** : Mise à jour de `deleteCategories()` pour utiliser `contentType.rawValue`
- **Amélioration mémoire** : Filtrage au niveau de la base de données, pas en mémoire
- **Lazy loading véritable** : Les Details ne sont créés que lors de l'ouverture des fiches détaillées
- **Performances synchro** : Synchronisation plus rapide (pas de création de milliers de MovieDetail/SeriesDetail)
- **Enrichissement TMDB** : Chargement systématique des castImages (images des acteurs) à l'ouverture

### Note de migration
- ⚠️ **Breaking change SwiftData** : Modification du type de `Category.contentType` (enum → String)
- ⚠️ **Breaking change Architecture** : Les Details ne sont plus créés pendant la synchronisation
- ⚠️ Réinstallation de l'application requise (changement de schéma SwiftData)

---

## [0.11.0] - 2025-10-31

### Refactorisé
- **Architecture Domain** : Refactorisation majeure du Domain Layer en architecture service-oriented
  - `DomainService` transformé en façade coordonnant des services spécialisés
  - Nouveau `CategoryService` pour gestion des catégories (Live, Movies, Series)
  - Nouveau `LiveChannelService` pour gestion des chaînes Live TV
  - Nouveau `MovieService` pour gestion des films VOD (avec loadDetailsIfNeeded)
  - Nouveau `SeriesService` pour gestion des séries TV (avec loadDetailsIfNeeded)
  - Nouveau `SettingsService` pour gestion des paramètres et statistiques
  - `AccountService` refactorisé pour utiliser les services spécialisés (au lieu de manipulation directe du context)

- **Modèle Category unifié** : Fusion de LiveCategory, MoviesCategory, SeriesCategory
  - Nouveau modèle `Category` avec enum `ContentType` (.live, .movies, .series)
  - Suppression de 3 modèles SwiftData → modèle unique
  - Filtrage via `@Query` avec `#Predicate { $0.contentType == .live }`
  - Simplification de l'architecture et facilitation des features cross-content

- **Gestion d'erreurs unifiée** : Création de `NetworkError` centralisé
  - Suppression de `XtreamError` et `TMDBError`
  - `NetworkError` utilisé par XtreamService et TMDBService
  - Nouveau `NetworkService` pour mutualiser la logique HTTP
  - `XtreamService` et `TMDBService` refactorisés pour utiliser `NetworkService.request()` (élimination duplication code)

- **Conversion Response → Model** : Méthodes de conversion dans les Response structs
  - `LiveCategoryResponse.toCategory()`, `VODCategoryResponse.toCategory()`, `SeriesCategoryResponse.toCategory()`
  - `LiveChannelResponse.toLiveChannel()`
  - `MovieResponse.toMovie()` et `MovieResponse.toMovieDetail()`
  - `SeriesResponse.toSeries()` et `SeriesResponse.toSeriesDetail()`
  - Responsabilité de conversion déplacée dans les Response models (architecture claire)

### Ajouté
- **ARCHITECTURE.md** : Section "Règles strictes" documentant les nouvelles contraintes
  - DomainService comme point d'entrée unique (interdiction d'appel direct aux services)
  - Obligation d'utiliser composants SwiftUI natifs (pas de wrappers custom)
  - Architecture en couches clairement définie
  - Documentation du modèle Category unifié

### Technique
- Architecture façade pattern : DomainService délègue à 6 services spécialisés
- Services utilisent StorageService pour persistance (pas de manipulation directe du context)
- AccountService orchestre CategoryService, LiveChannelService, MovieService, SeriesService lors de la synchro
- Breaking change SwiftData : Nécessite réinstallation de l'app (changement schéma)
- Préparation pour futures optimisations réseau (NetworkService en place)

### Note de migration
- ⚠️ **Breaking change** : Suppression de LiveCategory, MoviesCategory, SeriesCategory du Schema SwiftData
- ⚠️ Réinstallation de l'application requise (nouveau schéma SwiftData incompatible)
- Les @Query utilisant les anciens modèles de catégories doivent être migrées vers `Category` avec filtrage `contentType`

---

## [0.3.0] - 2025-10-29

### Modifié
- **Optimisation mémoire** : Séparation des models en versions légères (listing) et détaillées (lazy loading)
  - `LiveChannel` : Conserve uniquement id, name, streamIcon, sortOrder, categoryId (~40% de réduction mémoire)
  - `Movie` : Conserve uniquement id, name, streamIcon, rating, tmdbId, sortOrder, categoryId (~50% de réduction)
  - `Series` : Conserve uniquement id, name, cover, rating, genre, sortOrder, categoryId (~70% de réduction)
  - Nouveau : `LiveChannelDetails` pour streamId, streamURL, epgChannelId, added
  - Mis à jour : `MovieDetail` avec streamId, streamURL, containerExtension, added
  - `SeriesDetail` : Inchangé (déjà optimisé)

- `PlaybackContent` : Modifié pour accepter le streamURL en paramètre au lieu de l'accéder directement depuis les models
- `AccountService` : Création automatique des Details lors de la synchro initiale
  - LiveChannelDetails créé immédiatement (nécessaire pour la lecture)
  - MovieDetail créé partiellement (sans genre, enrichi lors de l'ouverture)
  - SeriesDetail créé complètement (getSeries retourne toutes les données)

- `DomainService.loadMovieDetailsIfNeeded` : Enrichit les MovieDetails existants au lieu de les créer
- Ajout de helpers `extractedStreamId` et `extractedSeriesId` pour récupérer les IDs depuis les strings

### Note technique
- Les genres des movies ne sont pas disponibles dans la liste (getVODStreams ne les retourne pas)
- Les genres des series sont affichés dans les cards (disponibles dès la synchro via getSeries)
- Les Details sont chargés en lazy lors de l'ouverture des fiches détaillées
- **Breaking change** : Nécessite une réinstallation de l'app (changement de schéma SwiftData)

### À finaliser
- Correction de 5 erreurs de compilation restantes dans PlayerOverlay, MovieDetailView, SeriesDetailView
- Adaptation des vues pour récupérer streamURL depuis les Details avant lecture

---

## [0.2.0] - 2025-10-26

### Ajouté
- Système de gestion de compte avec persistance SwiftData
- Modèle Account (Settings/Models) avec propriétés name, serverURL, username, password
- Composant AccountFormView avec 4 champs de saisie et gestion du focus tvOS
- Vérification de l'existence d'un compte au démarrage dans WelcomeView
- Animation fluide de transition entre splash screen et formulaire d'inscription
- Flux conditionnel : splash screen (5s) si compte existe, sinon formulaire d'inscription
- Validation des champs du formulaire avec messages d'erreur
- Sauvegarde automatique du compte dans SwiftData après enregistrement

### Modifié
- WelcomeView : Ajout de @Query pour vérifier l'existence d'un compte
- WelcomeView : Intégration du formulaire d'inscription avec animation
- ContentView : Refactorisation pour gérer le callback de WelcomeView
- Account Model : Ajout de la propriété password (temporairement en clair)

## [0.1.0] - 2025-10-26

### Ajouté
- Navigation de base de l'application avec TabView
- Écran de bienvenue (WelcomeView) affiché pendant 5 secondes au démarrage
- Vue principale (MainView) avec navigation entre 5 sections
- Vue TV en direct (LiveTVView) avec placeholder
- Vue Films (MoviesView) avec placeholder
- Vue Séries (SeriesView) avec placeholder
- Vue Recherche (SearchView) avec placeholder
- Vue Paramètres (SettingsView) avec placeholder
- Flux de navigation automatique : WelcomeView → MainView
- Support complet de la palette de couleurs Kanstrimi
- Structure de dossiers Features organisée par fonctionnalité

## [0.3.0] - 2025-10-26

### Ajouté
- Service XtreamService singleton pour gérer toutes les requêtes API Xtream Codes
- Gestion d'erreurs typée avec enum XtreamError (invalidURL, invalidCredentials, networkError, decodingError, serverError, emptyResponse)
- URLBuilder type-safe (XtreamURLBuilder) pour construire les endpoints Xtream
- 11 méthodes API complètes :
  - `getAccountInfo()` : Informations du compte et du serveur
  - `getLiveCategories()` : Catégories Live TV
  - `getLiveStreams()` : Chaînes Live TV (par catégorie ou toutes)
  - `getSimpleDataTable()` : Données EPG basiques d'un stream
  - `getShortEPG()` : EPG court d'un stream
  - `getVODCategories()` : Catégories VOD
  - `getVODStreams()` : Films VOD (par catégorie ou tous)
  - `getVODInfo()` : Informations détaillées d'un film
  - `getSeriesCategories()` : Catégories de séries
  - `getSeries()` : Séries (par catégorie ou toutes)
  - `getSeriesInfo()` : Informations détaillées d'une série (saisons, épisodes)
- Configuration URLSession adaptée à tvOS (timeouts 30s/60s)
- Toutes les méthodes async/await pour un code moderne et non-bloquant
- Support complet des modèles de réponse Xtream existants (AccountInfoResponse, LiveCategoryResponse, MovieResponse, SeriesResponse, etc.)

### Technique
- Architecture : URLSession native (pas de dépendance externe Get)
- Gestion d'erreurs localisées pour affichage dans l'UI tvOS
- Type-safety complète avec enum XtreamEndpoint
- Méthode générique `request<T: Decodable>()` pour éviter la duplication de code
- Cache HTTP désactivé pour garantir des données fraîches

## [0.4.0] - 2025-10-26

### Ajouté
- Nouvelle feature Account avec architecture complète (Models/Services/Components)
- AccountService singleton pour la gestion centralisée des comptes
- SyncStep enum pour représenter les étapes de synchronisation
- SyncProgressView : composant affichant la progression de synchronisation (barre de progression, message d'étape, indicateur numérique)
- Flux de validation et synchronisation lors de la création d'un compte :
  - Validation des credentials via XtreamService.getAccountInfo
  - Synchronisation séquentielle : Live TV → Films → Séries → Finalisation
  - Affichage d'une barre de progression animée avec 5 étapes
  - Gestion des erreurs avec retour au formulaire en cas d'échec
- Méthode AccountService.createAccount() avec callback onStepChange pour la progression
- Méthode privée AccountService.syncAccount() pour orchestrer la synchronisation

### Modifié
- WelcomeView : Intégration du flux de synchronisation avec AccountService
- WelcomeView : Affichage conditionnel formulaire/progression/erreur
- WelcomeView : Renommage de saveAccount() en createAccount() pour plus de clarté
- AccountFormView : Renommage du callback onSave en onSubmit (plus générique pour create/update)
- Account model : Ajout de la propriété lastSyncDate (Date?)

### Refactorisation
- Déplacement de Account.swift : Settings/Models → Account/Models
- Déplacement de AccountFormView.swift : Settings/Components → Account/Components
- Réorganisation de l'architecture en feature Account indépendante
- Centralisation de la logique métier des comptes dans AccountService

### Technique
- Appels API séquentiels avec délais de 0.5s entre chaque étape pour meilleure UX
- Les données ne sont pas encore persistées (validation uniquement)
- Animations fluides avec withAnimation sur les changements d'étape
- Gestion des erreurs typées (XtreamError) avec messages localisés
- Build réussi sans erreur ni warning (à l'exception du warning XtreamURLBuilder existant)

## [0.5.0] - 2025-10-26

### Ajouté
- Synchronisation complète des films VOD lors de `syncAccount`
- Construction d'URL de lecture VOD avec `XtreamURLBuilder.buildVODStreamURL()`
- Persistance des catégories VOD (MoviesCategory) dans SwiftData
- Persistance des films VOD (Movie) dans SwiftData
- Mapping automatique des réponses `VODCategoryResponse` vers `MoviesCategory`
- Mapping automatique des réponses `MovieResponse` vers `Movie`
- Ordre de tri préservé (sortOrder) pour les catégories et films
- Gestion d'erreurs spécifique pour la synchronisation VOD (ne bloque pas les séries)

### Modifié
- AccountService.syncAccount() : Ajout de la synchronisation des catégories et films VOD
- XtreamURLBuilder : Ajout de la méthode `buildVODStreamURL()` pour construire les URLs de lecture VOD

### Technique
- Batch insert pour les catégories et films (insertion puis save unique)
- Fallback sur "mp4" pour containerExtension si non fourni par l'API
- Construction d'URL VOD : `{serverURL}/movie/{username}/{password}/{streamId}.{containerExtension}`
- Cohérence avec l'implémentation Live TV (même pattern de mapping et persistance)
- Build réussi sans erreur (1 warning existant sur try? non critique)

## [0.6.0] - 2025-10-26

### Ajouté
- Synchronisation complète des séries TV lors de `syncAccount`
- Persistance des catégories de séries (SeriesCategory) dans SwiftData
- Persistance des séries (Series) dans SwiftData avec métadonnées complètes
- Mapping automatique des réponses `SeriesCategoryResponse` vers `SeriesCategory`
- Mapping automatique des réponses `SeriesResponse` vers `Series`
- Support complet des métadonnées Series (cover, plot, cast, director, genre, rating, backdropPaths, youtubeTrailer, episodeRunTime)
- Ordre de tri préservé (sortOrder) pour les catégories et séries
- Gestion d'erreurs spécifique pour la synchronisation Series (ne bloque pas la finalisation)

### Modifié
- AccountService.syncAccount() : Implémentation de la synchronisation des catégories et séries
- Étape 3 de synchronisation complètement fonctionnelle (appels API + persistance SwiftData)

### Technique
- Pattern identique à la synchronisation VOD pour cohérence architecturale
- Batch insert pour les catégories et séries (insertion puis save unique)
- Récupération de toutes les séries sans filtrage par catégorie (categoryId: nil)
- Mapping `backdropPath` (Array) → `backdropPaths` (Array)
- Build réussi sans erreur ni warning
- Les 3 étapes de synchronisation sont maintenant complètes : Live TV ✅ VOD ✅ Series ✅

## [0.7.0] - 2025-10-26

### Ajouté
- Implémentation complète de SettingsView avec layout deux colonnes
- Modèle PlayerSettings (SwiftData) pour les paramètres de lecture persistés
- Struct AppInfo pour informations statiques de l'application (version, build, disclaimer)
- Composant AppInfoPanel : Panneau d'informations avec nom app et disclaimer légal
- Composant AccountSectionView : Section compte avec informations de synchronisation et actions
- Composant PlaybackSectionView : Section lecture avec paramètre de buffer (10-120 secondes)
- Composant InfoSectionView : Section informations avec version/build et boutons Licences/Crédits
- Composant SettingsSectionHeader : Header réutilisable pour sections avec icon et titre
- Composant SettingsButton : Bouton réutilisable avec 3 styles (primary, secondary, destructive)
- Layout deux colonnes : Colonne gauche (info app) / Colonne droite (sections paramètres)
- Gestion du focus tvOS complète avec animations (scale, border highlight)
- Alert de confirmation pour suppression de compte
- Overlay de progression pour rafraîchissement du compte
- Initialisation automatique du singleton PlayerSettings au démarrage

### Modifié
- SettingsView : Refonte complète avec architecture MV Feature-Based
- KanstrimiTVApp : Ajout de PlayerSettings et tous les modèles au Schema SwiftData
- SettingsView : Implémentation des actions compte (refresh, modifier, supprimer)
- SettingsView : Binding vers PlayerSettings pour modification du buffer en temps réel

### Technique
- Section Compte : Affichage date dernière synchro, compteurs (chaînes/films/séries)
- Actions compte : Refresh (avec SyncProgressView), Modifier (TODO), Supprimer (avec confirmation)
- Section Lecture : Picker horizontal avec 7 options de buffer (10s à 120s)
- Section Informations : Version dynamique depuis Bundle.main.infoDictionary
- Disclaimer légal : "Kanstrimi TV est un lecteur IPTV neutre..." (colonne gauche)
- Suppression compte : Cascade delete sur toutes les données (channels, movies, series, categories)
- Focus par défaut : Premier bouton AccountSectionView ("Rafraîchir")
- Build réussi sans erreur

## [0.8.0] - 2025-10-26

### Ajouté
- Implémentation fonctionnelle du bouton Refresh dans SettingsView
- Implémentation fonctionnelle du bouton Delete avec relance de l'application
- Méthode AccountService.refreshAccount() pour re-synchroniser les données du compte
- Méthode privée AccountService.deleteAllAccountData() pour supprimer toutes les données
- Navigation programmatique après suppression de compte (retour à WelcomeView)
- Binding resetToWelcome propagé de ContentView → MainView → SettingsView

### Modifié
- AccountService.refreshAccount() : Implémentation complète (suppression + re-synchronisation)
- SettingsView.confirmDeleteAccount() : Ajout du déclenchement de navigation après suppression
- ContentView : Ajout du state resetToWelcome avec onChange pour retour à WelcomeView
- MainView : Ajout du @Binding resetToWelcome et propagation à SettingsView
- SettingsView : Ajout du @Binding resetToWelcome pour navigation programmatique

### Technique
- Refresh : Supprime toutes les données (channels, movies, series, categories), puis re-lance syncAccount()
- Delete : Supprime toutes les données + compte, puis déclenche resetToWelcome = true
- Navigation : Utilisation de @Binding au lieu de exit(0) (conforme aux guidelines Apple)
- Animation fluide de transition lors du retour à WelcomeView (easeInOut 0.5s)
- SyncProgressView réutilisé pour afficher la progression du refresh
- Build réussi sans erreur

## [0.9.0] - 2025-10-26

### Ajouté
- Implémentation complète de la feature Search avec architecture MV Feature-Based
- SearchView : Vue principale de recherche avec 3 tabs (TV en direct, Films, Séries)
- SearchHelper : Algorithme de recherche multi-mots avec support du split sur espaces
- SearchTabButton : Bouton de tab personnalisé avec count de résultats et gestion du focus
- SearchResultsGrid : Grille générique et réutilisable pour afficher les résultats de recherche
- EmptySearchView : Vue vide contextuelle par tab (message adapté selon searchText et contentType)
- ResultLimitIndicator : Indicateur "20 sur X résultats" quand plus de 20 résultats disponibles
- Recherche activée à partir de 3 caractères minimum
- Recherche multi-mots : l'ordre des mots n'a pas d'importance ("spider man" = "man spider")
- Limitation à 20 résultats affichés par tab avec message si résultats supplémentaires
- Count de résultats dynamique affiché dans chaque tab (ex: "Films (42)")
- Barre de recherche .searchable avec clavier tvOS natif

### Fonctionnalités de recherche
- **TV en direct** : Recherche dans le champ `name` uniquement
- **Films** : Recherche dans le champ `name` (extensible pour `cast` et `plot` dans le futur)
- **Séries** : Recherche dans les champs `name`, `plot`, `cast`, `genre`
- Algorithme : `contains` case-insensitive avec split sur espaces (tous les termes doivent être présents)
- EmptySearchView par tab : chaque tab peut afficher son propre état vide indépendamment

### Architecture
- Nouvelle feature Search organisée en Views/Components/Helpers
- SearchHelper avec fonctions statiques extensibles (filterLiveChannels, filterMovies, filterSeries)
- Réutilisation des composants existants : ChannelCard, MovieCard, SeriesCard
- Décomposition en petits composants réutilisables (4 components + 1 helper)
- Queries @Query pour accéder aux données (allLiveChannels, allMovies, allSeries)
- Filtrage en mémoire avec computed properties réactives
- Documentation inline pour faciliter l'ajout futur de champs de recherche pour Films

### Modifié
- ARCHITECTURE.md : Ajout de la feature Search dans la structure du projet
- SearchView (placeholder) : Remplacement par l'implémentation complète

### Technique
- Tabs en haut avec focus tvOS géré via @FocusState
- Navigation entre tabs via focus (gauche/droite) et sélection automatique
- Grille de 5 colonnes avec LazyVGrid pour performance
- Computed properties pour filtres : filteredLive, filteredMovies, filteredSeries
- Limitation via Array.prefix(20) pour n'afficher que les 20 premiers
- Count total calculé avant limitation pour afficher "20 sur X"
- Build réussi sans erreur

## [0.10.0] - 2025-10-27

### Ajouté
- Nouvelle feature Player avec architecture MV Feature-Based complète
- Système de lecture vidéo universel supportant tous les formats IPTV
- Support dual-player : AVPlayer natif (MP4, M4V, MOV) + VLCPlayer (M3U8, TS, MKV, AVI, FLV)
- VideoPlayerType : Détection automatique du player selon l'extension du fichier
- AVPlayerWrapper : Wrapper SwiftUI pour AVPlayerViewController natif tvOS
- VLCPlayerWrapper : Wrapper SwiftUI pour TVVLCKit (formats avancés)
- PlaybackContent : Enum générique pour représenter le contenu (LiveChannel, Movie, Series futur)
- UniversalPlayerView : Vue principale du player avec détection automatique du moteur
- PlayerOverlay : Structure préparée pour Phase 2 (header, progress bar, boutons)
- Lecture Live TV fonctionnelle depuis LiveTVView et SearchView
- fullScreenCover pour affichage plein écran du player
- Gestion automatique de la lecture (play au lancement)
- Cleanup automatique des players (stop + nil sur dismiss)
- Message d'erreur en cas d'URL invalide

### Modifié
- ChannelCard : Ajout d'un Button wrapper pour déclencher la lecture
- ChannelCard : Ajout du @Binding selectedChannel pour propagation
- LiveCategoryRow : Ajout du @Binding selectedChannel et propagation aux ChannelCard
- LiveTVView : Ajout de @State selectedChannel + fullScreenCover avec UniversalPlayerView
- SearchView : Ajout de @State selectedChannel + fullScreenCover pour lecture depuis recherche
- SearchView : Propagation du binding selectedChannel au ChannelCard

### Architecture
- Nouvelle feature Player organisée en Models/Views/Components
- Shared/MediaPlayer/ pour les wrappers des players natifs (AVPlayer, VLC)
- Pattern "wrapper SwiftUI" pour intégrer UIKit (UIViewControllerRepresentable, UIViewRepresentable)
- Détection format automatique : MP4/M4V/MOV → AVPlayer, sinon → VLC
- Gestion lifecycle : Coordinator pattern pour VLCPlayer, dismantleUIView pour cleanup
- Navigation fullScreenCover : Dismiss automatique via bouton Menu télécommande

### Technique
- TVVLCKit 3.6.0 intégré via Carthage (framework déjà installé)
- AVPlayerViewController avec showsPlaybackControls = true (contrôles natifs tvOS)
- VLCMediaPlayer avec drawable UIView pour rendu vidéo
- PlaybackContent.Identifiable pour fullScreenCover(item:)
- Enum ContentType (.live, .vod) pour différencier Live TV et VOD
- Computed properties : streamURL, title, contentType
- Phase 1 : Player basique avec contrôles natifs uniquement (pas d'overlay custom)
- Phase 2 préparée : PlayerOverlay structure créée mais non utilisée

### Fonctionnalités futures (Phase 2)
- PlayerOverlay activable avec header (nom contenu + badge LIVE)
- Barre de progression pour Films/Séries (temps actuel / temps total)
- Boutons : Choix piste audio, Sous-titres, Reprendre, Episode suivant/précédent
- Bouton Info : EPG (Live TV), Plot+Covers (Films), Synopsis+Covers (Séries)
- Support lecture Films depuis MovieCard
- Support lecture Séries depuis SeriesCard avec gestion épisodes

### Notes
- VLCPlayer ne fonctionne que sur device tvOS réel (pas simulateur)
- AVPlayer fonctionne sur simulateur et device
- Détection format basée sur extension uniquement (pas Content-Type HTTP)
- Contrôles play/pause/seek gérés nativement par télécommande tvOS
- Build réussi sans erreur ni warning

## [0.11.0] - 2025-10-27

### Ajouté
- Implémentation complète de l'écran de détail des films (MovieDetailView)
- Nouveau modèle MovieDetail (SwiftData) pour stocker les informations détaillées d'un film séparément
- Nouveau modèle WatchHistory (SwiftData) pour tracker l'historique de visionnage et la progression
- MovieDetailService : Service singleton pour charger et enrichir les détails d'un film
- TMDBService : Service singleton pour interagir avec l'API TMDB (The Movie Database)
- Enrichissement automatique des films avec données TMDB (images des acteurs via API Credits)
- Navigation depuis MovieCard vers MovieDetailView via NavigationLink
- Composants UI tvOS :
  - MovieHeroSection : Section hero avec backdrop, poster et informations principales
  - PlaybackButton : Bouton d'action de lecture réutilisable (Play, Resume, Restart)
  - CastMemberCard : Carte compacte affichant un acteur avec son image
- Boutons de lecture intelligents :
  - Bouton "Lire" si film jamais visionné ou progression < 5%
  - Bouton "Reprendre" si progression > 5% et < 95%
  - Bouton "Redémarrer" visible si film déjà commencé
- Sections d'informations :
  - Hero section avec backdrop, poster, titre, année, durée, rating étoiles, genres
  - Section Synopsis avec plot complet
  - Section Réalisateur
  - Section Casting avec ScrollView horizontal des images d'acteurs (limité à 12)
- États UI complets : Loading, Error, Content
- Gestion du focus tvOS optimisée pour navigation fluide
- Intégration avec UniversalPlayerView pour lecture des films

### Modifié
- MovieCard : Ajout de NavigationLink pour navigation vers MovieDetailView
- MoviesView : Wrapping dans NavigationStack avec navigationDestination
- KanstrimiTVApp : Ajout de MovieDetail et WatchHistory au Schema SwiftData

### Nouvelle architecture
- Feature Movies/Services : MovieDetailService pour logique métier des détails
- Shared/TMDB : TMDBService, TMDBResponses, TMDBError pour intégration TMDB
- Shared/Models : WatchHistory model partagé (réutilisable pour Films et Séries)
- API TMDB intégrée avec clé Bearer token pour authentification
- Endpoint `/movie/{id}/credits` pour récupérer le casting avec images

### Technique
- MovieDetail séparé de Movie pour éviter d'alourdir le modèle principal (pattern optimization)
- Liaison logique via streamId (pas de @Relationship SwiftData pour éviter chargement automatique)
- Extraction de l'année depuis releaseDate (format YYYY-MM-DD)
- WatchHistory avec calcul automatique du pourcentage de progression et isCompleted
- Chargement asynchrone des détails avec .task {} dans MovieDetailView
- TMDBService.getMovieCredits() retourne jusqu'à 12 acteurs avec profileImageURL (w185)
- Gestion d'erreur gracieuse : affichage des données Xtream même si enrichissement TMDB échoue
- Focus states séparés pour chaque bouton (focusedPlayButton, focusedResumeButton, focusedRestartButton)
- CastMemberCard : extraction des noms depuis la liste cast (format CSV) et mapping avec images TMDB
- fullScreenCover pour lancement du player avec gestion de la position de reprise
- Build réussi sans erreur



## [Non versionné] - 2025-10-27

### Ajouté
- Modèle SeriesDetail avec informations enrichies (genre, rating, plot, director, cast, castImages, backdropPaths, youtubeTrailer)
- Modèle SeriesSeason avec informations de saison (name, overview, airDate, episodeCount, coverTmdb)
- Modèle Episode avec informations complètes d'épisode (title, overview, rating, duration, movieImage, streamURL, isWatched)
- SeriesDetailService pour charger les détails depuis Xtream et enrichir avec TMDB
- Extension TMDBService.getSeriesCredits() pour récupérer le casting des séries
- SeriesDetailView : écran de détail complet avec hero section, synopsis, réalisateur, casting, saisons et épisodes
- SeriesHeroSection : composant affichant backdrop, poster, titre, année, note, genre
- SeasonRow : composant affichant une saison avec ses épisodes en scroll horizontal
- EpisodeCard : carte compacte d'épisode avec cover, titre, durée et indicateur "vu"
- WatchedIndicator : badge visuel pour épisodes visionnés
- Navigation SeriesView → SeriesDetailView via NavigationStack
- Boutons de lecture : Play (premier épisode non vu), Reprendre (dernier épisode en cours), Redémarrer (S1E1)
- Support des épisodes dans PlaybackContent enum (.episode(Episode))
- Images des acteurs depuis TMDB (12 acteurs maximum)
- Construction automatique des URLs de streaming pour les épisodes (format Xtream)

### Modifié
- WatchHistory : ajout de episodeId optionnel pour supporter les épisodes de séries
- WatchHistory.id : format conditionnel ("watch-series-{seriesId}-{episodeId}" ou "watch-movie-{streamId}")
- SeriesCard : ajout du paramètre onTap pour navigation
- SeriesCategoryRow : ajout du paramètre onSeriesTap pour propager la navigation
- SearchView : SeriesCard avec onTap vide (TODO: navigation future)
- TMDBService refactorisé avec méthode générique fetchCredits() partagée
- SeriesDetailService.createOrUpdateEpisodes() construit les streamURLs pour chaque épisode

### Technique
- Renommage du modèle Season en SeriesSeason pour éviter conflit avec Xtream.Season (struct Codable)
- Utilisation de variables locales dans les Predicates pour éviter les erreurs de capture
- Index SwiftData sur SeriesDetail.seriesId, SeriesSeason.[seriesId, seasonNumber], Episode.[seriesId, seasonNumber]
- Gestion du focus tvOS sur les boutons de lecture, épisodes et acteurs
- Lazy loading des épisodes par saison via @Query dans SeasonRow
- Mise à jour automatique du statut isWatched basé sur WatchHistory.isCompleted (>95%)

## [Non versionné] - 2025-10-27

### Optimisé
- **MovieDetailView** : Optimisation des @Query avec #Predicate dans l'init
  - Query MovieDetail filtrée uniquement par streamId (évite de charger tous les MovieDetail)
  - Query WatchHistory filtrée par streamId ET contentType (évite de charger tout l'historique)
  - Suppression des filtres post-query dans les computed properties (déjà filtrées par Predicate)
  - Amélioration significative de la performance mémoire

### Refactoré
- **SeriesDetailView** : Refactoring complet vers architecture MV avec @Query
  - Remplacement de @State var seriesDetail par @Query avec Predicate (filtre seriesId)
  - Remplacement de @State var seasons par @Query avec Predicate + sort (filtre seriesId, tri par seasonNumber)
  - Ajout @Query pour episodes avec Predicate + sort (filtre seriesId, tri par seasonNumber/episodeNum)
  - Ajout @Query pour watchHistories avec Predicate + sort (filtre seriesId + contentType)
  - Suppression complète des états locaux (@State isLoading, @State error)
  - Suppression de TOUS les @FocusState custom (5 occurrences) → focus natif tvOS
  - Ajout de @Environment(SeriesViewModel.self) pour gérer playingContent
  - Computed property episodesBySeason pour grouper les épisodes par saison
  - Computed properties pour helper episodes (firstUnwatchedEpisode, lastWatchedEpisode, firstEpisode)
  - Simplification du body : suppression des états loading/error, affichage direct du contenu
  - Boutons de lecture natifs SwiftUI avec .buttonStyle(.borderedProminent/.bordered)
  - Section casting : remplacement de CastMemberCard par CachedImage + .hoverEffect(.lift)
  - Section seasons : passage des épisodes filtrés directement à SeasonRow
  - Suppression de toutes les méthodes manuelles : loadDetails(), refreshSeasons(), getFirstUnwatchedEpisode(), etc.

- **SeasonRow** : Simplification et suppression du state local
  - Suppression de @FocusState.Binding var focusedEpisodeId
  - Suppression de @Environment(\.modelContext)
  - Suppression de @State private var episodes (reçoit maintenant les épisodes via paramètre)
  - Ajout du paramètre episodes: [Episode] (passés directement depuis SeriesDetailView)
  - Suppression de la méthode loadEpisodes() (plus de chargement manuel)
  - Suppression du .onAppear (plus nécessaire)
  - Propagation de onEpisodeTap sans focusedEpisodeId à EpisodeCard

- **EpisodeCard** : Migration vers focus natif tvOS
  - Suppression de @FocusState.Binding var focusedEpisodeId
  - Suppression de la computed property isFocused
  - Remplacement d'AsyncImage par CachedImage (cache mémoire + disque)
  - Suppression de tous les styles custom liés au focus (background, overlay, scaleEffect, animation)
  - Ajout de .hoverEffect(.highlight) pour focus natif tvOS
  - Suppression de .focusable() et .focused() (gérés automatiquement par .hoverEffect)
  - Simplification des couleurs texte (plus de changement selon isFocused)

### Technique
- Pattern #Predicate dans l'init des Views pour filtrer les @Query dès la source
  - Évite de charger toutes les données en mémoire puis de filtrer post-query
  - Amélioration significative de la performance et de l'utilisation mémoire
- Architecture MV pure : Views observent les données via @Query, pas d'état local
- SwiftData gère automatiquement la réactivité (pas besoin de refreshSeasons() manuel)
- Focus natif tvOS : .hoverEffect() remplace complètement @FocusState custom
- Computed properties basées sur @Query pour logique dérivée (episodesBySeason, firstUnwatchedEpisode, etc.)
- Navigation via SeriesViewModel.playingContent (pattern identique à MoviesViewModel)
- Build réussi sans erreur ni warning

## [Non versionné] - 2025-10-29

### Refactoré
- **Unification du champ rating** : Consolidation des champs `rating` et `rating5based` en un seul champ `rating: Double?`
  - Suppression de `rating: String?` dans Movie et Series
  - Renommage de `rating5based: Double?` en `rating: Double?` dans Movie et Series
  - Ajout de la méthode `convertRating()` dans AccountService pour logique de conversion centralisée
  - Logique de conversion : priorité à `rating_5based` de Xtream, sinon `rating / 2` (car rating Xtream sur 10)
  - Mise à jour du protocole CardDisplayable : `rating5based` → `rating`
  - Mise à jour de GenericContentCard, MovieDetailView, SeriesDetailView, LiveChannel pour utiliser `rating`
  - Mise à jour de PlaybackContent pour utiliser `movie.rating` au lieu de `movie.rating5based`
  - Mise à jour des données de preview (Movie et Series) avec valeurs simplifiées

### Technique
- Simplification du modèle de données : -2 champs par entité (Movie et Series)
- Réduction de la taille des modèles SwiftData et amélioration de la performance
- Logique de conversion centralisée dans AccountService.convertRating()
- Compatibilité avec les réponses Xtream existantes (rating_5based prioritaire, fallback sur rating/2)
- Données de preview cohérentes avec la nouvelle structure
- Build réussi sans erreur
