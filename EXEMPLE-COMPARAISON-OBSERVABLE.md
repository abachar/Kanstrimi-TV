# Comparaison Avant/Après : @Query vs @Observable

Ce document montre la comparaison côte à côte entre l'approche actuelle avec @Query et la nouvelle approche avec @Observable.

---

## Cas d'usage 1 : Recherche de films

### ❌ AVANT - Avec @Query (BUGGÉ)

```swift
import SwiftUI
import SwiftData

struct SearchMovies: View {
    // État local
    @State private var searchText = ""

    // Query avec predicate
    @Query private var filteredMovies: [Movie]

    private let minCharacters = 3

    // PROBLÈME : Le predicate est créé UNE FOIS dans init()
    // À ce moment, searchText = "" (toujours vide)
    init() {
        let predicate: Predicate<Movie>
        if searchText.count < minCharacters {
            // ⚠️ searchText est TOUJOURS "" ici !
            predicate = #Predicate { _ in false }
        } else {
            predicate = #Predicate { movie in
                movie.name.localizedStandardContains(searchText)
            }
        }

        _filteredMovies = Query(
            filter: predicate,
            sort: [SortDescriptor(\Movie.sortOrder)]
        )
    }

    var body: some View {
        List(filteredMovies) { movie in
            MovieCard(movie: movie)
        }
        .searchable(text: $searchText)
        // ⚠️ Quand l'user tape du texte, searchText change
        // MAIS le predicate de @Query ne change JAMAIS
        // → La recherche ne fonctionne pas !
    }
}
```

**Problème :**
- Le predicate est figé à l'initialisation quand `searchText = ""`
- SwiftData ne peut pas observer les changements de `@State searchText`
- Résultat : **la recherche ne fonctionne jamais** 🔴

---

### ✅ APRÈS - Avec @Observable (FONCTIONNE)

```swift
import SwiftUI
import SwiftData

// 1. Créer un Store observable
@Observable
@MainActor
final class MoviesStore {
    // État runtime
    var allMovies: [Movie] = []
    var searchText: String = ""

    // ✅ Computed property réactive
    // Recalculée automatiquement quand searchText change !
    var filteredMovies: [Movie] {
        guard searchText.count >= 3 else { return [] }
        return allMovies.filter {
            $0.name.localizedStandardContains(searchText) && $0.active
        }
    }

    private let storageService: StorageService

    init(storageService: StorageService) {
        self.storageService = storageService
    }

    // Charger les films depuis SwiftData
    func loadMovies() async {
        let descriptor = FetchDescriptor<Movie>(
            sort: [SortDescriptor(\.sortOrder)]
        )
        allMovies = (try? storageService.fetch(descriptor)) ?? []
    }
}

// 2. Utiliser dans la vue
struct SearchMovies: View {
    @Environment(AppStore.self) private var appStore

    private var store: MoviesStore {
        appStore.moviesStore
    }

    var body: some View {
        List(store.filteredMovies) { movie in
            MovieCard(movie: movie)
        }
        .searchable(
            text: Binding(
                get: { store.searchText },
                set: { newValue in store.searchText = newValue }
            )
        )
        // ✅ Quand l'user tape du texte :
        // 1. store.searchText change
        // 2. @Observable notifie SwiftUI
        // 3. filteredMovies se recalcule automatiquement
        // 4. La vue se redessine avec les nouveaux résultats
        // → La recherche fonctionne parfaitement ! ✅
        .task {
            if store.allMovies.isEmpty {
                await store.loadMovies()
            }
        }
    }
}
```

**Solution :**
- `filteredMovies` est une computed property qui observe `searchText`
- SwiftUI redessine automatiquement quand `searchText` change grâce à `@Observable`
- Résultat : **la recherche fonctionne en temps réel** ✅

---

## Cas d'usage 2 : Détails d'un film

### ❌ AVANT - Avec @Query (3 queries séparées)

