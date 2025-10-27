# Architecture Kanstrimi TV

## Vue d'ensemble

Kanstrimi TV utilise une **architecture MV (Model-View)** organisée par features. Cette approche simple et efficace repose sur SwiftData pour la persistance et la réactivité, tout en gardant une séparation claire entre les couches métier, présentation et utilitaires.

## 📁 Structure du projet

```
Kanstrimi TV/
├── App/
│   └── Kanstrimi_TVApp.swift        # Entry point de l'application
├── Views/                           # Organisation par features
│   ├── Account/
│   │   ├── AccountView.swift
│   │   └── Components/
│   │       ├── AccountFormView.swift
│   │       └── SyncProgressView.swift
│   ├── LiveTV/
│   │   ├── LiveTVView.swift
│   │   └── Components/
│   │       ├── ChannelCard.swift
│   │       └── LiveCategoryRow.swift
│   ├── Movies/
│   │   ├── MoviesView.swift
│   │   └── Components/
│   │       ├── MovieCard.swift
│   │       ├── MovieCategoryRow.swift
│   │       ├── MovieDetailView.swift
│   │       └── MovieHeroSection.swift
│   ├── Series/
│   │   ├── SeriesView.swift
│   │   └── Components/
│   │       ├── SeriesCard.swift
│   │       ├── SeriesCategoryRow.swift
│   │       ├── SeriesDetailView.swift
│   │       ├── SeriesHeroSection.swift
│   │       ├── SeasonRow.swift
│   │       └── EpisodeCard.swift
│   ├── Search/
│   │   ├── SearchView.swift
│   │   └── Components/
│   │       ├── SearchResultsGrid.swift
│   │       ├── EmptySearchView.swift
│   │       ├── ChannelCardCompact.swift
│   │       ├── MovieCardCompact.swift
│   │       └── SeriesCardCompact.swift
│   └── Settings/
│       ├── SettingsView.swift
│       └── Components/
│           ├── AccountSectionView.swift
│           └── SettingsButton.swift
├── Domain/
│   ├── CommandBus.swift             # Coordination de la logique métier
│   ├── Models/                      # SwiftData models
│   │   ├── Account.swift
│   │   ├── SyncStep.swift
│   │   ├── LiveChannel.swift
│   │   ├── Category.swift
│   │   ├── Movie.swift
│   │   ├── MoviesCategory.swift
│   │   ├── MovieDetail.swift
│   │   ├── Series.swift
│   │   ├── SeriesCategory.swift
│   │   ├── SeriesDetail.swift
│   │   ├── SeriesSeason.swift
│   │   ├── Episode.swift
│   │   ├── WatchHistory.swift
│   │   ├── SettingsModel.swift
│   │   └── PlayerSettings.swift
│   └── Services/
│       └── AccountService.swift     # Service métier pour Account
└── Utilities/
    ├── Xtream/                      # Protocole Xtream Codes
    │   ├── XtreamService.swift
    │   ├── XtreamURLBuilder.swift
    │   ├── XtreamError.swift
    │   └── Responses/
    │       ├── MoviesResponses.swift
    │       ├── SeriesResponses.swift
    │       └── LiveResponses.swift
    ├── TMDB/                        # API The Movie Database
    │   ├── TMDBService.swift
    │   └── Responses/
    │       ├── TMDBMovieResponse.swift
    │       └── TMDBSeriesResponse.swift
    ├── Player/                      # Lecteurs vidéo
    │   ├── UniversalPlayerView.swift
    │   ├── AVPlayerWrapper.swift
    │   ├── VLCPlayerWrapper.swift
    │   ├── VideoPlayerType.swift
    │   └── PlaybackContent.swift
    └── CachedImage/                 # Cache d'images
        ├── CachedImage.swift        # Composant SwiftUI
        ├── ImageCache.swift         # Cache mémoire/disque
        └── ImageCacheConfig.swift   # Configuration
```

## 🎯 Principes architecturaux

### 1. Model-View (MV)

- **Models** (`Domain/Models/`) : SwiftData models avec `@Model` macro
- **Views** (`Views/`) : SwiftUI views organisées par feature
- **CommandBus** (`Domain/CommandBus.swift`) : Coordination de la logique métier

### 2. Organisation par features

Chaque feature (Account, Movies, Series, LiveTV, Search, Settings) possède :
- Une **vue principale** (ex: `MoviesView.swift`)
- Des **composants** dans `/Components` (ex: `MovieCard.swift`, `MovieDetailView.swift`)
- Utilisation des **Models** partagés dans `Domain/Models/`

