# Étude d'Architecture Redux-like pour Kanstrimi TV

**Date:** 2 Novembre 2025
**Projet:** Kanstrimi TV (tvOS/SwiftUI)
**Problématique:** Limitations de @Query/SwiftData pour le rafraîchissement réactif des données

---

## Table des matières

1. [Résumé exécutif](#résumé-exécutif)
2. [Analyse de l'architecture actuelle](#analyse-de-larchitecture-actuelle)
3. [Problèmes identifiés](#problèmes-identifiés)
4. [Solutions Redux-like disponibles](#solutions-redux-like-disponibles)
5. [Comparaison et recommandations](#comparaison-et-recommandations)
6. [Plan de migration](#plan-de-migration)
7. [Conclusion](#conclusion)

---

## Résumé exécutif

### Constat

L'application Kanstrimi TV utilise actuellement **SwiftData avec @Query** pour la gestion d'état et la persistance. Cette approche présente des **limitations critiques** pour la réactivité des données, notamment :

- **@Query ne peut pas utiliser de propriétés @State dynamiques** - les predicates sont figés à l'initialisation
- **Problèmes de recherche** : SearchMovies.swift a un predicate qui ne se met jamais à jour quand l'utilisateur tape du texte
- **Pas de rafraîchissement en temps réel** des données depuis l'API
- **N+1 queries** dans les vues de détail (3 @Query pour MovieDetailView, 5 pour SeriesDetailView)

### Recommandation principale

Adopter **The Composable Architecture (TCA)** comme solution Redux-like moderne pour Swift/SwiftUI, tout en **conservant SwiftData** uniquement pour la persistance locale.

### Bénéfices attendus

- ✅ État global prévisible et centralisé
- ✅ Réactivité en temps réel avec Combine/Async
- ✅ Testabilité maximale (reducers purs)
- ✅ Debugging simplifié (time-travel debugging)
- ✅ Meilleure séparation des responsabilités

---

## Analyse de l'architecture actuelle

### Architecture MV (Model-View) hybride

```
┌─────────────────────────────────────────────────┐
│  KanstrimiTVApp                                 │
│  @State DomainService (@Observable, @MainActor) │
│  .modelContainer (SwiftData)                    │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  API (Xtream Codes, TMDB)                       │
│  ↓                                               │
│  Services (AccountService, MovieService, etc.)  │
│  ↓                                               │
│  StorageService (SwiftData ModelContext)        │
│  ↓                                               │
│  SwiftData (12 @Model: Movie, Series, etc.)     │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  Views (MoviesView, SeriesView, etc.)           │
│  @Query categories, movies, series              │
│  Auto-update quand SwiftData change             │
└─────────────────────────────────────────────────┘
```

### Points forts actuels

| Aspect | Description |
|--------|-------------|
| **Séparation en couches** | Domain, Services, Views bien séparés |
| **Façade DomainService** | Point d'entrée unique pour les opérations |
| **SwiftData** | Persistance moderne avec ModelContainer |
| **Services spécialisés** | AccountService, MovieService, FilterService, etc. |
| **Enrichissement TMDB** | MovieDetail/SeriesDetail avec cast, backdrops |

### Flux de données actuel

```
User Action (e.g., SearchMovies tape "Avatar")
    ↓
@State searchText = "Avatar"
    ↓
@Query filteredMovies ← ⚠️ PROBLÈME: predicate figé à init()
    ↓
View ne se met PAS à jour car predicate ne change pas
```

---

## Problèmes identifiés

### 🔴 CRITIQUE : @Query avec predicates dynamiques

**Fichier:** `SearchMovies.swift:25-43`

```swift
struct SearchMovies: View {
    @State private var searchText = ""
    @Query private var filteredMovies: [Movie]

    init() {
        let predicate: Predicate<Movie>
        if searchText.count < minCharacters {  // ⚠️ searchText est TOUJOURS ""
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

**Pourquoi c'est un problème :**
- `@Query` initialise son predicate UNE SEULE FOIS dans `init()`
- À ce moment, `@State searchText = ""` (toujours vide)
- Quand l'utilisateur tape du texte, `searchText` change mais **le predicate ne se réévalue jamais**
- **Résultat:** La recherche ne fonctionne pas !

**Workaround actuel nécessaire:**
```swift
// Solution : fetch all + filter in memory
@Query private var allMovies: [Movie]
var filteredMovies: [Movie] {
    allMovies.filter { $0.name.localizedStandardContains(searchText) }
}
```

**Limitation:** Moins performant (filtrage en mémoire au lieu de requête DB optimisée)

### 🟡 MOYEN : N+1 queries en cascade

**Fichier:** `MovieDetailView.swift:22-24`

```swift
struct MovieDetailView: View {
    @Query private var movies: [Movie]           // Query 1
    @Query private var movieDetails: [MovieDetail] // Query 2
    @Query private var watchHistories: [WatchHistory] // Query 3

    // Pour 1 film détail = 3 requêtes SwiftData
    // Si 10 films dans grille = 30 queries !
}
```

**Impact:** Performance dégradée avec beaucoup de détails chargés simultanément

### 🟡 MOYEN : Pas de synchronisation en arrière-plan

**Fichier:** `WelcomeView.swift` + `AccountService.swift`

**Problème:**
- `refreshAccount()` ne s'exécute qu'au lancement de l'app (si lastSyncDate > 5 jours)
- Pas de pull-to-refresh dans les vues principales
- Pas de background task pour sync périodique
- Après 5+ jours, les données deviennent stale

**Impact:** Utilisateur peut voir des contenus obsolètes

### 🟠 FAIBLE : Pas de gestion d'erreur centralisée

**Fichier:** `DomainService.swift:110-118`

```swift
func refreshAccount(account: Account, ...) async throws {
    try await accountService.refreshAccount(...)
    try? await filterService.applyFilters()  // ⚠️ Erreur ignorée
}
```

**Impact:** Si la sync échoue à moitié, données incohérentes sans feedback utilisateur

### 🟠 FAIBLE : WatchHistory pas mis à jour en temps réel

**Problème:**
- La progression de lecture (position dans film/série) n'est pas mise à jour pendant la lecture
- Seulement sauvegardée à la fin ou quand le lecteur se ferme

**Impact:** Si l'app crash pendant la lecture, progression perdue

---

## Solutions Redux-like disponibles

### Option 1: The Composable Architecture (TCA) ⭐ RECOMMANDÉ

**Repository:** https://github.com/pointfreeco/swift-composable-architecture
**Stars:** 12,000+
**Maintenu par:** Point-Free (Brandon Williams & Stephen Celis)
**Version actuelle:** 1.13 (actif en 2025)

#### Principes

```swift
// 1. État global immuable
struct AppState: Equatable {
    var movies: IdentifiedArrayOf<Movie> = []
    var searchText: String = ""
    var isLoading: Bool = false
    var selectedMovie: Movie?
}

// 2. Actions (tous les événements possibles)
enum AppAction {
    case searchTextChanged(String)
    case moviesLoaded([Movie])
    case movieSelected(Movie)
    case refreshRequested
}

// 3. Reducer (fonction pure qui produit nouvel état)
let appReducer = Reducer<AppState, AppAction, AppEnvironment> { state, action, env in
    switch action {
    case .searchTextChanged(let text):
        state.searchText = text
        return .none

    case .moviesLoaded(let movies):
        state.movies = IdentifiedArray(uniqueElements: movies)
        state.isLoading = false
        return .none

    case .refreshRequested:
        state.isLoading = true
        return env.movieClient.fetchMovies()
            .map(AppAction.moviesLoaded)
            .eraseToEffect()
    }
}

// 4. Environment (dépendances injectables)
struct AppEnvironment {
    var movieClient: MovieClient
    var storageService: StorageService
}

// 5. Store (conteneur de l'état + dispatch)
let store = Store(
    initialState: AppState(),
    reducer: appReducer,
    environment: AppEnvironment(
        movieClient: .live,
        storageService: StorageService()
    )
)
```

#### Avantages TCA

| Avantage | Description |
|----------|-------------|
| **Testabilité** | Reducers purs = tests unitaires simples sans mocks |
| **Prévisibilité** | Flux unidirectionnel : Action → Reducer → State → View |
| **Composabilité** | Découpe des features en mini-stores combinables |
| **Time-travel debugging** | Enregistrement/replay de toutes les actions |
| **Async moderne** | Support natif async/await + Combine |
| **SwiftUI-first** | Intégration parfaite avec `@ObservedObject` et `ViewStore` |
| **Plateforme universelle** | iOS, macOS, tvOS, watchOS, visionOS |

#### Inconvénients TCA

| Inconvénient | Mitigation |
|--------------|------------|
| **Courbe d'apprentissage** | Documentation extensive + tutoriels Point-Free |
| **Verbosité** | Générateurs de code (Sourcery templates) |
| **Performance (très gros états)** | Équatabilité fine-grained avec `IdentifiedArray` |
| **Boilerplate initial** | Starter templates disponibles |

#### Intégration avec SwiftData

TCA ne remplace PAS SwiftData. Approche recommandée :

```swift
// SwiftData = persistance locale uniquement
struct MovieClient {
    var fetchMovies: () async throws -> [Movie]
    var saveMovies: ([Movie]) async throws -> Void
}

extension MovieClient {
    static let live = Self(
        fetchMovies: {
            // 1. Appel API Xtream
            let response = try await XtreamService.getMovies()

            // 2. Sauvegarde SwiftData
            try await StorageService.shared.insertMovies(response)

            // 3. Retour état pour TCA Store
            return response
        },
        saveMovies: { movies in
            try await StorageService.shared.insertMovies(movies)
        }
    )
}
```

**Résultat:** TCA gère l'état runtime, SwiftData gère la persistance

---

### Option 2: SwiftDux

**Repository:** https://github.com/StevenLambion/SwiftDux
**Stars:** 200+
**Maintenu par:** Steven Lambion

#### Description

SwiftDux est une implémentation légère de Redux construite sur Combine et SwiftUI.

```swift
// État global
struct AppState: StateType {
    var movies: [Movie] = []
    var searchText: String = ""
}

// Actions
enum AppAction: Action {
    case updateSearchText(String)
    case setMovies([Movie])
}

// Reducer
func appReducer(state: AppState, action: AppAction) -> AppState {
    var state = state
    switch action {
    case .updateSearchText(let text):
        state.searchText = text
    case .setMovies(let movies):
        state.movies = movies
    }
    return state
}

// Store
let store = Store(
    state: AppState(),
    reducer: appReducer
)
```

#### Avantages SwiftDux

- Plus simple et léger que TCA
- Moins de boilerplate
- Redux pur (plus proche de Redux JS)

#### Inconvénients SwiftDux

- Moins mature que TCA (moins de stars)
- Moins de features (pas de time-travel, logging limité)
- Communauté plus petite
- Documentation moins fournie

---

### Option 3: Redux custom (implémentation maison)

**Repository:** Tutoriel de Majid Jabrayilov - https://swiftwithmajid.com/2019/09/18/redux-like-state-container-in-swiftui/

#### Exemple d'implémentation

```swift
// Store générique
final class Store<State, Action>: ObservableObject {
    @Published private(set) var state: State

    private let reducer: (inout State, Action) -> Void

    init(initialState: State, reducer: @escaping (inout State, Action) -> Void) {
        self.state = initialState
        self.reducer = reducer
    }

    func dispatch(_ action: Action) {
        reducer(&state, action)
    }
}

// État applicatif
struct AppState {
    var movies: [Movie] = []
    var searchText: String = ""
}

// Actions
enum AppAction {
    case updateSearchText(String)
    case setMovies([Movie])
}

// Reducer
func appReducer(state: inout AppState, action: AppAction) {
    switch action {
    case .updateSearchText(let text):
        state.searchText = text
    case .setMovies(let movies):
        state.movies = movies
    }
}

// Usage dans SwiftUI
struct MoviesView: View {
    @EnvironmentObject var store: Store<AppState, AppAction>

    var body: some View {
        List(store.state.movies) { movie in
            Text(movie.name)
        }
        .searchable(text: $store.state.searchText)
        .onChange(of: store.state.searchText) { newValue in
            store.dispatch(.updateSearchText(newValue))
        }
    }
}
```

#### Avantages Redux custom

- Contrôle total sur l'implémentation
- Pas de dépendance externe
- Apprentissage approfondi de Redux
- Léger (quelques centaines de lignes)

#### Inconvénients Redux custom

- Maintenance à faire soi-même
- Pas de features avancées (time-travel, logging, etc.)
- Risque de bugs non documentés
- Pas de support communautaire

---

### Option 4: @Observable + @Environment (natif SwiftUI)

**Approche:** Utiliser les nouveaux outils SwiftUI iOS 17+ sans framework externe

```swift
// État global avec @Observable (iOS 17+)
@Observable
final class AppStore {
    var movies: [Movie] = []
    var searchText: String = ""
    var isLoading: Bool = false

    func updateSearchText(_ text: String) {
        searchText = text
        // Déclencher recherche ici
    }

    func loadMovies() async {
        isLoading = true
        movies = await MovieService.fetchMovies()
        isLoading = false
    }
}

// Injection dans la hiérarchie
@main
struct KanstrimiTVApp: App {
    @State private var appStore = AppStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(appStore)
        }
    }
}

// Usage dans les vues
struct MoviesView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        List(store.movies) { movie in
            Text(movie.name)
        }
        .searchable(text: $store.searchText)
        .task {
            await store.loadMovies()
        }
    }
}
```

#### Avantages @Observable

- **Natif SwiftUI** (pas de dépendance externe)
- **Simple à comprendre** (pas de courbe d'apprentissage)
- **Performant** (observation fine-grained intégrée)
- **iOS 17+ ready**

#### Inconvénients @Observable

- **Moins structuré** que Redux (pas de pattern imposé)
- **Pas de time-travel debugging**
- **Testabilité moyenne** (nécessite mocks manuels)
- **Pas de flux unidirectionnel garanti**

---

## Comparaison et recommandations

### Tableau comparatif

| Critère | TCA | SwiftDux | Redux Custom | @Observable Native |
|---------|-----|----------|--------------|-------------------|
| **Maturité** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Communauté** | 12k stars | 200 stars | - | Apple |
| **Documentation** | Excellente | Bonne | Tutoriels | Officielle |
| **Testabilité** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Debugging** | Time-travel | Basique | Basique | Xcode standard |
| **Courbe apprentissage** | Élevée | Moyenne | Moyenne | Faible |
| **Performance** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Boilerplate** | Moyen | Faible | Très faible | Minimal |
| **Async/Await** | Natif | Combine | Manuel | Natif |
| **SwiftUI integration** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

### Recommandation par scénario

#### Scénario 1: Application complexe, équipe expérimentée ➜ **TCA**

**Convient si:**
- L'équipe est prête à investir du temps d'apprentissage
- L'application va continuer à grandir (nouvelles features)
- La testabilité est une priorité
- Besoin de debugging avancé

**Avantages pour Kanstrimi TV:**
- Résout tous les problèmes de réactivité identifiés
- Gestion centralisée de l'état (movies, series, channels, filters, etc.)
- Testing simplifié (reducers purs)
- Async/await natif pour les appels API

**Migration suggérée:**
- Phase 1: Migrer les vues de recherche (SearchMovies, SearchSeries)
- Phase 2: Migrer les vues de listing (MoviesView, SeriesView)
- Phase 3: Migrer les vues de détail (MovieDetailView, SeriesDetailView)
- Phase 4: Migrer la gestion des filtres

---

#### Scénario 2: Besoin rapide, solution minimaliste ➜ **@Observable natif**

**Convient si:**
- Besoin d'une solution rapide sans dépendance
- Équipe petite ou peu familière avec Redux
- Application iOS 17+ uniquement (tvOS 17+)

**Avantages pour Kanstrimi TV:**
- Résout le problème de recherche immédiatement
- Pas de nouvelle dépendance
- Code simple et maintenable
- Performance native SwiftUI

**Migration suggérée:**
- Créer une classe `AppStore` avec `@Observable`
- Remplacer `@Query` dynamiques par des propriétés computed
- Conserver SwiftData pour la persistance

**Exemple concret pour SearchMovies:**

```swift
@Observable
final class MoviesStore {
    var allMovies: [Movie] = []
    var searchText: String = ""

    var filteredMovies: [Movie] {
        guard searchText.count >= 3 else { return [] }
        return allMovies.filter {
            $0.name.localizedStandardContains(searchText)
        }
    }

    func loadMovies() async {
        // Fetch depuis SwiftData
        allMovies = await StorageService.fetchMovies()
    }
}

struct SearchMovies: View {
    @Environment(MoviesStore.self) private var store

    var body: some View {
        List(store.filteredMovies) { movie in
            MovieCard(movie: movie)
        }
        .searchable(text: $store.searchText)
        .task { await store.loadMovies() }
    }
}
```

---

#### Scénario 3: Expérimentation Redux, budget limité ➜ **Redux Custom**

**Convient si:**
- Volonté d'apprendre Redux en profondeur
- Budget temps limité
- Pas besoin de features avancées

**Avantages:**
- Contrôle total
- Légèreté
- Pas de dépendance externe

**Inconvénients:**
- Maintenance manuelle
- Pas de support communautaire

---

### Recommandation finale pour Kanstrimi TV

**🎯 Approche recommandée : The Composable Architecture (TCA)**

#### Justification

1. **Problèmes résolus:**
   - ✅ Recherche dynamique réactive
   - ✅ Rafraîchissement en temps réel
   - ✅ Gestion centralisée des filtres
   - ✅ Debugging avancé
   - ✅ Tests unitaires simplifiés

2. **Investissement justifié:**
   - Application complexe avec beaucoup de features
   - Besoin de maintenir du code sur le long terme
   - tvOS nécessite une architecture robuste
   - Équipe semble expérimentée (code actuel bien structuré)

3. **Compatibilité:**
   - Fonctionne avec SwiftData (TCA = runtime state, SwiftData = persistance)
   - Compatible tvOS, iOS, macOS
   - Migration progressive possible

#### Alternative si contraintes de temps : @Observable natif

Si le temps d'apprentissage de TCA est un bloquant, **@Observable + @Environment natif** est une excellente alternative qui résoudrait rapidement les problèmes critiques.

---

## Plan de migration

### Stratégie : Migration progressive par feature

#### Phase 0: Préparation (1-2 jours)

1. **Ajouter la dépendance TCA**
   ```swift
   // Package.swift
   dependencies: [
       .package(url: "https://github.com/pointfreeco/swift-composable-architecture", from: "1.13.0")
   ]
   ```

2. **Étudier la documentation**
   - Lire le README officiel
   - Suivre le tutorial Point-Free (2-3h)
   - Explorer les exemples (TicTacToe, SpeechRecognition)

3. **Créer la structure de base**
   ```
   Kanstrimi TV/
   ├── Store/
   │   ├── AppState.swift           (état global)
   │   ├── AppAction.swift          (toutes les actions)
   │   ├── AppReducer.swift         (reducer principal)
   │   └── AppEnvironment.swift     (dépendances)
   └── Features/
       ├── Movies/
       │   ├── MoviesState.swift
       │   ├── MoviesAction.swift
       │   └── MoviesReducer.swift
       └── Search/
           ├── SearchState.swift
           ├── SearchAction.swift
           └── SearchReducer.swift
   ```

---

#### Phase 1: Migrer la recherche (2-3 jours) 🔴 PRIORITÉ

**Objectif:** Résoudre le problème critique de SearchMovies

**État feature Search:**
```swift
struct SearchState: Equatable {
    var searchText: String = ""
    var allMovies: [Movie] = []
    var isLoading: Bool = false

    var filteredMovies: [Movie] {
        guard searchText.count >= 3 else { return [] }
        return allMovies.filter { $0.name.localizedStandardContains(searchText) }
    }
}
```

**Actions:**
```swift
enum SearchAction: Equatable {
    case searchTextChanged(String)
    case loadMoviesRequested
    case moviesLoaded([Movie])
    case movieSelected(Movie)
}
```

**Reducer:**
```swift
let searchReducer = Reducer<SearchState, SearchAction, SearchEnvironment> { state, action, env in
    switch action {
    case .searchTextChanged(let text):
        state.searchText = text
        return .none

    case .loadMoviesRequested:
        state.isLoading = true
        return .run { send in
            let movies = await env.storageService.fetchMovies()
            await send(.moviesLoaded(movies))
        }

    case .moviesLoaded(let movies):
        state.allMovies = movies
        state.isLoading = false
        return .none

    case .movieSelected(let movie):
        // Navigation vers détail
        return .none
    }
}
```

**Vue mise à jour:**
```swift
struct SearchMovies: View {
    let store: StoreOf<SearchReducer>

    var body: some View {
        WithViewStore(store, observe: { $0 }) { viewStore in
            if viewStore.isLoading {
                ProgressView()
            } else {
                List(viewStore.filteredMovies) { movie in
                    Button { viewStore.send(.movieSelected(movie)) } label: {
                        MovieCard(movie: movie)
                    }
                }
                .searchable(
                    text: viewStore.binding(
                        get: \.searchText,
                        send: SearchAction.searchTextChanged
                    )
                )
            }
        }
        .task { await viewStore.send(.loadMoviesRequested).finish() }
    }
}
```

**Résultat:** Recherche 100% fonctionnelle et réactive ✅

---

#### Phase 2: Migrer MoviesView et listing (3-4 jours)

**État feature Movies:**
```swift
struct MoviesState: Equatable {
    var categories: IdentifiedArrayOf<Category> = []
    var moviesByCategory: [String: IdentifiedArrayOf<Movie>] = [:]
    var isLoading: Bool = false
    var selectedMovie: Movie?
}
```

**Actions:**
```swift
enum MoviesAction: Equatable {
    case loadCategoriesRequested
    case categoriesLoaded([Category])
    case loadMovies(categoryId: String)
    case moviesLoaded(categoryId: String, movies: [Movie])
    case movieTapped(Movie)
}
```

**Avantage:** Chargement par catégorie optimisé (plus de N+1)

---

#### Phase 3: Migrer MovieDetailView (2-3 jours)

**État feature MovieDetail:**
```swift
struct MovieDetailState: Equatable {
    var movie: Movie?
    var movieDetail: MovieDetail?
    var watchHistory: WatchHistory?
    var isLoadingDetail: Bool = false
}
```

**Effet pour chargement détail:**
```swift
return .run { [streamId = state.movie.streamId] send in
    let detail = await env.movieClient.loadDetail(streamId: streamId)
    await send(.detailLoaded(detail))
}
```

**Résultat:** Plus qu'1 seul état au lieu de 3 @Query ✅

---

#### Phase 4: Migrer les filtres (2 jours)

**État feature Filters:**
```swift
struct FiltersState: Equatable {
    var filters: IdentifiedArrayOf<ContentFilter> = []
    var isApplying: Bool = false
    var stats: FilterStats?
}
```

**Action apply:**
```swift
case .applyFiltersRequested:
    state.isApplying = true
    return .run { [filters = state.filters] send in
        let stats = await env.filterClient.apply(filters)
        await send(.filtersApplied(stats))
    }
```

---

#### Phase 5: Migrer Series et LiveTV (3-4 jours)

**Même approche que Movies**

---

#### Phase 6: Intégration globale (2-3 jours)

**AppState combiner tous les sous-états:**
```swift
struct AppState: Equatable {
    var movies = MoviesState()
    var series = SeriesState()
    var liveTV = LiveTVState()
    var search = SearchState()
    var filters = FiltersState()
    var account = AccountState()
}
```

**AppReducer combiner tous les reducers:**
```swift
let appReducer = Reducer.combine(
    moviesReducer.pullback(state: \.movies, action: /AppAction.movies, environment: { $0 }),
    seriesReducer.pullback(state: \.series, action: /AppAction.series, environment: { $0 }),
    searchReducer.pullback(state: \.search, action: /AppAction.search, environment: { $0 }),
    filtersReducer.pullback(state: \.filters, action: /AppAction.filters, environment: { $0 }),
    accountReducer.pullback(state: \.account, action: /AppAction.account, environment: { $0 })
)
```

---

#### Phase 7: Tests (2-3 jours)

**Exemple de test reducer:**
```swift
@MainActor
func testSearchTextChanged() async {
    let store = TestStore(
        initialState: SearchState(),
        reducer: searchReducer,
        environment: .mock
    )

    await store.send(.searchTextChanged("Avatar")) {
        $0.searchText = "Avatar"
    }
}
```

**Avantage TCA:** Tests 100% synchrones et déterministes ✅

---

### Estimation totale : 18-25 jours (3-4 semaines)

| Phase | Durée | Priorité |
|-------|-------|----------|
| Phase 0: Préparation | 1-2 jours | 🔴 |
| Phase 1: Recherche | 2-3 jours | 🔴 |
| Phase 2: Listing | 3-4 jours | 🟡 |
| Phase 3: Détails | 2-3 jours | 🟡 |
| Phase 4: Filtres | 2 jours | 🟡 |
| Phase 5: Series/Live | 3-4 jours | 🟢 |
| Phase 6: Intégration | 2-3 jours | 🟢 |
| Phase 7: Tests | 2-3 jours | 🟢 |

---

### Conservation de SwiftData

**SwiftData reste pour la persistance:**

```swift
// MovieClient utilise SwiftData en interne
struct MovieClient {
    var fetchMovies: () async throws -> [Movie]
    var loadDetail: (Int) async throws -> MovieDetail

    static let live = Self(
        fetchMovies: {
            // 1. Appel API si nécessaire
            if needsRefresh {
                let response = try await XtreamService.getMovies()
                try await StorageService.insertMovies(response)
            }

            // 2. Lecture depuis SwiftData
            return try await StorageService.fetchMovies()
        },
        loadDetail: { streamId in
            // Similaire : API + cache SwiftData
        }
    )
}
```

**Résultat:** TCA gère la réactivité, SwiftData gère la DB ✅

---

## Conclusion

### Synthèse

L'architecture actuelle de Kanstrimi TV avec **SwiftData + @Query** fonctionne bien pour les cas simples mais montre des **limitations critiques** pour :
- La recherche dynamique (predicates figés)
- Les queries multiples (N+1)
- Le rafraîchissement en temps réel

**The Composable Architecture (TCA)** est la solution recommandée car elle :
- ✅ Résout tous les problèmes identifiés
- ✅ Apporte testabilité et debugging avancé
- ✅ Est mature et bien maintenue (12k stars)
- ✅ Compatible avec SwiftData (cohabitation possible)
- ✅ Supporte tvOS nativement

### Migration recommandée

**Stratégie :** Progressive par feature (3-4 semaines)
**Priorité 1 :** Migrer la recherche (problème critique)
**Priorité 2 :** Migrer le listing et les détails
**Priorité 3 :** Migrer les filtres et séries

### Alternative si contraintes

Si l'investissement TCA est trop important à court terme, **@Observable natif** est une excellente alternative qui résoudrait les problèmes critiques en quelques jours avec un code simple et maintenable.

### Prochaines étapes

1. **Validation avec l'équipe** - Présenter cette étude et choisir l'approche
2. **POC** - Créer un prototype avec TCA sur SearchMovies (1-2 jours)
3. **Décision** - Go/No-Go basé sur le POC
4. **Planning** - Découper la migration en sprints
5. **Implémentation** - Suivre le plan de migration par phases

---

**Questions ou besoin de clarifications ? Contactez l'équipe architecture.**
