//
//  StorageService.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 27/10/2025.
//

import Foundation
import SwiftData

/// Service de gestion de la persistence avec SwiftData
@MainActor
final class StorageService {
    /// Container SwiftData
    private(set) var container: ModelContainer

    /// Context principal pour les opérations SwiftData
    var context: ModelContext {
        container.mainContext
    }

    init() {
        do {
            // Configuration du schéma avec tous les modèles
            let schema = Schema([
                Account.self,
                PlayerSettings.self,
                LiveCategory.self,
                LiveChannel.self,
                MoviesCategory.self,
                Movie.self,
                MovieDetail.self,
                WatchHistory.self,
                SeriesCategory.self,
                Series.self,
                SeriesDetail.self,
                SeriesSeason.self,
                Episode.self
            ])
 
            // Configuration du container
            let configuration = ModelConfiguration(
                schema: schema,
                isStoredInMemoryOnly: false,
                allowsSave: true
            )

            self.container = try ModelContainer(
                for: schema,
                configurations: [configuration]
            )

            print("✅ StorageService initialized successfully")
        } catch {
            fatalError("Failed to initialize StorageService: \(error)")
        }
    }
    
    // MARK: - Generic CRUD Operations

    /// Insère un nouvel élément
    /// - Parameter item: L'élément à insérer
    func insert<T: PersistentModel>(_ item: T) throws {
        context.insert(item)
        try context.save()
    }

    /// Insère plusieurs éléments
    /// - Parameter items: Les éléments à insérer
    func insertAll<T: PersistentModel>(_ items: [T]) throws {
        for item in items {
            context.insert(item)
        }
        try context.save()
    }

    /// Supprime un élément
    /// - Parameter item: L'élément à supprimer
    func delete<T: PersistentModel>(_ item: T) throws {
        context.delete(item)
        try context.save()
    }

    /// Supprime tous les éléments d'un type sans les charger en mémoire
    /// - Parameter type: Type des éléments à supprimer
    func deleteAll<T: PersistentModel>(_ type: T.Type) throws {
        try context.delete(model: T.self)
        try context.save()
    }

    /// Sauvegarde les changements du contexte
    func save() throws {
        try context.save()
    }

    /// Récupère tous les éléments correspondant à un FetchDescriptor
    /// - Parameter descriptor: Le descripteur de recherche
    /// - Returns: Les éléments trouvés
    func fetch<T: PersistentModel>(_ descriptor: FetchDescriptor<T>) throws -> [T] {
        try context.fetch(descriptor)
    }

    /// Compte les éléments correspondant à un FetchDescriptor
    /// - Parameter descriptor: Le descripteur de recherche
    /// - Returns: Le nombre d'éléments
    func fetchCount<T: PersistentModel>(_ descriptor: FetchDescriptor<T>) throws -> Int {
        try context.fetchCount(descriptor)
    }

    /// Récupère le premier élément correspondant à un FetchDescriptor
    /// - Parameter descriptor: Le descripteur de recherche
    /// - Returns: Le premier élément trouvé, ou nil
    func fetchOne<T: PersistentModel>(_ descriptor: FetchDescriptor<T>) throws -> T? {
        try context.fetch(descriptor).first
    }
}
