//
//  MockDomainService.swift
//  Kanstrimi TV
//
//  Created on 2025-10-30.
//  Mock du DomainService pour les previews SwiftUI
//

import Foundation
import SwiftData

/// Version mockée du DomainService pour les previews
/// Utilise un ModelContainer en mémoire au lieu du StorageService
@Observable
@MainActor
final class MockDomainService: DomainServiceProtocol {
    private let mockContainer: ModelContainer

    /// ModelContainer exposé pour l'injection dans SwiftUI (comme DomainService)
    var modelContainer: ModelContainer {
        mockContainer
    }

    /// Context SwiftData du container mocké
    private var context: ModelContext {
        mockContainer.mainContext
    }

    init(container: ModelContainer) {
        self.mockContainer = container
    }

    // MARK: - PlayerSettings

    func insertPlayerSettings(_ settings: PlayerSettings) throws {
        context.insert(settings)
        try context.save()
    }

    func updatePlayerSettings(_ settings: PlayerSettings) throws {
        try context.save()
    }

    func getPlayerSettingsCount() throws -> Int {
        let descriptor = FetchDescriptor<PlayerSettings>()
        return try context.fetchCount(descriptor)
    }

    // MARK: - Statistics

    func getChannelsCount() throws -> Int {
        let descriptor = FetchDescriptor<LiveChannel>()
        return try context.fetchCount(descriptor)
    }

    func getMoviesCount() throws -> Int {
        let descriptor = FetchDescriptor<Movie>()
        return try context.fetchCount(descriptor)
    }

    func getSeriesCount() throws -> Int {
        let descriptor = FetchDescriptor<Series>()
        return try context.fetchCount(descriptor)
    }

    // MARK: - Episodes

    func fetchEpisodes(seriesId: Int, seasonNumber: Int) throws -> [Episode] {
        let descriptor = FetchDescriptor<Episode>(
            predicate: #Predicate<Episode> { ep in
                ep.seriesId == seriesId && ep.seasonNumber == seasonNumber
            },
            sortBy: [SortDescriptor(\Episode.episodeNum)]
        )
        return try context.fetch(descriptor)
    }

    // MARK: - Movies

    /// Charge les détails d'un film si nécessaire (version simplifiée pour preview)
    func loadMovieDetailsIfNeeded(movie: Movie) async {
        // Version simplifiée pour preview : ne fait rien
        // Les détails sont déjà présents dans le container mocké
    }

    // MARK: - Series

    /// Charge les détails d'une série si nécessaire (version simplifiée pour preview)
    func loadSeriesDetailsIfNeeded(series: Series) async {
        // Version simplifiée pour preview : ne fait rien
        // Les détails sont déjà présents dans le container mocké
    }

    // MARK: - Account

    /// Crée un nouveau compte (non implémenté pour preview)
    func createAccount(
        name: String,
        serverURL: String,
        username: String,
        password: String,
        onStepChange: @escaping (SyncStep) -> Void
    ) async throws -> Account {
        fatalError("MockDomainService.createAccount() should not be called in previews")
    }

    /// Rafraîchit les données du compte (non implémenté pour preview)
    func refreshAccount(account: Account, onStepChange: @escaping (SyncStep) -> Void) async throws {
        fatalError("MockDomainService.refreshAccount() should not be called in previews")
    }

    /// Supprime toutes les données du compte (non implémenté pour preview)
    func deleteAllAccountData() {
        fatalError("MockDomainService.deleteAllAccountData() should not be called in previews")
    }

    /// Supprime un compte (version simplifiée pour preview)
    @MainActor
    func deleteAccount(account: Account) async {
        context.delete(account)
        try? context.save()
    }

    // MARK: - Watch History

    /// Récupère l'historique de visionnage pour un contenu donné
    func getWatchHistory(content: PlaybackContent) async -> WatchHistory? {
        let streamId: Int
        let contentType: String
        let episodeId: String?

        switch content {
        case .liveChannel:
            return nil

        case .movie(let movieDetail):
            streamId = movieDetail.streamId
            contentType = "movie"
            episodeId = nil

        case .episode(let episode, _, _, _):
            streamId = episode.seriesId
            contentType = "series"
            episodeId = episode.episodeId
        }

        let descriptor: FetchDescriptor<WatchHistory>
        if let episodeId = episodeId {
            descriptor = FetchDescriptor<WatchHistory>(
                predicate: #Predicate {
                    $0.streamId == streamId &&
                    $0.contentType == contentType &&
                    $0.episodeId == episodeId
                }
            )
        } else {
            descriptor = FetchDescriptor<WatchHistory>(
                predicate: #Predicate {
                    $0.streamId == streamId &&
                    $0.contentType == contentType
                }
            )
        }

        return try? context.fetch(descriptor).first
    }

    /// Sauvegarde ou met à jour l'historique de visionnage (version simplifiée pour preview)
    func saveWatchHistory(content: PlaybackContent, position: TimeInterval, duration: TimeInterval) async {
        // Version simplifiée pour preview : ne fait rien
    }
}
