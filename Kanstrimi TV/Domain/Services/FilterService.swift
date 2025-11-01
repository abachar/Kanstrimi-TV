//
//  FilterService.swift
//  Kanstrimi TV
//
//  Created on 2025-10-31.
//  Service de gestion des filtres de contenu
//

import Foundation
import SwiftData

/// Structure contenant les statistiques de filtrage
struct FilterStats {
    let liveTotal: Int
    let liveActive: Int
    let moviesTotal: Int
    let moviesActive: Int
    let seriesTotal: Int
    let seriesActive: Int
}

/// Service gérant la logique de filtrage des catégories et contenus
@MainActor
final class FilterService {
    private let storageService: StorageService

    init(storageService: StorageService) {
        self.storageService = storageService
    }

    // MARK: - CRUD Filters

    /// Sauvegarde un filtre (création ou mise à jour)
    func saveFilter(_ filter: ContentFilter) throws {
        // Vérifier si le filtre existe déjà dans le contexte
        let filterId = filter.id
        let descriptor = FetchDescriptor<ContentFilter>(
            predicate: #Predicate { $0.id == filterId }
        )
        let existing = try storageService.fetchOne(descriptor)

        if existing == nil {
            // Nouveau filtre → insert
            try storageService.insert(filter)
        }

        // Si existe déjà, les modifications sont automatiquement trackées par SwiftData
        try storageService.save()
    }

    /// Supprime un filtre
    func deleteFilter(_ filter: ContentFilter) throws {
        try storageService.delete(filter)
        try storageService.save()
    }

    /// Réordonne les filtres en mettant à jour leurs priorités
    func reorderFilters(_ filters: [ContentFilter]) throws {
        for (index, filter) in filters.enumerated() {
            filter.priority = index
        }
        try storageService.save()
    }

    /// Récupère tous les filtres triés par priorité
    func fetchAllFilters() throws -> [ContentFilter] {
        let descriptor = FetchDescriptor<ContentFilter>(
            sortBy: [SortDescriptor(\.priority)]
        )
        return try storageService.fetch(descriptor)
    }

    // MARK: - Apply Filters

    /// Applique tous les filtres actifs sur les catégories et contenus
    func applyFilters() async throws {
        let filters = try fetchAllFilters().filter { $0.isActive }

        // 1. Réinitialiser tous les contenus à actif (avant d'appliquer les filtres)
        try await resetAllItemsToActive()

        // 2. Appliquer les filtres sur les catégories
        try await applyFiltersToCategories(filters)

        // 3. Appliquer les filtres sur les contenus
        try await applyFiltersToLiveChannels(filters)
        try await applyFiltersToMovies(filters)
        try await applyFiltersToSeries(filters)

        // 4. Désactiver les contenus dont la catégorie est désactivée
        try await deactivateItemsOfInactiveCategories()

        // 5. Désactiver les catégories dont tous les contenus sont inactifs
        try await deactivateCategoriesWithNoActiveItems()

        // 6. Sauvegarder une seule fois
        try storageService.save()
    }

    /// Réinitialise tous les items à actif avant d'appliquer les filtres
    private func resetAllItemsToActive() async throws {
        // Réinitialiser toutes les catégories
        let categoriesDescriptor = FetchDescriptor<Category>()
        let categories = try storageService.fetch(categoriesDescriptor)
        for category in categories {
            category.active = true
        }

        // Réinitialiser tous les live channels
        let liveDescriptor = FetchDescriptor<LiveChannel>()
        let channels = try storageService.fetch(liveDescriptor)
        for channel in channels {
            channel.active = true
        }

        // Réinitialiser tous les movies
        let movieDescriptor = FetchDescriptor<Movie>()
        let movies = try storageService.fetch(movieDescriptor)
        for movie in movies {
            movie.active = true
        }

        // Réinitialiser toutes les series
        let seriesDescriptor = FetchDescriptor<Series>()
        let series = try storageService.fetch(seriesDescriptor)
        for seriesItem in series {
            seriesItem.active = true
        }
    }

    // MARK: - Apply Filters (Private)

