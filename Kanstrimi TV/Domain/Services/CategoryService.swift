//
//  CategoryService.swift
//  Kanstrimi TV
//
//  Created on 2025-10-31.
//  Service gérant les catégories (Live, Movies, Series)
//

import Foundation
import SwiftData

/// Service gérant la logique métier des catégories
@MainActor
final class CategoryService {
    private let storageService: StorageService

    init(storageService: StorageService) {
        self.storageService = storageService
    }

    // MARK: - Insert

    /// Insère une liste de catégories dans la base de données
    /// - Parameter categories: Liste des catégories à insérer
    /// - Throws: Erreur si l'insertion échoue
    func insertCategories(_ categories: [Category]) throws {
        try storageService.insertAll(categories)
    }

    // MARK: - Delete

    /// Supprime toutes les catégories d'un type donné
    /// - Parameter contentType: Type de contenu à supprimer
    /// - Throws: Erreur si la suppression échoue
    func deleteCategories(contentType: Category.ContentType) throws {
        // Note: SwiftData ne permet pas de delete avec predicate, donc on doit fetch puis delete
        let contentTypeString = contentType.rawValue
        let descriptor = FetchDescriptor<Category>(
            predicate: #Predicate { $0.contentType == contentTypeString }
        )
        let categories = try storageService.fetch(descriptor)
        for category in categories {
            storageService.context.delete(category)
        }
        try storageService.save()
    }

    /// Supprime toutes les catégories (tous types confondus)
    /// - Throws: Erreur si la suppression échoue
    func deleteAllCategories() throws {
        try storageService.deleteAll(Category.self)
    }
}