### 3. Gestion de l'état

#### Local State
Les vues principales gèrent l'état localement avec `@State` :
```swift
struct MoviesView: View {
    @State private var selectedMovie: Movie?
    @State private var playingContent: PlaybackContent?

    // Passe selectedMovie aux enfants via @Binding
}
```

#### SwiftData Queries
Les vues lisent directement depuis SwiftData avec `@Query` :
```swift
@Query(sort: \Movie.sortOrder) private var movies: [Movie]
```

#### CommandBus
Pour la logique métier complexe, utilisez CommandBus :
```swift
await CommandBus.shared.loadMovieDetailsIfNeeded(movie: movie, context: modelContext)
```

Le CommandBus :
- Vérifie si les données existent déjà
- Appelle les services (Xtream, TMDB) si nécessaire
- Insère/met à jour les données dans SwiftData
- La vue observe automatiquement les changements via `@Query`

### 4. Navigation

#### fullScreenCover pour navigation modale
```swift
.fullScreenCover(item: $selectedMovie) { movie in
    MovieDetailView(movie: movie, playingContent: $playingContent)
}
```

#### Binding pour communication enfant → parent
```swift
// Parent
@State private var selectedMovie: Movie?
MovieCard(movie: movie, selectedMovie: $selectedMovie)

// Enfant
@Binding var selectedMovie: Movie?
.onTapGesture { selectedMovie = movie }
```

### 5. Focus & Interaction tvOS

- **Focus natif** : Utilisation de `.hoverEffect(.highlight)` au lieu de @FocusState custom
- **Interaction** : `.onTapGesture {}` pour déclencher les actions
- **Pas de prop drilling** : État géré localement dans les vues principales

### 6. Images

Utilisation de `CachedImage` (même contrat qu'`AsyncImage`) avec cache mémoire + disque :
```swift
CachedImage(url: URL(string: movie.streamIcon ?? "")) { phase in
    switch phase {
    case .success(let image):
        image.resizable()
    case .empty:
        ProgressView()
    case .failure:
        Image(systemName: "film.fill")
    }
}
```

### 7. Couleurs

- **Couleurs natives SwiftUI** uniquement : `.primary`, `.secondary`, `.blue`, `.gray`, etc.
- **Pas de couleurs custom** : Suppression de tous les fichiers `Colors/`
- **Opacité** pour les nuances : `Color.gray.opacity(0.3)`

## 🔄 Flux de données

### Lecture (Query)
```
SwiftData Store → @Query → View (affichage)
```

### Écriture (Command)
```
User Action → View → CommandBus → Services (Xtream/TMDB) → SwiftData insert → @Query (auto-update)
```

### Exemple concret : Chargement de détails de film
1. User clique sur MovieCard → `selectedMovie = movie`
2. `fullScreenCover` affiche `MovieDetailView(movie: movie)`
3. `MovieDetailView.task` appelle `CommandBus.shared.loadMovieDetailsIfNeeded()`
4. `CommandBus` vérifie si `MovieDetail` existe déjà via `FetchDescriptor`
5. Si absent → appelle `XtreamService.getVODInfo()` + `TMDBService.getMovieCredits()`
6. Insère `MovieDetail` dans SwiftData
7. `@Query private var movieDetails: [MovieDetail]` se met à jour automatiquement
8. La vue se rafraîchit avec les nouveaux détails

## 📦 Dépendances externes

- **SwiftData** : Persistance et réactivité
- **SwiftUI** : Interface utilisateur
- **TVVLCKit** : Lecteur vidéo pour formats non supportés par AVPlayer (M3U8, MKV, etc.)
- **Xtream Codes API** : Source de données pour Live TV / Movies / Series
- **TMDB API** : Enrichissement des métadonnées (affiches, casting, synopsis)

## 🚀 Prochaines étapes

- [ ] Implémenter la gestion des favoris
- [ ] Ajouter un système de recommandations
- [ ] Optimiser les performances avec pagination
- [ ] Ajouter des tests unitaires pour CommandBus et Services

## 📝 Notes importantes

1. **Éviter prop drilling** : Utiliser l'état local dans les vues principales, passer uniquement les bindings nécessaires
2. **SwiftData est la source de vérité** : Toutes les données passent par SwiftData, les vues observent via @Query
3. **CommandBus ne retourne rien** : Il modifie SwiftData, les vues observent automatiquement
4. **Focus natif tvOS** : `.hoverEffect()` au lieu de @FocusState custom
5. **CachedImage partout** : Remplacement d'AsyncImage pour bénéficier du cache disque
