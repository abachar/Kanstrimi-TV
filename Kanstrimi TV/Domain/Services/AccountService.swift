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
    private let categoryService: CategoryService
    private let liveChannelService: LiveChannelService
    private let movieService: MovieService
    private let seriesService: SeriesService

    init(
        storageService: StorageService,
        categoryService: CategoryService,
        liveChannelService: LiveChannelService,
        movieService: MovieService,
        seriesService: SeriesService
    ) {
        self.storageService = storageService
        self.categoryService = categoryService
        self.liveChannelService = liveChannelService
        self.movieService = movieService
        self.seriesService = seriesService
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
    /// - Throws: NetworkError si la validation échoue
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
            throw NetworkError.invalidCredentials
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
            // Récupérer les catégories Live TV depuis Xtream
            let categoryResponses = try await XtreamService.shared.getLiveCategories(account: account)

            // Convertir en Category et insérer via CategoryService
            let categories = categoryResponses.enumerated().map { (index, response) in
                response.toCategory(sortOrder: index)
            }
            try categoryService.insertCategories(categories)

            // Récupérer les chaînes Live TV depuis Xtream
            let channelResponses = try await XtreamService.shared.getLiveStreams(account: account)

            // Convertir en LiveChannel et insérer via LiveChannelService
            let channels = channelResponses.enumerated().map { (index, response) in
                let streamURL = XtreamURLBuilder.buildLiveStreamURL(account: account, streamId: response.streamId)
                return response.toLiveChannel(sortOrder: index, streamURL: streamURL)
            }
            try liveChannelService.insertChannels(channels)

        } catch {
            print("⚠️ Erreur lors de la synchronisation Live TV: \(error)")
        }

        try? await Task.sleep(nanoseconds: 500_000_000)

        // Étape 2 : Synchronisation des films
        onStepChange(.movies)

        do {
            // Récupérer les catégories VOD depuis Xtream
            let vodCategoryResponses = try await XtreamService.shared.getVODCategories(account: account)

            // Convertir en Category et insérer via CategoryService
            let vodCategories = vodCategoryResponses.enumerated().map { (index, response) in
                response.toCategory(sortOrder: index)
            }
            try categoryService.insertCategories(vodCategories)

            // Récupérer les films VOD depuis Xtream
            let movieResponses = try await XtreamService.shared.getVODStreams(account: account)

            // Convertir en Movie et insérer via MovieService
            let movies = movieResponses.enumerated().map { (index, response) in
                let convertedRating = convertRating(rating5based: response.rating5based, rating: response.rating)
                return response.toMovie(sortOrder: index, convertedRating: convertedRating)
            }

            try movieService.insertMovies(movies)

        } catch {
            print("⚠️ Erreur lors de la synchronisation VOD: \(error)")
        }

        try? await Task.sleep(nanoseconds: 500_000_000)

        // Étape 3 : Synchronisation des séries
        onStepChange(.series)

        do {
            // Récupérer les catégories de séries depuis Xtream
            let seriesCategoryResponses = try await XtreamService.shared.getSeriesCategories(account: account)

            // Convertir en Category et insérer via CategoryService
            let seriesCategories = seriesCategoryResponses.enumerated().map { (index, response) in
                response.toCategory(sortOrder: index)
            }
            try categoryService.insertCategories(seriesCategories)

            // Récupérer les séries depuis Xtream
            let seriesResponses = try await XtreamService.shared.getSeries(account: account)

            // Convertir en Series et insérer via SeriesService
            let seriesList = seriesResponses.enumerated().map { (index, response) in
                let convertedRating = convertRating(rating5based: response.rating5based, rating: response.rating)
                return response.toSeries(sortOrder: index, convertedRating: convertedRating)
            }

            try seriesService.insertSeries(seriesList)

        } catch {
            print("⚠️ Erreur lors de la synchronisation Series: \(error)")
        }

        try? await Task.sleep(nanoseconds: 500_000_000)

        // Étape 4 : Finalisation
        onStepChange(.finalization)
        try? await Task.sleep(nanoseconds: 500_000_000)

        // Étape 5 : Terminé
        onStepChange(.completed)
        try? await Task.sleep(nanoseconds: 1_000_000_000)
    }

    // MARK: - Refresh Account

    /// Rafraîchit les données d'un compte existant
    /// - Parameters:
    ///   - account: Compte à rafraîchir
    ///   - onStepChange: Callback appelé à chaque changement d'étape
    /// - Throws: NetworkError si la synchronisation échoue
    func refreshAccount(
        account: Account,
        onStepChange: @escaping (SyncStep) -> Void
    ) async throws {
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
        // Utiliser les services spécialisés pour supprimer les données
        try? categoryService.deleteAllCategories()
        try? liveChannelService.deleteAllChannels()
        try? movieService.deleteAllMovies()
        try? seriesService.deleteAllSeries()
    }
}
