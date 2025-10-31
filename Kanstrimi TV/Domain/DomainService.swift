//
//  DomainService.swift
//  Kanstrimi TV
//
//  Created on 2025-10-27.
//  Façade centrale pour coordonner les services métier spécialisés
//

import Foundation
import SwiftData

/// Façade centrale coordonnant tous les services métier spécialisés
@Observable
@MainActor
final class DomainService: DomainServiceProtocol {
    // Services spécialisés
    private let storageService: StorageService
    private let categoryService: CategoryService
    private let liveChannelService: LiveChannelService
    private let movieService: MovieService
    private let seriesService: SeriesService
    private let settingsService: SettingsService
    private let accountService: AccountService

    /// ModelContainer exposé pour l'injection dans SwiftUI
    var modelContainer: ModelContainer {
        storageService.container
    }

    /// Initialisation par défaut (crée un nouveau StorageService)
    init() {
        self.storageService = StorageService()
        self.categoryService = CategoryService(storageService: storageService)
        self.liveChannelService = LiveChannelService(storageService: storageService)
        self.movieService = MovieService(storageService: storageService)
        self.seriesService = SeriesService(storageService: storageService)
        self.settingsService = SettingsService(storageService: storageService)

        // AccountService reçoit les services spécialisés
        self.accountService = AccountService(
            storageService: storageService,
            categoryService: categoryService,
            liveChannelService: liveChannelService,
            movieService: movieService,
            seriesService: seriesService
        )
    }

    /// Initialisation avec une instance de StorageService personnalisée (pour les tests)
    init(storageService: StorageService) {
        self.storageService = storageService
        self.categoryService = CategoryService(storageService: storageService)
        self.liveChannelService = LiveChannelService(storageService: storageService)
        self.movieService = MovieService(storageService: storageService)
        self.seriesService = SeriesService(storageService: storageService)
        self.settingsService = SettingsService(storageService: storageService)

        // AccountService reçoit les services spécialisés
        self.accountService = AccountService(
            storageService: storageService,
            categoryService: categoryService,
            liveChannelService: liveChannelService,
            movieService: movieService,
            seriesService: seriesService
        )
    }

    // MARK: - Movies

    /// Charge les détails d'un film si nécessaire (enrichit le MovieDetail existant)
    func loadMovieDetailsIfNeeded(movie: Movie) async {
        await movieService.loadDetailsIfNeeded(movie: movie)
    }

    // MARK: - Series

    /// Charge les détails d'une série si nécessaire (met à jour la DB)
    func loadSeriesDetailsIfNeeded(series: Series) async {
        await seriesService.loadDetailsIfNeeded(series: series)
    }

    // MARK: - Account

    /// Crée un nouveau compte (délégation à AccountService)
    func createAccount(
        name: String,
        serverURL: String,
        username: String,
        password: String,
        onStepChange: @escaping (SyncStep) -> Void
    ) async throws -> Account {
        try await accountService.createAccount(
            name: name,
            serverURL: serverURL,
            username: username,
            password: password,
            onStepChange: onStepChange
        )
    }

    /// Rafraîchit les données du compte
    func refreshAccount(account: Account, onStepChange: @escaping (SyncStep) -> Void) async throws {
        try await accountService.refreshAccount(
            account: account,
            onStepChange: onStepChange
        )
    }

    /// Supprime toutes les données du compte
    func deleteAllAccountData() {
        accountService.deleteAllAccountData()
    }

    /// Supprime un compte et toutes ses données associées
    /// - Parameter account: Le compte à supprimer
    @MainActor
    func deleteAccount(account: Account) async {
        // Supprimer toutes les données liées via AccountService
        accountService.deleteAllAccountData()

        // Supprimer le compte
        storageService.context.delete(account)

        // Sauvegarder
        try? storageService.save()

        print("✅ DomainService: Compte et données associées supprimés avec succès")
    }

    // MARK: - PlayerSettings

    /// Insère de nouveaux PlayerSettings dans la base de données
    func insertPlayerSettings(_ settings: PlayerSettings) throws {
        try settingsService.insertPlayerSettings(settings)
    }

    /// Met à jour les PlayerSettings existants
    func updatePlayerSettings(_ settings: PlayerSettings) throws {
        try settingsService.updatePlayerSettings(settings)
    }

    /// Récupère le nombre de PlayerSettings dans la base de données
    func getPlayerSettingsCount() throws -> Int {
        try settingsService.getPlayerSettingsCount()
    }

    // MARK: - Statistics

    /// Récupère le nombre de chaînes Live TV dans la base de données
    func getChannelsCount() throws -> Int {
        try settingsService.getChannelsCount()
    }

    /// Récupère le nombre de films dans la base de données
    func getMoviesCount() throws -> Int {
        try settingsService.getMoviesCount()
    }

    /// Récupère le nombre de séries dans la base de données
    func getSeriesCount() throws -> Int {
        try settingsService.getSeriesCount()
    }

    // MARK: - Episodes

    /// Récupère tous les épisodes d'une saison triés par numéro d'épisode
    func fetchEpisodes(seriesId: Int, seasonNumber: Int) throws -> [Episode] {
        try settingsService.fetchEpisodes(seriesId: seriesId, seasonNumber: seasonNumber)
    }

    // MARK: - Watch History

    /// Récupère l'historique de visionnage pour un contenu donné
    func getWatchHistory(content: PlaybackContent) async -> WatchHistory? {
        await settingsService.getWatchHistory(content: content)
    }

    /// Sauvegarde ou met à jour l'historique de visionnage
    func saveWatchHistory(content: PlaybackContent, position: TimeInterval, duration: TimeInterval) async {
        await settingsService.saveWatchHistory(content: content, position: position, duration: duration)
    }
}