```swift
import SwiftUI
import SwiftData

struct MovieDetailView: View {
    let streamId: Int

    // ⚠️ 3 @Query différentes pour 1 seul film !
    @Query private var movies: [Movie]
    @Query private var movieDetails: [MovieDetail]
    @Query private var watchHistories: [WatchHistory]

    @Environment(\.domainService) private var domainService

    // Propriétés computed pour récupérer le premier élément
    private var movie: Movie? {
        movies.first
    }

    private var movieDetail: MovieDetail? {
        movieDetails.first
    }

    private var watchHistory: WatchHistory? {
        watchHistories.first
    }

    init(streamId: Int) {
        self.streamId = streamId

        // Query 1 : Le film de base
        _movies = Query(
            filter: #Predicate<Movie> { $0.id == "movie-\(streamId)" }
        )

        // Query 2 : Les détails enrichis
        _movieDetails = Query(
            filter: #Predicate<MovieDetail> { $0.streamId == streamId }
        )

        // Query 3 : L'historique de visionnage
        _watchHistories = Query(
            filter: #Predicate<WatchHistory> {
                $0.streamId == streamId && $0.contentType == "movie"
            }
        )
    }

    var body: some View {
        VStack {
            if let movie = movie {
                Text(movie.name)

                if let detail = movieDetail {
                    Text(detail.plot ?? "")
                }

                if let history = watchHistory {
                    Text("Progression: \(history.progressPercentage)%")
                }
            }
        }
        .task {
            guard let movie = movie else { return }
            await domainService.loadMovieDetailsIfNeeded(movie: movie)
        }
    }
}
```

**Problèmes :**
- 3 queries SwiftData différentes pour 1 seul objet métier
- Si on affiche 10 films → 30 queries !
- Code verbeux avec beaucoup de computed properties
- Pas de gestion d'état de chargement centralisée

---

### ✅ APRÈS - Avec @Observable (1 seul état)

```swift
import SwiftUI

// 1. État centralisé dans le Store
@Observable
@MainActor
final class MoviesStore {
    // ✅ 1 seul état pour le film sélectionné
    var selectedMovie: Movie?
    var selectedMovieDetail: MovieDetail?
    var watchHistory: WatchHistory?
    var isLoadingDetail: Bool = false

    private let storageService: StorageService
    private let movieService: MovieService

    // Sélectionner un film et charger toutes ses données en 1 fois
    func selectMovie(_ movie: Movie) async {
        selectedMovie = movie

        guard let streamId = movie.extractedStreamId else { return }

        isLoadingDetail = true
        defer { isLoadingDetail = false }

        // ✅ Charger les 3 objets en parallèle
        async let detailTask = storageService.fetchOne(
            FetchDescriptor<MovieDetail>(
                predicate: #Predicate { $0.streamId == streamId }
            )
        )

        async let historyTask = storageService.fetchOne(
            FetchDescriptor<WatchHistory>(
                predicate: #Predicate {
                    $0.streamId == streamId && $0.contentType == "movie"
                }
            )
        )

        selectedMovieDetail = try? await detailTask
        watchHistory = try? await historyTask

        // Enrichir si nécessaire
        await movieService.loadDetailsIfNeeded(movie: movie)

        // Recharger le détail mis à jour
        selectedMovieDetail = try? await storageService.fetchOne(
            FetchDescriptor<MovieDetail>(
                predicate: #Predicate { $0.streamId == streamId }
            )
        )
    }
}

// 2. Vue simplifiée
struct MovieDetailView: View {
    let streamId: Int

    @Environment(AppStore.self) private var appStore

    private var store: MoviesStore {
        appStore.moviesStore
    }

    var body: some View {
        VStack {
            if store.isLoadingDetail {
                ProgressView("Chargement...")
            } else if let movie = store.selectedMovie {
                Text(movie.name)

                if let detail = store.selectedMovieDetail {
                    Text(detail.plot ?? "")
                }

                if let history = store.watchHistory {
                    Text("Progression: \(history.progressPercentage)%")
                }
            }
        }
        .task {
            // Charger si pas déjà sélectionné
            if store.selectedMovie?.extractedStreamId != streamId {
                if let movie = findMovieInCache(streamId: streamId) {
                    await store.selectMovie(movie)
                }
            }
        }
    }

    private func findMovieInCache(streamId: Int) -> Movie? {
        store.moviesByCategory.values
            .flatMap { $0 }
            .first { $0.extractedStreamId == streamId }
    }
}
```

