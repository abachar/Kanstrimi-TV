//
//  DomainServiceProtocol.swift
//  Kanstrimi TV
//
//  Created on 2025-10-30.
//  Protocole pour l'injection de dépendance du DomainService
//

import Foundation
import SwiftData
import SwiftUI

/// Protocole définissant l'interface du DomainService
/// Permet l'injection de MockDomainService dans les previews
@MainActor
protocol DomainServiceProtocol {
    /// ModelContainer exposé pour l'injection dans SwiftUI
    var modelContainer: ModelContainer { get }

    // MARK: - Movies

    /// Charge les détails d'un film si nécessaire
    func loadMovieDetailsIfNeeded(movie: Movie) async

    // MARK: - Series

    /// Charge les détails d'une série si nécessaire
    func loadSeriesDetailsIfNeeded(series: Series) async

    // MARK: - Account

    /// Crée un nouveau compte
    func createAccount(
        name: String,
        serverURL: String,
        username: String,
        password: String,
        onStepChange: @escaping (SyncStep) -> Void
    ) async throws -> Account

    /// Rafraîchit les données du compte
    func refreshAccount(account: Account, onStepChange: @escaping (SyncStep) -> Void) async throws

    /// Supprime toutes les données du compte
    func deleteAllAccountData()

    /// Supprime un compte et toutes ses données associées
    func deleteAccount(account: Account) async

    // MARK: - PlayerSettings

    /// Insère de nouveaux PlayerSettings dans la base de données
    func insertPlayerSettings(_ settings: PlayerSettings) throws

    /// Met à jour les PlayerSettings existants
    func updatePlayerSettings(_ settings: PlayerSettings) throws

    /// Récupère le nombre de PlayerSettings dans la base de données
    func getPlayerSettingsCount() throws -> Int

    // MARK: - Statistics

    /// Récupère le nombre de chaînes Live TV dans la base de données
    func getChannelsCount() throws -> Int

    /// Récupère le nombre de films dans la base de données
    func getMoviesCount() throws -> Int

    /// Récupère le nombre de séries dans la base de données
    func getSeriesCount() throws -> Int

    // MARK: - Episodes

    /// Récupère tous les épisodes d'une saison triés par numéro d'épisode
    func fetchEpisodes(seriesId: Int, seasonNumber: Int) throws -> [Episode]

    // MARK: - Watch History

    /// Récupère l'historique de visionnage pour un contenu donné
    func getWatchHistory(content: PlaybackContent) async -> WatchHistory?

    /// Sauvegarde ou met à jour l'historique de visionnage
    func saveWatchHistory(content: PlaybackContent, position: TimeInterval, duration: TimeInterval) async

    // MARK: - Filtering

    /// Applique tous les filtres actifs sur les catégories et contenus
    func applyFilters() async throws

    /// Récupère les statistiques de filtrage
    func getFilterStats() async throws -> FilterStats

    /// Sauvegarde un filtre
    func saveFilter(_ filter: ContentFilter) throws

    /// Supprime tous les filtres
    func deleteAllFilters() throws
}

// MARK: - Missing Domain Service (Default Value)

/// Service par défaut qui crash avec un message clair si aucun DomainService n'est injecté
@MainActor
private final class MissingDomainService: DomainServiceProtocol {
    var modelContainer: ModelContainer {
        fatalError("❌ No DomainService injected! Add .environment(\\.domainService, domainService) to your view hierarchy.")
    }

    func loadMovieDetailsIfNeeded(movie: Movie) async {
        fatalError("❌ No DomainService injected!")
    }

    func loadSeriesDetailsIfNeeded(series: Series) async {
        fatalError("❌ No DomainService injected!")
    }

    func createAccount(name: String, serverURL: String, username: String, password: String, onStepChange: @escaping (SyncStep) -> Void) async throws -> Account {
        fatalError("❌ No DomainService injected!")
    }

    func refreshAccount(account: Account, onStepChange: @escaping (SyncStep) -> Void) async throws {
        fatalError("❌ No DomainService injected!")
    }

    func deleteAllAccountData() {
        fatalError("❌ No DomainService injected!")
    }

    func deleteAccount(account: Account) async {
        fatalError("❌ No DomainService injected!")
    }

    func insertPlayerSettings(_ settings: PlayerSettings) throws {
        fatalError("❌ No DomainService injected!")
    }

    func updatePlayerSettings(_ settings: PlayerSettings) throws {
        fatalError("❌ No DomainService injected!")
    }

    func getPlayerSettingsCount() throws -> Int {
        fatalError("❌ No DomainService injected!")
    }

    func getChannelsCount() throws -> Int {
        fatalError("❌ No DomainService injected!")
    }

    func getMoviesCount() throws -> Int {
        fatalError("❌ No DomainService injected!")
    }

    func getSeriesCount() throws -> Int {
        fatalError("❌ No DomainService injected!")
    }

    func fetchEpisodes(seriesId: Int, seasonNumber: Int) throws -> [Episode] {
        fatalError("❌ No DomainService injected!")
    }

    func getWatchHistory(content: PlaybackContent) async -> WatchHistory? {
        fatalError("❌ No DomainService injected!")
    }

    func saveWatchHistory(content: PlaybackContent, position: TimeInterval, duration: TimeInterval) async {
        fatalError("❌ No DomainService injected!")
    }

    func applyFilters() async throws {
        fatalError("❌ No DomainService injected!")
    }

    func getFilterStats() async throws -> FilterStats {
        fatalError("❌ No DomainService injected!")
    }

    func saveFilter(_ filter: ContentFilter) throws {
        fatalError("❌ No DomainService injected!")
    }

    func deleteAllFilters() throws {
        fatalError("❌ No DomainService injected!")
    }
}

// MARK: - Environment Key

/// Clé d'environnement personnalisée pour DomainServiceProtocol
struct DomainServiceKey: EnvironmentKey {
    static let defaultValue: DomainServiceProtocol = MissingDomainService()
}

extension EnvironmentValues {
    /// Accès au DomainService via l'environnement SwiftUI
    var domainService: DomainServiceProtocol {
        get { self[DomainServiceKey.self] }
        set { self[DomainServiceKey.self] = newValue }
    }
}