    private func applyFiltersToCategories(_ filters: [ContentFilter]) async throws {
        let categoriesFilters = filters.filter { $0.applyToCategories }
        guard !categoriesFilters.isEmpty else { return }

        let descriptor = FetchDescriptor<Category>()
        let categories = try storageService.fetch(descriptor)

        for category in categories {
            category.active = applyFiltersToItem(name: category.name, filters: categoriesFilters)
        }
    }

    private func applyFiltersToLiveChannels(_ filters: [ContentFilter]) async throws {
        let liveFilters = filters.filter { $0.applyToLive }
        guard !liveFilters.isEmpty else { return }

        let descriptor = FetchDescriptor<LiveChannel>()
        let channels = try storageService.fetch(descriptor)

        for channel in channels {
            channel.active = applyFiltersToItem(name: channel.name, filters: liveFilters)
        }
    }

    private func applyFiltersToMovies(_ filters: [ContentFilter]) async throws {
        let movieFilters = filters.filter { $0.applyToMovies }
        guard !movieFilters.isEmpty else { return }

        let descriptor = FetchDescriptor<Movie>()
        let movies = try storageService.fetch(descriptor)

        for movie in movies {
            movie.active = applyFiltersToItem(name: movie.name, filters: movieFilters)
        }
    }

    private func applyFiltersToSeries(_ filters: [ContentFilter]) async throws {
        let seriesFilters = filters.filter { $0.applyToSeries }
        guard !seriesFilters.isEmpty else { return }

        let descriptor = FetchDescriptor<Series>()
        let series = try storageService.fetch(descriptor)

        for seriesItem in series {
            seriesItem.active = applyFiltersToItem(name: seriesItem.name, filters: seriesFilters)
        }
    }

    /// Applique les filtres à un item individuel selon l'algorithme défini
    /// - Parameters:
    ///   - name: Nom de l'item à filtrer
    ///   - filters: Liste des filtres triés par priorité
    /// - Returns: true si l'item est actif, false sinon
    private func applyFiltersToItem(name: String, filters: [ContentFilter]) -> Bool {
        // Filtrer les filtres vides
        let validFilters = filters.filter { !$0.text.trimmingCharacters(in: .whitespaces).isEmpty }

        guard !validFilters.isEmpty else {
            return true // Aucun filtre valide, l'item reste actif
        }

        // Déterminer l'état initial en fonction du type de filtres
        let hasInclusiveFilters = validFilters.contains { $0.isInclusive }
        var active = !hasInclusiveFilters // Si des filtres inclusifs existent, par défaut inactif

        // Parcourir les filtres dans l'ordre de priorité
        for filter in validFilters {
            // Vérifier si le filtre matche (insensible à la casse)
            if name.localizedCaseInsensitiveContains(filter.text) {
                // Le dernier filtre qui matche détermine le résultat
                active = filter.isInclusive
            }
        }

        return active
    }

    /// Désactive les contenus appartenant à des catégories désactivées
    private func deactivateItemsOfInactiveCategories() async throws {
        // Récupérer les catégories inactives par type
        let categoriesDescriptor = FetchDescriptor<Category>(
            predicate: #Predicate { !$0.active }
        )
        let inactiveCategories = try storageService.fetch(categoriesDescriptor)

        // Grouper les catégories par type pour optimiser
        let inactiveLiveIds = Set(inactiveCategories.filter { $0.contentType == "live" }.map { $0.categoryId })
        let inactiveMovieIds = Set(inactiveCategories.filter { $0.contentType == "movies" }.map { $0.categoryId })
        let inactiveSeriesIds = Set(inactiveCategories.filter { $0.contentType == "series" }.map { $0.categoryId })

        // Désactiver les chaînes Live des catégories inactives
        if !inactiveLiveIds.isEmpty {
            let liveDescriptor = FetchDescriptor<LiveChannel>()
            let channels = try storageService.fetch(liveDescriptor)
            for channel in channels where inactiveLiveIds.contains(channel.categoryId) {
                channel.active = false
            }
        }

        // Désactiver les films des catégories inactives
        if !inactiveMovieIds.isEmpty {
            let movieDescriptor = FetchDescriptor<Movie>()
            let movies = try storageService.fetch(movieDescriptor)
            for movie in movies where movie.categoryId != nil && inactiveMovieIds.contains(movie.categoryId!) {
                movie.active = false
            }
        }

        // Désactiver les séries des catégories inactives
        if !inactiveSeriesIds.isEmpty {
            let seriesDescriptor = FetchDescriptor<Series>()
            let series = try storageService.fetch(seriesDescriptor)
            for seriesItem in series where seriesItem.categoryId != nil && inactiveSeriesIds.contains(seriesItem.categoryId!) {
                seriesItem.active = false
            }
        }
    }

