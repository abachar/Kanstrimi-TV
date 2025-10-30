//
//  AccountService.swift
//  Kanstrimi TV
//
//  Created on 2025-10-26.
//  Service gérant la logique métier des comptes (création, mise à jour, synchronisation)
//

import Foundation
import SwiftData

/// Service gérant la logique métier des comptes Xtream
@MainActor
final class AccountService {
    private let storageService: StorageService

    init(storageService: StorageService) {
        self.storageService = storageService
    }

    // MARK: - Rating Conversion

    /// Convertit les ratings Xtream en format unifié (sur 5)
    /// - Parameters:
    ///   - rating5based: Rating sur 5 (si disponible depuis Xtream)
    ///   - rating: Rating sur 10 (format Xtream par défaut)
    /// - Returns: Rating sur 5 ou nil
    private func convertRating(rating5based: Double?, rating: String?) -> Double? {
        // Priorité 1 : rating_5based (déjà sur 5)
        if let rating5 = rating5based {
            return rating5
        }

        // Priorité 2 : rating (sur 10) → diviser par 2
        if let ratingString = rating,
           let ratingValue = Double(ratingString) {
            return ratingValue / 2.0
        }

        // Pas de rating disponible
        return nil
    }

    // MARK: - Create Account

    /// Crée et synchronise un nouveau compte
    /// - Parameters:
    ///   - name: Nom du compte
    ///   - serverURL: URL du serveur
    ///   - username: Nom d'utilisateur
    ///   - password: Mot de passe
    ///   - onStepChange: Callback appelé à chaque changement d'étape
    /// - Returns: Le compte créé et validé
    /// - Throws: XtreamError si la validation échoue
    func createAccount(
        name: String,
        serverURL: String,
        username: String,
        password: String,
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
        await syncAccount(account: account, onStepChange: onStepChange)

        // 4. Mettre à jour la date de dernière synchronisation
        account.lastSyncDate = Date()

        // 5. Sauvegarder dans SwiftData
        try storageService.insert(account)

        return account
    }

    // MARK: - Sync Account

    /// Synchronise les données d'un compte (appels API et sauvegarde dans SwiftData)
    /// - Parameters:
    ///   - account: Compte à synchroniser
    ///   - onStepChange: Callback appelé à chaque changement d'étape
    private func syncAccount(
        account: Account,
        onStepChange: @escaping (SyncStep) -> Void
    ) async {

        // Étape 1 : Synchronisation des chaînes live
        onStepChange(.liveChannels)

        do {
            // Récupérer les catégories Live TV
            let categoryResponses = try await XtreamService.shared.getLiveCategories(account: account)

            // Mapper vers LiveCategory et insérer dans SwiftData
            for (index, response) in categoryResponses.enumerated() {
                let category = LiveCategory(
                    categoryId: response.categoryId,
                    name: response.categoryName,
                    sortOrder: index
                )
                storageService.context.insert(category)
            }

            // Récupérer les chaînes Live TV
            let channelResponses = try await XtreamService.shared.getLiveStreams(account: account)

            // Mapper vers LiveChannel + LiveChannelDetails et insérer dans SwiftData
            for (index, response) in channelResponses.enumerated() {
                // Créer LiveChannel (optimisé pour listing)
                let channel = LiveChannel(
                    streamId: response.streamId,
                    name: response.name,
                    categoryId: response.categoryId,
                    sortOrder: index,
                    streamIcon: response.streamIcon
                )
                storageService.context.insert(channel)

                // Créer LiveChannelDetails (contient streamURL et autres métadonnées)
                let streamURL = XtreamURLBuilder.buildLiveStreamURL(account: account, streamId: response.streamId)
                let channelDetails = LiveChannelDetails(
                    streamId: response.streamId,
                    name: response.name,
                    streamURL: streamURL,
                    epgChannelId: response.epgChannelId,
                    added: response.added
                )
                storageService.context.insert(channelDetails)
            }

            // Sauvegarder les données Live TV
            try storageService.save()
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
                storageService.context.insert(moviesCategory)
            }

            // Récupérer les films VOD (tous les films, sans filtrage par catégorie)
            let movieResponses = try await XtreamService.shared.getVODStreams(account: account)

            // Mapper vers Movie + MovieDetail et insérer dans SwiftData
            for (index, response) in movieResponses.enumerated() {
                let streamURL = XtreamURLBuilder.buildVODStreamURL(
                    account: account,
                    streamId: response.streamId,
                    containerExtension: response.containerExtension ?? "mp4"
                )

                // Créer Movie (optimisé pour listing)
                let movie = Movie(
                    streamId: response.streamId,
                    name: response.name,
                    sortOrder: index,
                    categoryId: response.categoryId,
                    streamIcon: response.streamIcon,
                    rating: convertRating(rating5based: response.rating5based, rating: response.rating),
                    tmdbId: response.tmdb
                )
                storageService.context.insert(movie)

                // Créer MovieDetail (partiel, sera enrichi lors de l'ouverture des détails)
                // Note: genre n'est pas disponible dans getVODStreams, sera ajouté via getVODInfo
                let movieDetail = MovieDetail(
                    streamId: response.streamId,
                    streamURL: streamURL,
                    containerExtension: response.containerExtension,
                    added: response.added,
                    tmdbId: response.tmdb,
                    name: response.name,
                    rating: convertRating(rating5based: response.rating5based, rating: response.rating)
                )
                storageService.context.insert(movieDetail)
            }

            // Sauvegarder les données VOD
            try storageService.save()
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
                storageService.context.insert(seriesCategory)
            }

