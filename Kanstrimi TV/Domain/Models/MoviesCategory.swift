//
//  MoviesCategory.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import Foundation
import SwiftUI
import SwiftData

/// Modèle représentant une catégorie de films
@Model
final class MoviesCategory {
    /// Identifiant unique de la catégorie
    var id: String

    /// ID de la catégorie (depuis l'API)
    var categoryId: String?

    /// Nom de la catégorie
    var name: String

    /// Ordre d'affichage (préservé depuis l'API Xtream)
    var sortOrder: Int

    init(
        categoryId: String,
        name: String,
        sortOrder: Int = 0
    ) {
        self.id = "movies-cat-\(categoryId)"
        self.categoryId = categoryId
        self.name = name
        self.sortOrder = sortOrder
    }
}

// MARK: - Preview Data
#if DEBUG
extension MoviesCategory {
    static var previewCategories: [MoviesCategory] {
        [
            MoviesCategory(
                categoryId: "2087",
                name: "✪ ORIGINAL AMAZON 2024/2025 MULTI",
                sortOrder: 0
            ),
            MoviesCategory(
                categoryId: "1535",
                name: "✪ ORIGINAL AMAZON  MULTI",
                sortOrder: 1
            )
        ]
    }
}
#endif