**Avantages :**
- ✅ 1 seul état centralisé au lieu de 3 queries
- ✅ Chargement parallèle des données
- ✅ Gestion d'état de chargement intégrée
- ✅ Code plus simple et lisible
- ✅ Meilleure performance (moins de queries)

---

## Cas d'usage 3 : Liste de catégories

### ❌ AVANT - Avec @Query

```swift
import SwiftUI
import SwiftData

struct MoviesView: View {
    // Query pour les catégories
    @Query private var categories: [Category]

    init() {
        // Predicate figé
        let predicate = #Predicate<Category> { category in
            category.contentType == "movies" && category.active
        }
        let descriptor = FetchDescriptor<Category>(
            predicate: predicate,
            sortBy: [SortDescriptor(\.sortOrder)]
        )
        _categories = Query(descriptor)
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 30) {
                ForEach(categories) { category in
                    MovieCategoryRow(category: category)
                }
            }
        }
        // ⚠️ Pas de pull-to-refresh
        // ⚠️ Pas de gestion d'état de chargement
        // ⚠️ Si on applique un filtre, les catégories ne se rafraîchissent pas
    }
}

struct MovieCategoryRow: View {
    let category: Category

    // Encore une @Query pour les films de cette catégorie
    @Query private var movies: [Movie]

    init(category: Category) {
        self.category = category
        _movies = Query(
            filter: #Predicate { $0.categoryId == category.categoryId },
            sort: [SortDescriptor(\Movie.sortOrder)]
        )
    }

    var body: some View {
        VStack(alignment: .leading) {
            Text(category.name)

            ScrollView(.horizontal) {
                LazyHStack {
                    ForEach(movies) { movie in
                        MovieCard(movie: movie)
                    }
                }
            }
        }
    }
}
```

**Problèmes :**
- Pas de pull-to-refresh
- Pas d'indicateur de chargement
- Si les filtres changent, pas de mise à jour automatique
- Chaque row fait sa propre query (N queries pour N catégories)

---

### ✅ APRÈS - Avec @Observable

```swift
import SwiftUI

// 1. Store avec état centralisé
@Observable
@MainActor
final class MoviesStore {
    var categories: [Category] = []
    var moviesByCategory: [String: [Movie]] = [:]
    var isLoadingCategories: Bool = false

    private let storageService: StorageService

    // Computed property pour catégories actives
    var activeCategories: [Category] {
        categories.filter { $0.active && $0.contentType == "movies" }
            .sorted { $0.sortOrder < $1.sortOrder }
    }

    // Films pour une catégorie
    func movies(for categoryId: String) -> [Movie] {
        moviesByCategory[categoryId]?.filter { $0.active }
            .sorted { $0.sortOrder < $1.sortOrder } ?? []
    }

    // Charger toutes les catégories
    func loadCategories() async {
        isLoadingCategories = true
        defer { isLoadingCategories = false }

        let descriptor = FetchDescriptor<Category>(
            predicate: #Predicate { $0.contentType == "movies" },
            sortBy: [SortDescriptor(\.sortOrder)]
        )
        categories = (try? storageService.fetch(descriptor)) ?? []
    }

    // Charger les films d'une catégorie
    func loadMovies(for categoryId: String) async {
        let descriptor = FetchDescriptor<Movie>(
            predicate: #Predicate { $0.categoryId == categoryId },
            sortBy: [SortDescriptor(\.sortOrder)]
        )
        moviesByCategory[categoryId] = (try? storageService.fetch(descriptor)) ?? []
    }

    // Rafraîchir depuis l'API
    func refresh() async {
        // Appeler AccountService pour sync API
        // Puis recharger
        await loadAll()
    }

    func loadAll() async {
        await loadCategories()

        for category in activeCategories {
            await loadMovies(for: category.categoryId)
        }
    }
}

// 2. Vue avec pull-to-refresh et état de chargement
struct MoviesView: View {
    @Environment(AppStore.self) private var appStore

    private var store: MoviesStore {
        appStore.moviesStore
    }

    var body: some View {
        ScrollView {
            if store.isLoadingCategories {
                ProgressView("Chargement des catégories...")
            } else if store.activeCategories.isEmpty {
                ContentUnavailableView {
                    Label("Films", systemImage: "film.slash")
                } description: {
                    Text("Aucun film disponible")
                }
            } else {
                LazyVStack(spacing: 30) {
                    ForEach(store.activeCategories) { category in
                        MovieCategoryRow(category: category)
                    }
                }
            }
        }
        .refreshable {
            // ✅ Pull-to-refresh
            await store.refresh()
        }
        .task {
            if store.categories.isEmpty {
                await store.loadAll()
            }
        }
    }
}

// 3. Row sans @Query (utilise le cache du store)
struct MovieCategoryRow: View {
    let category: Category

    @Environment(AppStore.self) private var appStore

    private var store: MoviesStore {
        appStore.moviesStore
    }

    // ✅ Récupération depuis le cache (pas de query)
    private var movies: [Movie] {
        store.movies(for: category.categoryId)
    }

    var body: some View {
        VStack(alignment: .leading) {
            Text(category.name)

            ScrollView(.horizontal) {
                LazyHStack {
                    ForEach(movies) { movie in
                        MovieCard(movie: movie)
                    }
                }
            }
        }
        .task {
            // Charger si pas encore en cache
            if store.moviesByCategory[category.categoryId] == nil {
                await store.loadMovies(for: category.categoryId)
            }
        }
    }
}
```

