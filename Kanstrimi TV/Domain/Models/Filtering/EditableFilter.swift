//
//  EditableFilter.swift
//  Kanstrimi TV
//
//  Created on 2025-11-01.
//

import Foundation

/// Struct temporaire pour l'édition en mémoire des filtres
/// Utilisée par FilterManagementView pour permettre des modifications locales sans persistence immédiate
struct EditableFilter: Identifiable {
    let id: String
    var text: String
    var isActive: Bool
    var isInclusive: Bool
    var priority: Int
    var applyToLive: Bool
    var applyToMovies: Bool
    var applyToSeries: Bool

    /// Initializer depuis un ContentFilter existant
    init(from filter: ContentFilter) {
        self.id = filter.id
        self.text = filter.text
        self.isActive = filter.isActive
        self.isInclusive = filter.isInclusive
        self.priority = filter.priority
        self.applyToLive = filter.applyToLive
        self.applyToMovies = filter.applyToMovies
        self.applyToSeries = filter.applyToSeries
    }

    /// Initializer pour un nouveau filtre
    /// Priority est défini à 0 par défaut (sera réassigné lors de la sauvegarde)
    init() {
        self.id = UUID().uuidString
        self.text = ""
        self.isActive = true
        self.isInclusive = true
        self.priority = 0
        self.applyToLive = false
        self.applyToMovies = false
        self.applyToSeries = false
    }

    /// Convertir vers ContentFilter pour persistence
    func toContentFilter() -> ContentFilter {
        let filter = ContentFilter(
            text: self.text,
            isActive: self.isActive,
            isInclusive: self.isInclusive,
            priority: self.priority,
            applyToLive: self.applyToLive,
            applyToMovies: self.applyToMovies,
            applyToSeries: self.applyToSeries
        )
        filter.id = self.id
        return filter
    }
}
