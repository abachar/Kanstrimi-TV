//
//  LiveCategory.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import Foundation
import SwiftUI
import SwiftData

/// Modèle représentant une catégorie de chaines
@Model
final class LiveCategory {
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
        self.id = "live-cat-\(categoryId)"
        self.categoryId = categoryId
        self.name = name
        self.sortOrder = sortOrder
    }
}

// MARK: - Preview Data
#if DEBUG
extension LiveCategory {
    static var previewCategories: [LiveCategory] {
        [
            LiveCategory(
                categoryId: "470",
                name: "|AR| ✪ BEIN SPORT 4K",
                sortOrder: 0
            ),
            LiveCategory(
                categoryId: "969",
                name: "|AR| ✪ BEIN SPORT ULTRA ᵁᴴᴰ",
                sortOrder: 1
            ),
            LiveCategory(
                categoryId: "8",
                name: "|AR| ✪ BEIN SPORT HD",
                sortOrder: 2
            )
        ]
    }
}
#endif