    /// Désactive les catégories dont tous les contenus sont inactifs
    private func deactivateCategoriesWithNoActiveItems() async throws {
        // Pré-fetch tous les items actifs groupés par categoryId pour optimiser
        let activeLiveDescriptor = FetchDescriptor<LiveChannel>(
            predicate: #Predicate { $0.active }
        )
        let activeChannels = try storageService.fetch(activeLiveDescriptor)
        let activeLiveCategoryIds = Set(activeChannels.map { $0.categoryId })

        let activeMovieDescriptor = FetchDescriptor<Movie>(
            predicate: #Predicate { $0.active }
        )
        let activeMovies = try storageService.fetch(activeMovieDescriptor)
        let activeMovieCategoryIds = Set(activeMovies.compactMap { $0.categoryId })

        let activeSeriesDescriptor = FetchDescriptor<Series>(
            predicate: #Predicate { $0.active }
        )
        let activeSeries = try storageService.fetch(activeSeriesDescriptor)
        let activeSeriesCategoryIds = Set(activeSeries.compactMap { $0.categoryId })

        // Récupérer toutes les catégories
        let categoriesDescriptor = FetchDescriptor<Category>()
        let categories = try storageService.fetch(categoriesDescriptor)

        // Vérifier chaque catégorie
        for category in categories {
            let hasActiveItems: Bool

            switch category.contentType {
            case "live":
                hasActiveItems = activeLiveCategoryIds.contains(category.categoryId)

            case "movies":
                hasActiveItems = activeMovieCategoryIds.contains(category.categoryId)

            case "series":
                hasActiveItems = activeSeriesCategoryIds.contains(category.categoryId)

            default:
                hasActiveItems = true
            }

            // Désactiver la catégorie si elle n'a aucun contenu actif
            if !hasActiveItems {
                category.active = false
            }
        }
    }

    // MARK: - Statistics

    /// Calcule les statistiques de filtrage
    func getFilterStats() async throws -> FilterStats {
        // Live
        let liveTotalDescriptor = FetchDescriptor<LiveChannel>()
        let liveTotal = try storageService.fetchCount(liveTotalDescriptor)

        let liveActiveDescriptor = FetchDescriptor<LiveChannel>(
            predicate: #Predicate { $0.active }
        )
        let liveActive = try storageService.fetchCount(liveActiveDescriptor)

        // Movies
        let moviesTotalDescriptor = FetchDescriptor<Movie>()
        let moviesTotal = try storageService.fetchCount(moviesTotalDescriptor)

        let moviesActiveDescriptor = FetchDescriptor<Movie>(
            predicate: #Predicate { $0.active }
        )
        let moviesActive = try storageService.fetchCount(moviesActiveDescriptor)

        // Series
        let seriesTotalDescriptor = FetchDescriptor<Series>()
        let seriesTotal = try storageService.fetchCount(seriesTotalDescriptor)

        let seriesActiveDescriptor = FetchDescriptor<Series>(
            predicate: #Predicate { $0.active }
        )
        let seriesActive = try storageService.fetchCount(seriesActiveDescriptor)

        return FilterStats(
            liveTotal: liveTotal,
            liveActive: liveActive,
            moviesTotal: moviesTotal,
            moviesActive: moviesActive,
            seriesTotal: seriesTotal,
            seriesActive: seriesActive
        )
    }
}
