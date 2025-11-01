//
//  Category.swift
//  Kanstrimi TV
//
//  Created on 2025-10-31.
//  Modèle unifié pour toutes les catégories (Live, Movies, Series)
//

import Foundation
import SwiftData

/// Modèle unifié représentant une catégorie de contenu (Live TV, Movies, Series)
@Model
final class Category {
    /// Identifiant unique généré
    var id: String

    /// Type de contenu (stocké comme String pour compatibilité SwiftData Predicate)
    var contentType: String

    /// ID de la catégorie (depuis l'API Xtream)
    var categoryId: String

    /// Nom de la catégorie
    var name: String

    /// Ordre d'affichage (préservé depuis l'API Xtream)
    var sortOrder: Int

    /// Indique si la catégorie est active (après application des filtres)
    var active: Bool = true

    /// Type de contenu supporté
    enum ContentType: String, Codable {
        case live = "live"
        case movies = "movies"
        case series = "series"
    }

    init(
        contentType: ContentType,
        categoryId: String,
        name: String,
        sortOrder: Int
    ) {
        self.id = "\(contentType.rawValue)-cat-\(categoryId)"
        self.contentType = contentType.rawValue
        self.categoryId = categoryId
        self.name = name
        self.sortOrder = sortOrder
    }
}

// MARK: - Preview Data
#if DEBUG
extension Category {
    static var previewLiveCategories: [Category] {
        [
            Category(
                contentType: .live,
                categoryId: "470",
                name: "|AR| ✪ BEIN SPORT 4K",
                sortOrder: 0
            ),
            Category(
                contentType: .live,
                categoryId: "969",
                name: "|AR| ✪ BEIN SPORT ULTRA ᵁᴴᴰ",
                sortOrder: 1
            )
        ]
    }

    static var previewMoviesCategories: [Category] {
        [
            Category(
                contentType: .movies,
                categoryId: "2087",
                name: "✪ ORIGINAL AMAZON 2024/2025 MULTI",
                sortOrder: 0
            ),
            Category(
                contentType: .movies,
                categoryId: "1535",
                name: "✪ ORIGINAL AMAZON MULTI",
                sortOrder: 1
            )
        ]
    }

    static var previewSeriesCategories: [Category] {
        [
            Category(
                contentType: .series,
                categoryId: "632",
                name: "|MULTI| ✪ ENGLISH MULTISUB",
                sortOrder: 0
            ),
            Category(
                contentType: .series,
                categoryId: "2256",
                name: "✪ ORIGINAL MAX MULTI",
                sortOrder: 1
            )
        ]
    }
}
#endif
