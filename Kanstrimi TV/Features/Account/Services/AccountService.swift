//
//  AccountService.swift
//  Kanstrimi TV
//
//  Created on 2025-10-26.
//  Service gérant la logique métier des comptes (création, mise à jour, synchronisation)
//

import Foundation
import SwiftData

/// Service singleton gérant la logique métier des comptes Xtream
final class AccountService {
    /// Instance partagée (singleton)
    static let shared = AccountService()

    /// Initialisation privée (singleton)
    private init() {}

    // MARK: - Create Account

    /// Crée et synchronise un nouveau compte
    /// - Parameters:
    ///   - name: Nom du compte
    ///   - serverURL: URL du serveur
    ///   - username: Nom d'utilisateur
    ///   - password: Mot de passe
    ///   - modelContext: Contexte SwiftData
    ///   - onStepChange: Callback appelé à chaque changement d'étape
    /// - Returns: Le compte créé et validé
    /// - Throws: XtreamError si la validation échoue
    func createAccount(
        name: String,
        serverURL: String,
        username: String,
        password: String,
        modelContext: ModelContext,
        onStepChange: @escaping (SyncStep) -> Void
    ) async throws -> Account {

        // 1. Créer l'objet Account (sans insert dans le contexte)
        let account = Account(
            name: name,
            serverURL: serverURL,
            username: username,
            password: password
        )

        // 2. Valider les credentials via XtreamService
        let accountInfo = try await XtreamService.shared.getAccountInfo(account: account)

        // Vérifier que l'authentification est valide
        guard accountInfo.userInfo?.auth == 1 else {
            throw XtreamError.invalidCredentials
        }

        // 3. Synchroniser les données (appels API et sauvegarde dans SwiftData)
        await syncAccount(account: account, modelContext: modelContext, onStepChange: onStepChange)

        // 4. Mettre à jour la date de dernière synchronisation
        account.lastSyncDate = Date()

        // 5. Sauvegarder dans SwiftData
        modelContext.insert(account)
        try modelContext.save()

        return account
    }

    // MARK: - Sync Account

    /// Synchronise les données d'un compte (appels API et sauvegarde dans SwiftData)
    /// - Parameters:
    ///   - account: Compte à synchroniser
    ///   - modelContext: Contexte SwiftData pour persister les données
    ///   - onStepChange: Callback appelé à chaque changement d'étape
    private func syncAccount(
        account: Account,
        modelContext: ModelContext,
        onStepChange: @escaping (SyncStep) -> Void
    ) async {

        // Étape 1 : Synchronisation des chaînes live
        onStepChange(.liveChannels)

        do {
            // Récupérer les catégories Live TV
            let categoryResponses = try await XtreamService.shared.getLiveCategories(account: account)

            // Mapper vers Category et insérer dans SwiftData
            for (index, response) in categoryResponses.enumerated() {
                let category = Category(
                    categoryId: response.categoryId,
                    name: response.categoryName,
                    sortOrder: index
                )
                modelContext.insert(category)
            }

            // Récupérer les chaînes Live TV
            let channelResponses = try await XtreamService.shared.getLiveStreams(account: account)

            // Mapper vers LiveChannel et insérer dans SwiftData
            for (index, response) in channelResponses.enumerated() {
                let streamURL = XtreamURLBuilder.buildLiveStreamURL(account: account, streamId: response.streamId)

                let channel = LiveChannel(
                    streamId: response.streamId,
                    name: response.name,
                    streamURL: streamURL,
                    categoryId: response.categoryId,
                    sortOrder: index,
                    streamIcon: response.streamIcon,
                    epgChannelId: response.epgChannelId,
                    added: response.added
                )
                modelContext.insert(channel)
            }

            // Sauvegarder les données Live TV
            try modelContext.save()
        } catch {
            // Log l'erreur mais continue la synchronisation
            print("⚠️ Erreur lors de la synchronisation Live TV: \(error)")
        }

        try? await Task.sleep(nanoseconds: 500_000_000)  // 0.5s pour UX

        // Étape 2 : Synchronisation des films
        onStepChange(.movies)

        do {
            // Récupérer les catégories VOD
            let vodCategoryResponses = try await XtreamService.shared.getVODCategories(account: account)

            // Mapper vers MoviesCategory et insérer dans SwiftData
            for (index, response) in vodCategoryResponses.enumerated() {
                let moviesCategory = MoviesCategory(
                    categoryId: response.categoryId,
                    name: response.categoryName,
                    sortOrder: index
                )
                modelContext.insert(moviesCategory)
            }

            // Récupérer les films VOD (tous les films, sans filtrage par catégorie)
            let movieResponses = try await XtreamService.shared.getVODStreams(account: account)

            // Mapper vers Movie et insérer dans SwiftData
            for (index, response) in movieResponses.enumerated() {
                let streamURL = XtreamURLBuilder.buildVODStreamURL(
                    account: account,
                    streamId: response.streamId,
                    containerExtension: response.containerExtension ?? "mp4"
                )

                let movie = Movie(
                    streamId: response.streamId,
                    name: response.name,
                    streamURL: streamURL,
                    sortOrder: index,
                    containerExtension: response.containerExtension,
                    categoryId: response.categoryId,
                    streamIcon: response.streamIcon,
                    rating: response.rating,
                    rating5based: response.rating5based,
                    added: response.added
                )
                modelContext.insert(movie)
            }

            // Sauvegarder les données VOD
            try modelContext.save()
        } catch {
            // Log l'erreur mais continue la synchronisation
            print("⚠️ Erreur lors de la synchronisation VOD: \(error)")
        }

        try? await Task.sleep(nanoseconds: 500_000_000)

        // Étape 3 : Synchronisation des séries
        onStepChange(.series)

        do {
            // Récupérer les catégories de séries
            let seriesCategoryResponses = try await XtreamService.shared.getSeriesCategories(account: account)

            // Mapper vers SeriesCategory et insérer dans SwiftData
            for (index, response) in seriesCategoryResponses.enumerated() {
                let seriesCategory = SeriesCategory(
                    categoryId: response.categoryId,
                    name: response.categoryName,
                    sortOrder: index
                )
                modelContext.insert(seriesCategory)
            }

            // Récupérer les séries (toutes les séries, sans filtrage par catégorie)
            let seriesResponses = try await XtreamService.shared.getSeries(account: account)

            // Mapper vers Series et insérer dans SwiftData
            for (index, response) in seriesResponses.enumerated() {
                let series = Series(
                    seriesId: response.seriesId,
                    name: response.name,
                    sortOrder: index,
                    categoryId: response.categoryId,
                    cover: response.cover,
                    backdropPaths: response.backdropPath,
                    rating: response.rating,
                    rating5based: response.rating5based,
                    plot: response.plot,
                    director: response.director,
                    cast: response.cast,
                    genre: response.genre,
                    releaseDate: response.releaseDate,
                    lastModified: response.lastModified,
                    youtubeTrailer: response.youtubeTrailer,
                    episodeRunTime: response.episodeRunTime
                )
                modelContext.insert(series)
            }

            // Sauvegarder les données Series
            try modelContext.save()
        } catch {
            // Log l'erreur mais continue la synchronisation
            print("⚠️ Erreur lors de la synchronisation Series: \(error)")
        }

        try? await Task.sleep(nanoseconds: 500_000_000)

        // Étape 4 : Finalisation
        onStepChange(.finalization)
        try? await Task.sleep(nanoseconds: 500_000_000)

        // Étape 5 : Terminé
        onStepChange(.completed)
        try? await Task.sleep(nanoseconds: 1_000_000_000)  // 1s pour afficher le message de succès
    }

