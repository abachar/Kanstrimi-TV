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
final class Category {
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
