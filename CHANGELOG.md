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
