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

        // 1. Appliquer les filtres sur les catégories
        try await applyFiltersToCategories(filters)

        // 2. Appliquer les filtres sur les contenus
        try await applyFiltersToLiveChannels(filters)
        try await applyFiltersToMovies(filters)
        try await applyFiltersToSeries(filters)

        // 3. Désactiver les contenus dont la catégorie est désactivée
        try await deactivateItemsOfInactiveCategories()

        // 4. Désactiver les catégories dont tous les contenus sont inactifs
        try await deactivateCategoriesWithNoActiveItems()

        // 5. Sauvegarder une seule fois
        try storageService.save()
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
        var active = false

        // Parcourir les filtres dans l'ordre de priorité
        for filter in filters {
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
        // Récupérer les catégories inactives
        let inactiveCategoriesDescriptor = FetchDescriptor<Category>(
            predicate: #Predicate { !$0.active }
        )
        let inactiveCategories = try storageService.fetch(inactiveCategoriesDescriptor)
        let inactiveCategoryIds = Set(inactiveCategories.map { $0.categoryId })

        // Désactiver les chaînes Live des catégories inactives
        let liveDescriptor = FetchDescriptor<LiveChannel>()
        let channels = try storageService.fetch(liveDescriptor)
        for channel in channels where inactiveCategoryIds.contains(channel.categoryId) {
            channel.active = false
        }

        // Désactiver les films des catégories inactives
        let movieDescriptor = FetchDescriptor<Movie>()
        let movies = try storageService.fetch(movieDescriptor)
        for movie in movies where movie.categoryId != nil && inactiveCategoryIds.contains(movie.categoryId!) {
            movie.active = false
        }

        // Désactiver les séries des catégories inactives
        let seriesDescriptor = FetchDescriptor<Series>()
        let series = try storageService.fetch(seriesDescriptor)
        for seriesItem in series where seriesItem.categoryId != nil && inactiveCategoryIds.contains(seriesItem.categoryId!) {
            seriesItem.active = false
        }
    }

    /// Désactive les catégories dont tous les contenus sont inactifs
    private func deactivateCategoriesWithNoActiveItems() async throws {
        let categoriesDescriptor = FetchDescriptor<Category>()
        let categories = try storageService.fetch(categoriesDescriptor)

        for category in categories {
            // Vérifier selon le type de contenu
            let hasActiveItems: Bool

            // Capturer le categoryId avant de l'utiliser dans le predicate
            let categoryId = category.categoryId

            switch category.contentType {
            case "live":
                let liveDescriptor = FetchDescriptor<LiveChannel>(
                    predicate: #Predicate { channel in
                        channel.categoryId == categoryId && channel.active
                    }
                )
                let activeCount = try storageService.fetchCount(liveDescriptor)
                hasActiveItems = activeCount > 0

            case "movies":
                let movieDescriptor = FetchDescriptor<Movie>(
                    predicate: #Predicate { movie in
                        movie.categoryId == categoryId && movie.active
                    }
                )
                let activeCount = try storageService.fetchCount(movieDescriptor)
                hasActiveItems = activeCount > 0

            case "series":
                let seriesDescriptor = FetchDescriptor<Series>(
                    predicate: #Predicate { series in
                        series.categoryId == categoryId && series.active
                    }
                )
                let activeCount = try storageService.fetchCount(seriesDescriptor)
                hasActiveItems = activeCount > 0

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
