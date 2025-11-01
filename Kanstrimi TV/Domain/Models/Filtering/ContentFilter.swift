//
//  ContentFilter.swift
//  Kanstrimi TV
//
//  Created on 2025-10-31.
//  Modèle représentant un filtre de contenu avec critères d'application
//

import Foundation
import SwiftData

/// Modèle représentant un filtre textuel pour les catégories et contenus
@Model
final class ContentFilter {
    /// Identifiant unique du filtre
    var id: String

    /// Texte du filtre (recherche insensible à la casse)
    var text: String

    /// Filtre activé/désactivé
    var isActive: Bool

    /// Mode du filtre (true = inclusion, false = exclusion)
    var isInclusive: Bool

    /// Priorité d'application (0 = plus prioritaire, ordre croissant)
    var priority: Int

    /// Appliquer le filtre sur les catégories
    var applyToCategories: Bool

    /// Appliquer le filtre sur les chaînes Live TV
    var applyToLive: Bool

    /// Appliquer le filtre sur les films VOD
    var applyToMovies: Bool

    /// Appliquer le filtre sur les séries TV
    var applyToSeries: Bool

    /// Initialisation d'un filtre de contenu
    init(
        text: String,
        isActive: Bool = true,
        isInclusive: Bool = true,
        priority: Int = 0,
        applyToCategories: Bool = false,
        applyToLive: Bool = false,
        applyToMovies: Bool = false,
        applyToSeries: Bool = false
    ) {
        self.id = UUID().uuidString
        self.text = text
        self.isActive = isActive
        self.isInclusive = isInclusive
        self.priority = priority
        self.applyToCategories = applyToCategories
        self.applyToLive = applyToLive
        self.applyToMovies = applyToMovies
        self.applyToSeries = applyToSeries
    }
}

// MARK: - Preview Data
#if DEBUG
extension ContentFilter {
    static var previewFilters: [ContentFilter] {
        [
            ContentFilter(
                text: "BEIN",
                isActive: true,
                isInclusive: true,
                priority: 0,
                applyToCategories: true,
                applyToLive: true,
                applyToMovies: false,
                applyToSeries: false
            ),
            ContentFilter(
                text: "4K",
                isActive: true,
                isInclusive: true,
                priority: 1,
                applyToCategories: false,
                applyToLive: true,
                applyToMovies: true,
                applyToSeries: false
            ),
            ContentFilter(
                text: "XXX",
                isActive: true,
                isInclusive: false,
                priority: 2,
                applyToCategories: true,
                applyToLive: true,
                applyToMovies: true,
                applyToSeries: true
            )
        ]
    }
}
#endif
