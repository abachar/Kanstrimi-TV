# Changelog

Tous les changements notables de ce projet seront documentés dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

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