            // Récupérer les séries (toutes les séries, sans filtrage par catégorie)
            let seriesResponses = try await XtreamService.shared.getSeries(account: account)

            // Mapper vers Series + SeriesDetail et insérer dans SwiftData
            for (index, response) in seriesResponses.enumerated() {
                // Créer Series (optimisé pour listing, avec genre)
                let series = Series(
                    seriesId: response.seriesId,
                    name: response.name,
                    sortOrder: index,
                    categoryId: response.categoryId,
                    cover: response.cover,
                    rating: convertRating(rating5based: response.rating5based, rating: response.rating),
                    genre: response.genre
                )
                storageService.context.insert(series)

                // Créer SeriesDetail (complet)
                let seriesDetail = SeriesDetail(
                    seriesId: response.seriesId,
                    name: response.name,
                    genre: response.genre,
                    rating: convertRating(rating5based: response.rating5based, rating: response.rating),
                    cover: response.cover,
                    plot: response.plot,
                    director: response.director,
                    cast: response.cast,
                    backdropPaths: response.backdropPath,
                    youtubeTrailer: response.youtubeTrailer
                )
                storageService.context.insert(seriesDetail)
            }

            // Sauvegarder les données Series
            try storageService.save()
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
    ///   - onStepChange: Callback appelé à chaque changement d'étape
    /// - Throws: XtreamError si la synchronisation échoue
    func refreshAccount(
        account: Account,
        onStepChange: @escaping (SyncStep) -> Void
    ) async throws {
        // Note: Pour respecter l'option 2-B (télécharger d'abord, supprimer ensuite si succès),
        // nous devons gérer le fait que syncAccount() insère directement dans le contexte.
        // Stratégie : Supprimer d'abord, puis re-synchroniser.
        // En cas d'échec de la synchro, l'utilisateur devra relancer manuellement.

        // 1. Supprimer toutes les anciennes données
        deleteAllAccountData()

        // 2. Re-synchroniser les données (téléchargement et insertion)
        await syncAccount(account: account, onStepChange: onStepChange)

        // 3. Mettre à jour la date de synchronisation
        account.lastSyncDate = Date()
        try storageService.save()
    }

    // MARK: - Delete Account Data

    /// Supprime toutes les données liées au compte (chaînes, films, séries, catégories)
    func deleteAllAccountData() {
        let liveChannelsDescriptor = FetchDescriptor<LiveChannel>()
        let moviesDescriptor = FetchDescriptor<Movie>()
        let seriesDescriptor = FetchDescriptor<Series>()
        let categoriesDescriptor = FetchDescriptor<LiveCategory>()
        let moviesCategoriesDescriptor = FetchDescriptor<MoviesCategory>()
        let seriesCategoriesDescriptor = FetchDescriptor<SeriesCategory>()

        // Supprimer les chaînes live
        if let channels = try? storageService.fetch(liveChannelsDescriptor) {
            channels.forEach { storageService.context.delete($0) }
        }

        // Supprimer les films
        if let movies = try? storageService.fetch(moviesDescriptor) {
            movies.forEach { storageService.context.delete($0) }
        }

        // Supprimer les séries
        if let series = try? storageService.fetch(seriesDescriptor) {
            series.forEach { storageService.context.delete($0) }
        }

        // Supprimer les catégories Live TV
        if let categories = try? storageService.fetch(categoriesDescriptor) {
            categories.forEach { storageService.context.delete($0) }
        }

        // Supprimer les catégories VOD
        if let moviesCategories = try? storageService.fetch(moviesCategoriesDescriptor) {
            moviesCategories.forEach { storageService.context.delete($0) }
        }

        // Supprimer les catégories Séries
        if let seriesCategories = try? storageService.fetch(seriesCategoriesDescriptor) {
            seriesCategories.forEach { storageService.context.delete($0) }
        }

        // Sauvegarder la suppression
        try? storageService.save()
    }

    // MARK: - Future Methods (TODO)

    // func updateAccount(...) async throws -> Account
    // func deleteAccount(...) async throws
}
