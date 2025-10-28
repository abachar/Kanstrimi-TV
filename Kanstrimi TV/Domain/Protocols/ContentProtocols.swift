//
//  ContentProtocols.swift
//  Kanstrimi TV
//
//  Created on 2025-10-28.
//  Protocoles communs pour harmoniser les types de contenu
//

import Foundation
import SwiftUI
import SwiftData

// MARK: - Searchable Protocol

/// Protocole pour les entités recherchables
protocol Searchable: Identifiable {
    /// Nom de l'entité utilisé pour la recherche
    var name: String { get }

    /// Ordre de tri
    var sortOrder: Int { get }
}

// MARK: - SearchConfiguration

/// Configuration pour la vue de recherche générique
struct SearchConfiguration {
    let title: String
    let searchPrompt: String
    let emptyIcon: String
    let minCharacters: Int

    init(
        title: String,
        searchPrompt: String,
        emptyIcon: String,
        minCharacters: Int = 3
    ) {
        self.title = title
        self.searchPrompt = searchPrompt
        self.emptyIcon = emptyIcon
        self.minCharacters = minCharacters
    }
}