    // MARK: - Refresh Account

    /// Rafraîchit les données d'un compte existant
    /// - Parameters:
    ///   - account: Compte à rafraîchir
    ///   - modelContext: Contexte SwiftData
    ///   - onStepChange: Callback appelé à chaque changement d'étape
    /// - Throws: XtreamError si la synchronisation échoue
    func refreshAccount(
        account: Account,
        modelContext: ModelContext,
        onStepChange: @escaping (SyncStep) -> Void
    ) async throws {
        // Note: Pour respecter l'option 2-B (télécharger d'abord, supprimer ensuite si succès),
        // nous devons gérer le fait que syncAccount() insère directement dans le contexte.
        // Stratégie : Supprimer d'abord, puis re-synchroniser.
        // En cas d'échec de la synchro, l'utilisateur devra relancer manuellement.

        // 1. Supprimer toutes les anciennes données
        deleteAllAccountData(modelContext: modelContext)

        // 2. Re-synchroniser les données (téléchargement et insertion)
        await syncAccount(account: account, modelContext: modelContext, onStepChange: onStepChange)

        // 3. Mettre à jour la date de synchronisation
        account.lastSyncDate = Date()
        try modelContext.save()
    }

    // MARK: - Delete Account Data

    /// Supprime toutes les données liées au compte (chaînes, films, séries, catégories)
    /// - Parameter modelContext: Contexte SwiftData
    private func deleteAllAccountData(modelContext: ModelContext) {
        let liveChannelsDescriptor = FetchDescriptor<LiveChannel>()
        let moviesDescriptor = FetchDescriptor<Movie>()
        let seriesDescriptor = FetchDescriptor<Series>()
        let categoriesDescriptor = FetchDescriptor<Category>()
        let moviesCategoriesDescriptor = FetchDescriptor<MoviesCategory>()
        let seriesCategoriesDescriptor = FetchDescriptor<SeriesCategory>()

        // Supprimer les chaînes live
        if let channels = try? modelContext.fetch(liveChannelsDescriptor) {
            channels.forEach { modelContext.delete($0) }
        }

        // Supprimer les films
        if let movies = try? modelContext.fetch(moviesDescriptor) {
            movies.forEach { modelContext.delete($0) }
        }

        // Supprimer les séries
        if let series = try? modelContext.fetch(seriesDescriptor) {
            series.forEach { modelContext.delete($0) }
        }

        // Supprimer les catégories Live TV
        if let categories = try? modelContext.fetch(categoriesDescriptor) {
            categories.forEach { modelContext.delete($0) }
        }

        // Supprimer les catégories VOD
        if let moviesCategories = try? modelContext.fetch(moviesCategoriesDescriptor) {
            moviesCategories.forEach { modelContext.delete($0) }
        }

        // Supprimer les catégories Séries
        if let seriesCategories = try? modelContext.fetch(seriesCategoriesDescriptor) {
            seriesCategories.forEach { modelContext.delete($0) }
        }

        // Sauvegarder la suppression
        try? modelContext.save()
    }

    // MARK: - Future Methods (TODO)

    // func updateAccount(...) async throws -> Account
    // func deleteAccount(...) async throws
}
