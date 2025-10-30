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
protocol Searchable {
    /// Nom de l'entité utilisé pour la recherche
    var name: String { get }

    /// Ordre de tri
    var sortOrder: Int { get }
}

// MARK: - CardDisplayable Protocol

/// Protocole pour les entités affichables en carte
protocol CardDisplayable {
    /// Nom affiché sur la carte
    var name: String { get }

    /// URL de l'image (poster, cover, logo)
    var imageURL: String? { get }

    /// Note sur 5 étoiles (optionnel)
    var rating: Double? { get }
}

// MARK: - CardConfiguration

/// Style de carte (portrait vs landscape)
enum CardStyle {
    case portrait(width: CGFloat, height: CGFloat)  // Ex: 180x270
    case landscape(width: CGFloat, height: CGFloat) // Ex: 200x120
}

/// Configuration pour les cartes de contenu
struct CardConfiguration {
    let style: CardStyle
    let aspectMode: ContentMode
    let emptyIcon: String
    let showName: Bool

    init(
        style: CardStyle,
        aspectMode: ContentMode = .fill,
        emptyIcon: String,
        showName: Bool = false
    ) {
        self.style = style
        self.aspectMode = aspectMode
        self.emptyIcon = emptyIcon
        self.showName = showName
    }
}

// MARK: - HeroDisplayable Protocol

/// Protocole pour les entités affichables en section hero
protocol HeroDisplayable {
    /// URL du backdrop (image de fond)
    var backdropURL: String? { get }

    /// URL du poster
    var posterURL: String? { get }

    /// Titre principal
    var title: String { get }

    /// Année de sortie
    var year: String? { get }

    /// Durée (optionnel, pour les films)
    var duration: String? { get }

    /// Note sur 5 étoiles
    var rating: Double? { get }

    /// Genre(s)
    var genre: String? { get }

    /// Icône pour le fallback du poster
    var fallbackIcon: String { get }
}

/// Configuration pour la section hero
struct HeroConfiguration {
    let showDuration: Bool
    let fallbackIcon: String

    init(showDuration: Bool = false, fallbackIcon: String) {
        self.showDuration = showDuration
        self.fallbackIcon = fallbackIcon
    }
}
