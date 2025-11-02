# Guide d'implémentation avec @Observable

**Date:** 2 Novembre 2025
**Projet:** Kanstrimi TV (tvOS/SwiftUI)
**Solution:** Architecture @Observable natif SwiftUI + SwiftData

---

## Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Architecture proposée](#architecture-proposée)
3. [Implémentation étape par étape](#implémentation-étape-par-étape)
4. [Exemples concrets](#exemples-concrets)
5. [Migration progressive](#migration-progressive)
6. [Avantages et limitations](#avantages-et-limitations)

---

## Vue d'ensemble

### Principe de base

Avec **@Observable** (iOS 17+/tvOS 17+), on crée des **Stores observables** qui :
- ✅ Contiennent l'état runtime en mémoire
- ✅ Sont réactifs automatiquement (SwiftUI redessine quand l'état change)
- ✅ Peuvent utiliser des propriétés computed pour filtrer/transformer les données
- ✅ Utilisent SwiftData uniquement pour la persistance (lecture/écriture)

### Différence avec l'approche actuelle

#### AVANT (@Query direct)
```swift
struct SearchMovies: View {
    @State private var searchText = ""
    @Query private var filteredMovies: [Movie]  // ❌ Predicate figé !

    init() {
        // Predicate créé UNE FOIS avec searchText = ""
        _filteredMovies = Query(filter: predicate)
    }
}
```

#### APRÈS (@Observable Store)
```swift
@Observable
final class MoviesStore {
    var allMovies: [Movie] = []
    var searchText: String = ""

    // ✅ Computed property réactive !
    var filteredMovies: [Movie] {
        guard searchText.count >= 3 else { return [] }
        return allMovies.filter {
            $0.name.localizedStandardContains(searchText) && $0.active
        }
    }

    func loadMovies() async {
        allMovies = await fetchFromSwiftData()
    }
}

struct SearchMovies: View {
    @Environment(MoviesStore.self) private var store

    var body: some View {
        List(store.filteredMovies) { movie in  // ✅ Réactif !
            MovieCard(movie: movie)
        }
        .searchable(text: $store.searchText)  // ✅ Two-way binding
    }
}
```

---

## Architecture proposée

### Structure globale

```
┌─────────────────────────────────────────────────────────┐
│  KanstrimiTVApp                                         │
│  @State private var appStore = AppStore()              │
│  .environment(appStore)                                 │
│  .modelContainer(appStore.storageService.container)     │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  AppStore (@Observable, @MainActor)                     │
│  ├── moviesStore: MoviesStore                           │
│  ├── seriesStore: SeriesStore                           │
│  ├── liveTVStore: LiveTVStore                           │
│  ├── filtersStore: FiltersStore                         │
│  ├── accountStore: AccountStore                         │
│  └── storageService: StorageService (SwiftData)         │
└─────────────────────────────────────────────────────────┘
                          ↓
        ┌─────────────────┬─────────────────┐
        ↓                 ↓                 ↓
    MoviesStore       SeriesStore       LiveTVStore
    (runtime state)   (runtime state)   (runtime state)
        ↓                 ↓                 ↓
    StorageService    StorageService    StorageService
    (persistance)     (persistance)     (persistance)
```

### Séparation des responsabilités

| Couche | Responsabilité | Technologie |
|--------|----------------|-------------|
| **Stores** | État runtime, logique métier, réactivité | @Observable |
| **Services** | Logique métier complexe, orchestration API | Classes async/await |
| **Persistance** | Cache local, sauvegarde | SwiftData |
| **UI** | Affichage, binding | SwiftUI Views |

---

## Implémentation étape par étape

### Étape 1 : Créer le MoviesStore (Store central pour films)

**Fichier:** `Kanstrimi TV/Store/MoviesStore.swift`

```swift
import Foundation
import SwiftData

/// Store observable gérant l'état des films
@Observable
@MainActor
final class MoviesStore {
    // MARK: - État runtime

    /// Toutes les catégories de films (chargées depuis SwiftData)
    var categories: [Category] = []

    /// Tous les films par catégorie
    var moviesByCategory: [String: [Movie]] = [:]

    /// Texte de recherche
    var searchText: String = ""

    /// Film sélectionné pour affichage détail
    var selectedMovie: Movie?

    /// Détail du film sélectionné
    var selectedMovieDetail: MovieDetail?

    /// Historique de visionnage pour le film sélectionné
    var watchHistory: WatchHistory?

    /// États de chargement
    var isLoadingCategories: Bool = false
    var isLoadingDetail: Bool = false

    // MARK: - Dépendances

    private let storageService: StorageService
    private let movieService: MovieService

    // MARK: - Computed Properties (réactives !)

    /// Catégories actives seulement
    var activeCategories: [Category] {
        categories.filter { $0.active && $0.contentType == "movies" }
            .sorted { $0.sortOrder < $1.sortOrder }
    }

    /// Films filtrés par recherche (tous confondus)
    var filteredMovies: [Movie] {
        guard searchText.count >= 3 else { return [] }

        // Chercher dans tous les films de toutes les catégories
        let allMovies = moviesByCategory.values.flatMap { $0 }

        return allMovies.filter { movie in
            movie.name.localizedStandardContains(searchText) && movie.active
        }
        .sorted { $0.sortOrder < $1.sortOrder }
    }

    /// Films pour une catégorie spécifique
    func movies(for categoryId: String) -> [Movie] {
        moviesByCategory[categoryId]?.filter { $0.active }
            .sorted { $0.sortOrder < $1.sortOrder } ?? []
    }

    // MARK: - Initialisation

    init(storageService: StorageService, movieService: MovieService) {
        self.storageService = storageService
        self.movieService = movieService
    }

    // MARK: - Actions (mutations de l'état)

    /// Charge les catégories depuis SwiftData
    func loadCategories() async {
        isLoadingCategories = true
        defer { isLoadingCategories = false }

        let descriptor = FetchDescriptor<Category>(
            predicate: #Predicate { $0.contentType == "movies" },
            sortBy: [SortDescriptor(\.sortOrder)]
        )

        do {
            categories = try storageService.fetch(descriptor)
            print("✅ MoviesStore: \(categories.count) catégories chargées")
        } catch {
            print("❌ MoviesStore: Erreur chargement catégories - \(error)")
            categories = []
        }
    }

    /// Charge les films d'une catégorie depuis SwiftData
    func loadMovies(for categoryId: String) async {
        let descriptor = FetchDescriptor<Movie>(
            predicate: #Predicate { $0.categoryId == categoryId },
            sortBy: [SortDescriptor(\.sortOrder)]
        )

        do {
            let movies = try storageService.fetch(descriptor)
            moviesByCategory[categoryId] = movies
            print("✅ MoviesStore: \(movies.count) films chargés pour catégorie \(categoryId)")
        } catch {
            print("❌ MoviesStore: Erreur chargement films - \(error)")
            moviesByCategory[categoryId] = []
        }
    }

    /// Charge toutes les données (catégories + films)
    func loadAll() async {
        await loadCategories()

        // Charger les films de chaque catégorie active
        for category in activeCategories {
            await loadMovies(for: category.categoryId)
        }
    }

    /// Sélectionne un film et charge ses détails
    func selectMovie(_ movie: Movie) async {
        selectedMovie = movie

        guard let streamId = movie.extractedStreamId else {
            print("❌ MoviesStore: streamId invalide")
            return
        }

        isLoadingDetail = true
        defer { isLoadingDetail = false }

        // 1. Charger le détail depuis SwiftData
        let detailDescriptor = FetchDescriptor<MovieDetail>(
            predicate: #Predicate { $0.streamId == streamId }
        )
        selectedMovieDetail = try? storageService.fetchOne(detailDescriptor)

        // 2. Charger l'historique de visionnage
        let historyDescriptor = FetchDescriptor<WatchHistory>(
            predicate: #Predicate { $0.streamId == streamId && $0.contentType == "movie" }
        )
        watchHistory = try? storageService.fetchOne(historyDescriptor)

        // 3. Enrichir les détails si nécessaire (appel API + TMDB)
        await movieService.loadDetailsIfNeeded(movie: movie)

        // 4. Recharger le détail mis à jour
        selectedMovieDetail = try? storageService.fetchOne(detailDescriptor)
    }

    /// Met à jour le texte de recherche (déclenche automatiquement la réactivité)
    func updateSearchText(_ text: String) {
        searchText = text
        // Pas besoin d'appeler quoi que ce soit !
        // SwiftUI va automatiquement observer que searchText a changé
        // et recalculer filteredMovies
    }

    /// Rafraîchit les données depuis l'API
    func refresh() async {
        // TODO: Appeler AccountService pour sync API
        await loadAll()
    }
}
```

---

### Étape 2 : Créer l'AppStore (Store racine)

**Fichier:** `Kanstrimi TV/Store/AppStore.swift`

```swift
import Foundation
import SwiftData

/// Store racine de l'application, contenant tous les sous-stores
@Observable
@MainActor
final class AppStore {
    // MARK: - Services (injectés une seule fois)

    let storageService: StorageService
    private let movieService: MovieService
    private let seriesService: SeriesService
    private let accountService: AccountService

    // MARK: - Sous-stores (features)

    let moviesStore: MoviesStore
    let seriesStore: SeriesStore
    let liveTVStore: LiveTVStore
    let filtersStore: FiltersStore
    let accountStore: AccountStore

    // MARK: - État global partagé

    var isAppReady: Bool = false
    var currentAccount: Account?

    // MARK: - Initialisation

    init() {
        // 1. Créer le StorageService (SwiftData)
        self.storageService = StorageService()

        // 2. Créer les services métier
        self.movieService = MovieService(storageService: storageService)
        self.seriesService = SeriesService(storageService: storageService)

        let categoryService = CategoryService(storageService: storageService)
        let liveChannelService = LiveChannelService(storageService: storageService)

        self.accountService = AccountService(
            storageService: storageService,
            categoryService: categoryService,
            liveChannelService: liveChannelService,
            movieService: movieService,
            seriesService: seriesService
        )

        // 3. Créer les stores features
        self.moviesStore = MoviesStore(
            storageService: storageService,
            movieService: movieService
        )

        self.seriesStore = SeriesStore(
            storageService: storageService,
            seriesService: seriesService
        )

        self.liveTVStore = LiveTVStore(
            storageService: storageService
        )

        self.filtersStore = FiltersStore(
            storageService: storageService
        )

        self.accountStore = AccountStore(
            storageService: storageService,
            accountService: accountService
        )
    }

    // MARK: - Actions globales

    /// Initialise l'application au démarrage
    func initialize() async {
        // Charger le compte
        let accountDescriptor = FetchDescriptor<Account>()
        currentAccount = try? storageService.fetchOne(accountDescriptor)

        // Si compte existe, charger les données
        if currentAccount != nil {
            await loadAllData()
        }

        isAppReady = true
    }

    /// Charge toutes les données de l'app
    private func loadAllData() async {
        async let moviesLoad = moviesStore.loadAll()
        async let seriesLoad = seriesStore.loadAll()
        async let liveTVLoad = liveTVStore.loadAll()

        // Chargement parallèle
        await moviesLoad
        await seriesLoad
        await liveTVLoad
    }

    /// Rafraîchit toutes les données depuis l'API
    func refreshAll() async {
        guard let account = currentAccount else { return }

        // Sync API
        try? await accountService.refreshAccount(account: account) { step in
            print("Sync step: \(step)")
        }

        // Recharger en mémoire
        await loadAllData()
    }
}
```

---

### Étape 3 : Injecter l'AppStore dans l'application

**Fichier:** `Kanstrimi TV/App/KanstrimiTVApp.swift`

```swift
import SwiftUI
import SwiftData

@main
struct KanstrimiTVApp: App {
    // ✅ Store créé UNE FOIS au démarrage de l'app
    @State private var appStore = AppStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(appStore)  // ✅ Injecté dans toute la hiérarchie
                .modelContainer(appStore.storageService.container)  // Pour @Query legacy
                .task {
                    // Initialiser l'app au démarrage
                    await appStore.initialize()
                }
        }
    }
}
```

---

### Étape 4 : Mettre à jour SearchMovies (résout le bug !)

**Fichier:** `Kanstrimi TV/Views/Movies/Components/SearchMovies.swift`

**AVANT (buggé) :**
```swift
struct SearchMovies: View {
    @State private var searchText = ""
    @Query private var filteredMovies: [Movie]  // ❌ Ne se met pas à jour !

    init() {
        let predicate: Predicate<Movie>
        if searchText.count < minCharacters {  // searchText = "" toujours
            predicate = #Predicate { _ in false }
        } else {
            predicate = #Predicate { movie in
                movie.name.localizedStandardContains(searchText)
            }
        }
        _filteredMovies = Query(filter: predicate, ...)
    }
}
```

**APRÈS (fonctionnel) :**
```swift
struct SearchMovies: View {
    // ✅ Récupérer le store depuis l'environnement
    @Environment(AppStore.self) private var appStore

    private var store: MoviesStore {
        appStore.moviesStore
    }

    // MARK: - Configuration
    private let minCharacters = 3

    // MARK: - Computed Properties
    private var isSearchActive: Bool {
        store.searchText.count >= minCharacters
    }

    // MARK: - Body
    var body: some View {
        ZStack {
            Color.appBackground
                .ignoresSafeArea()

            if !isSearchActive {
                initialStateView
            } else if store.filteredMovies.isEmpty {
                ContentUnavailableView {
                    Label("Aucun résultat", systemImage: "film.slash")
                } description: {
                    Text("pour \"\(store.searchText)\"")
                }
            } else {
                resultsGridView
            }
        }
        .searchable(
            text: Binding(
                get: { store.searchText },
                set: { store.updateSearchText($0) }
            ),
            prompt: "Rechercher un film..."
        )
        .task {
            // Charger tous les films si pas encore fait
            if store.moviesByCategory.isEmpty {
                await store.loadAll()
            }
        }
    }

    // MARK: - Subviews

    private var initialStateView: some View {
        VStack {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 80))
                .padding(.vertical, 30)

            Text("Rechercher un film")
                .font(.title3)
                .foregroundColor(.primary)

            Text("Tapez au moins \(minCharacters) caractères pour rechercher")
                .foregroundColor(.secondary)
        }
        .padding(60)
    }

    private var resultsGridView: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 30) {
                // Header avec nombre de résultats
                HStack {
                    Text(resultsCountText)
                        .font(.title2)
                        .foregroundColor(.secondary)
                    Spacer()
                }
                .padding(.horizontal, 60)

                // Grille de résultats
                LazyVGrid(
                    columns: Array(repeating: GridItem(.flexible(), spacing: 30), count: 5),
                    spacing: 30
                ) {
                    ForEach(store.filteredMovies) { movie in
                        Button {
                            Task {
                                await store.selectMovie(movie)
                            }
                        } label: {
                            MovieCard(movie: movie)
                        }
                    }
                }
                .padding(.horizontal, 60)
            }
            .padding(.top, 40)
            .padding(.bottom, 60)
        }
    }

    private var resultsCountText: String {
        let count = store.filteredMovies.count
        return "\(count) film\(count > 1 ? "s" : "") trouvé\(count > 1 ? "s" : "")"
    }
}
```

**🎉 Résultat : La recherche fonctionne maintenant en temps réel !**

---

### Étape 5 : Mettre à jour MoviesView (listing de catégories)

**Fichier:** `Kanstrimi TV/Views/Movies/MoviesView.swift`

**AVANT :**
```swift
struct MoviesView: View {
    @Query private var categories: [Category]

    init() {
        let predicate = #Predicate<Category> { category in
            category.contentType == "movies" && category.active
        }
        _categories = Query(...)
    }
}
```

**APRÈS :**
```swift
struct MoviesView: View {
    // ✅ Accès au store
    @Environment(AppStore.self) private var appStore

    private var store: MoviesStore {
        appStore.moviesStore
    }

    // MARK: - Environment
    @Environment(\.navigationPath) private var navigationPath

    // MARK: - Body
    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            if store.isLoadingCategories {
                ProgressView("Chargement des catégories...")
            } else if store.activeCategories.isEmpty {
                // État vide
                ContentUnavailableView {
                    Label("Films", systemImage: "film.slash")
                } description: {
                    Text("Aucun film disponible")
                }
            } else {
                // Liste des catégories avec films
                LazyVStack(spacing: 30) {
                    ForEach(store.activeCategories) { category in
                        MovieCategoryRow(category: category)
                    }
                }
                .padding(.top, 40)
                .padding(.bottom, 60)
            }
        }
        .ignoresSafeArea(.container, edges: [.horizontal])
        .onPlayPauseDoubleTap {
            navigationPath.wrappedValue.append(NavigationDestination.searchMovies)
        }
        .refreshable {
            // ✅ Pull-to-refresh
            await store.refresh()
        }
        .task {
            // Charger au premier affichage
            if store.categories.isEmpty {
                await store.loadAll()
            }
        }
    }
}
```

---

### Étape 6 : Mettre à jour MovieCategoryRow

**Fichier:** `Kanstrimi TV/Views/Movies/Components/MovieCategoryRow.swift`

**AVANT :**
```swift
struct MovieCategoryRow: View {
    let category: Category
    @Query private var movies: [Movie]

    init(category: Category) {
        self.category = category
        _movies = Query(
            filter: #Predicate { $0.categoryId == category.categoryId },
            sort: [SortDescriptor(\Movie.sortOrder)]
        )
    }
}
```

**APRÈS :**
```swift
struct MovieCategoryRow: View {
    let category: Category

    @Environment(AppStore.self) private var appStore

    private var store: MoviesStore {
        appStore.moviesStore
    }

    // ✅ Récupération des films depuis le store
    private var movies: [Movie] {
        store.movies(for: category.categoryId)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header de la catégorie
            Text(category.name)
                .font(.title2)
                .foregroundColor(.primary)
                .padding(.horizontal, 60)

            if movies.isEmpty {
                Text("Aucun film dans cette catégorie")
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 60)
            } else {
                // ScrollView horizontale avec les films
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 20) {
                        ForEach(movies) { movie in
                            Button {
                                Task {
                                    await store.selectMovie(movie)
                                }
                            } label: {
                                MovieCard(movie: movie)
                            }
                        }
                    }
                    .padding(.horizontal, 60)
                }
            }
        }
        .task {
            // Charger les films de cette catégorie si pas encore fait
            if store.moviesByCategory[category.categoryId] == nil {
                await store.loadMovies(for: category.categoryId)
            }
        }
    }
}
```

---

### Étape 7 : Mettre à jour MovieDetailView (résout les N+1 queries)

**Fichier:** `Kanstrimi TV/Views/Movies/Components/MovieDetailView.swift`

**AVANT (3 @Query !) :**
```swift
struct MovieDetailView: View {
    let streamId: Int

    @Query private var movies: [Movie]           // Query 1
    @Query private var movieDetails: [MovieDetail] // Query 2
    @Query private var watchHistories: [WatchHistory] // Query 3

    private var movie: Movie? { movies.first }
    private var movieDetail: MovieDetail? { movieDetails.first }
    private var watchHistory: WatchHistory? { watchHistories.first }
}
```

**APRÈS (0 @Query, 1 seul état dans le store) :**
```swift
struct MovieDetailView: View {
    let streamId: Int

    // ✅ Accès au store
    @Environment(AppStore.self) private var appStore
    @Environment(\.showPlayer) private var showPlayer

    private var store: MoviesStore {
        appStore.moviesStore
    }

    // ✅ Données depuis le store (déjà chargées par selectMovie)
    private var movie: Movie? {
        store.selectedMovie
    }

    private var movieDetail: MovieDetail? {
        store.selectedMovieDetail
    }

    private var watchHistory: WatchHistory? {
        store.watchHistory
    }

    // MARK: - Body
    var body: some View {
        ZStack {
            Color.appBackground

            if store.isLoadingDetail {
                ProgressView("Chargement des détails...")
            } else {
                // Backdrop image
                backdropView

                VStack(alignment: .leading, spacing: 40) {
                    // Hero Section & Boutons de lecture
                    HStack(alignment: .bottom, spacing: 30) {
                        posterView

                        VStack(alignment: .leading) {
                            infoView
                            playbackButtonsSection
                        }
                    }

                    // Synopsis
                    if let plot = movieDetail?.plot, !plot.isEmpty {
                        synopsisSection(plot: plot)
                    }

                    // Réalisateur
                    if let director = movieDetail?.director, !director.isEmpty {
                        directorSection(director: director)
                    }

                    // Cast
                    if let castImages = movieDetail?.castImages, !castImages.isEmpty {
                        castSection(castImages: castImages)
                    }
                }
                .padding(60)
            }
        }
        .task {
            // Charger le film et ses détails si pas déjà sélectionné
            if store.selectedMovie == nil || store.selectedMovie?.extractedStreamId != streamId {
                // Trouver le film dans le cache
                if let movie = findMovieInCache(streamId: streamId) {
                    await store.selectMovie(movie)
                }
            }
        }
        .ignoresSafeArea()
    }

    // Helper pour trouver un film dans le cache
    private func findMovieInCache(streamId: Int) -> Movie? {
        store.moviesByCategory.values
            .flatMap { $0 }
            .first { $0.extractedStreamId == streamId }
    }

    // ... Le reste du code (posterView, infoView, etc.) reste identique
}
```

**🎉 Résultat : Plus que 1 seul état au lieu de 3 queries !**

---

## Exemples concrets

### Exemple 1 : Recherche réactive

```swift
// User tape "Avatar"
store.searchText = "Avatar"

// SwiftUI détecte que searchText a changé (grâce à @Observable)
// → Recalcule automatiquement filteredMovies (computed property)
// → Redessine la vue avec les nouveaux résultats

var filteredMovies: [Movie] {
    guard searchText.count >= 3 else { return [] }
    return allMovies.filter {
        $0.name.localizedStandardContains(searchText)  // ✅ Filtre dynamique !
    }
}
```

### Exemple 2 : Chargement de détails

```swift
// User clique sur un film
await store.selectMovie(movie)

// Le store :
// 1. Met à jour selectedMovie = movie
// 2. Charge le MovieDetail depuis SwiftData
// 3. Charge le WatchHistory depuis SwiftData
// 4. Appelle l'API si détails incomplets
// 5. Sauvegarde dans SwiftData
// 6. Met à jour selectedMovieDetail

// SwiftUI redessine automatiquement MovieDetailView
```

### Exemple 3 : Pull-to-refresh

```swift
.refreshable {
    await store.refresh()
}

// Le store :
// 1. Appelle AccountService.refreshAccount() (sync API)
// 2. SwiftData est mis à jour par AccountService
// 3. Recharge categories/movies depuis SwiftData
// 4. SwiftUI redessine automatiquement les vues
```

### Exemple 4 : Filtrage de catégories

```swift
// FiltersStore applique un filtre
await filtersStore.applyFilters()

// FilterService met à jour category.active dans SwiftData
// → MoviesStore recharge les catégories
await moviesStore.loadCategories()

// → activeCategories (computed property) change
var activeCategories: [Category] {
    categories.filter { $0.active }
}

// → SwiftUI redessine MoviesView avec les nouvelles catégories
```

---

## Migration progressive

### Phase 1 : Créer l'infrastructure (1 jour)

1. **Créer les dossiers**
   ```
   Kanstrimi TV/
   └── Store/
       ├── AppStore.swift
       ├── MoviesStore.swift
       ├── SeriesStore.swift
       ├── LiveTVStore.swift
       ├── FiltersStore.swift
       └── AccountStore.swift
   ```

2. **Implémenter AppStore et MoviesStore** (code ci-dessus)

3. **Injecter dans KanstrimiTVApp.swift**

---

### Phase 2 : Migrer SearchMovies (1 jour) 🔴 PRIORITÉ

**Objectif :** Résoudre le bug de recherche

1. Modifier `SearchMovies.swift` pour utiliser `MoviesStore`
2. Supprimer les @Query
3. Tester la recherche

**Test :**
- Lancer l'app
- Ouvrir la recherche
- Taper "Avatar"
- ✅ Résultats s'affichent en temps réel !

---

### Phase 3 : Migrer MoviesView (0.5 jour)

1. Modifier `MoviesView.swift`
2. Modifier `MovieCategoryRow.swift`
3. Tester l'affichage des catégories

---

### Phase 4 : Migrer MovieDetailView (1 jour)

1. Modifier `MovieDetailView.swift`
2. Supprimer les 3 @Query
3. Utiliser `store.selectedMovie`, `store.selectedMovieDetail`, `store.watchHistory`
4. Tester l'affichage des détails

---

### Phase 5 : Migrer Series et LiveTV (2 jours)

**Même approche :**
1. Créer `SeriesStore` et `LiveTVStore`
2. Migrer `SearchSeries`, `SeriesView`, `SeriesDetailView`
3. Migrer `SearchLiveTV`, `LiveTVView`

---

### Phase 6 : Migrer les filtres (1 jour)

1. Créer `FiltersStore`
2. Migrer `FilterManagementView`
3. Connecter avec `MoviesStore`, `SeriesStore`, `LiveTVStore`

---

### Phase 7 : Migrer le compte (0.5 jour)

1. Créer `AccountStore`
2. Migrer `WelcomeView`, `SettingsView`

---

### Estimation totale : 6-7 jours

| Phase | Durée | Priorité |
|-------|-------|----------|
| Phase 1: Infrastructure | 1 jour | 🔴 |
| Phase 2: SearchMovies | 1 jour | 🔴 |
| Phase 3: MoviesView | 0.5 jour | 🟡 |
| Phase 4: MovieDetailView | 1 jour | 🟡 |
| Phase 5: Series/LiveTV | 2 jours | 🟡 |
| Phase 6: Filtres | 1 jour | 🟢 |
| Phase 7: Compte | 0.5 jour | 🟢 |

---

## Avantages et limitations

### ✅ Avantages

| Avantage | Description |
|----------|-------------|
| **Réactivité totale** | Computed properties réactives, plus de problème de predicate figé |
| **Simplicité** | Pas de framework externe, code natif SwiftUI |
| **Performance** | @Observable est optimisé par Apple (observation fine-grained) |
| **Debugging** | État centralisé facile à inspecter |
| **Migration rapide** | 6-7 jours vs 3-4 semaines pour TCA |
| **Testabilité** | Stores injectables avec mock StorageService |
| **SwiftData compatible** | Stores = runtime, SwiftData = persistance |

### ⚠️ Limitations

| Limitation | Mitigation |
|-----------|------------|
| **Pas de time-travel debugging** | Utiliser breakpoints et logging |
| **Moins structuré que Redux** | Définir des conventions d'équipe claires |
| **Filtrage en mémoire** | Acceptable pour des milliers d'items, SwiftData pour millions |
| **Tests manuels** | Créer des helpers pour tests async |

---

## Comparaison @Observable vs TCA

| Critère | @Observable | TCA |
|---------|-------------|-----|
| **Temps migration** | 6-7 jours | 3-4 semaines |
| **Courbe apprentissage** | Faible | Élevée |
| **Réactivité** | ✅ Totale | ✅ Totale |
| **Testabilité** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Debugging** | Standard | Time-travel |
| **Boilerplate** | Minimal | Moyen |
| **Dépendances** | 0 | 1 (TCA) |

---

## Conclusion

L'approche **@Observable natif** est idéale pour Kanstrimi TV car :

1. ✅ **Résout tous les problèmes critiques** (recherche, N+1 queries, réactivité)
2. ✅ **Migration rapide** (6-7 jours vs 3-4 semaines)
3. ✅ **Code simple et maintenable** (natif SwiftUI, pas de framework)
4. ✅ **Performance native** (optimisations Apple intégrées)
5. ✅ **Compatible SwiftData** (séparation claire runtime/persistance)

**Prochaines étapes :**
1. Créer AppStore et MoviesStore
2. Migrer SearchMovies (résout le bug critique)
3. Migrer le reste progressivement

**Questions ou besoin d'aide pour l'implémentation ? Contactez l'équipe !**