**Avantages :**
- ✅ Pull-to-refresh intégré
- ✅ Indicateur de chargement
- ✅ Cache centralisé (pas de N queries)
- ✅ Rafraîchissement automatique quand les filtres changent
- ✅ État de chargement partagé

---

## Résumé des différences

| Aspect | @Query (Avant) | @Observable (Après) |
|--------|----------------|---------------------|
| **Recherche dynamique** | ❌ Ne fonctionne pas (predicate figé) | ✅ Fonctionne (computed property) |
| **N+1 queries** | ❌ 3 queries par film | ✅ 1 état centralisé |
| **Pull-to-refresh** | ❌ Difficile à implémenter | ✅ `.refreshable` natif |
| **État de chargement** | ❌ Pas géré | ✅ Géré dans le store |
| **Cache** | ❌ Chaque vue fait sa query | ✅ Cache centralisé |
| **Réactivité** | ⚠️ Limitée (predicate figé) | ✅ Totale (computed properties) |
| **Testabilité** | ⚠️ Difficile (dépendance SwiftData) | ✅ Facile (mock store) |
| **Performance** | ⚠️ Queries multiples | ✅ Cache en mémoire |

---

## Flux de données

### AVANT (@Query)

```
User tape "Avatar"
    ↓
@State searchText = "Avatar"
    ↓
@Query filteredMovies  ← ⚠️ Predicate figé, ne change pas !
    ↓
Aucun résultat affiché ❌
```

### APRÈS (@Observable)

```
User tape "Avatar"
    ↓
store.searchText = "Avatar"
    ↓
@Observable notifie SwiftUI que searchText a changé
    ↓
SwiftUI recalcule filteredMovies (computed property)
    ↓
filteredMovies = allMovies.filter { ... "Avatar" ... }
    ↓
SwiftUI redessine la vue
    ↓
Résultats affichés en temps réel ✅
```

---

## Conclusion

L'approche **@Observable** résout tous les problèmes de l'approche actuelle :

1. ✅ **Recherche fonctionnelle** (computed properties au lieu de predicates figés)
2. ✅ **Moins de queries** (cache centralisé au lieu de N queries)
3. ✅ **Pull-to-refresh** (facilement implémentable)
4. ✅ **État de chargement** (géré dans les stores)
5. ✅ **Réactivité totale** (observation automatique par SwiftUI)

**Migration simple et rapide** (6-7 jours) avec des bénéfices immédiats !
