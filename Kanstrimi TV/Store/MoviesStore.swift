//
//  MoviesStore.swift
//  Kanstrimi TV
//
//  Created on 2025-11-02.
//  Store observable gérant l'état des films
//

import Foundation
import SwiftData

/// Store observable gérant l'état runtime des films
@Observable
@MainActor
final class MoviesStore {
    // MARK: - État runtime

    /// Toutes les catégories de films (chargées depuis SwiftData)
    var categories: [Category] = []

    /// Tous les films par catégorie (cache en mémoire)
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

    /// Trouve un film dans le cache par streamId
    func findMovie(by streamId: Int) -> Movie? {
        moviesByCategory.values
            .flatMap { $0 }
            .first { $0.extractedStreamId == streamId }
    }
}
