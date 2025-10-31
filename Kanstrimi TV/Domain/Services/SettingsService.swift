//
//  SettingsService.swift
//  Kanstrimi TV
//
//  Created on 2025-10-31.
//  Service gérant les paramètres de l'application
//

import Foundation
import SwiftData

/// Service gérant la logique métier des paramètres
@MainActor
final class SettingsService {
    private let storageService: StorageService

    init(storageService: StorageService) {
        self.storageService = storageService
    }

    // MARK: - PlayerSettings

    /// Insère de nouveaux PlayerSettings dans la base de données
    /// - Parameter settings: Paramètres de lecture à insérer
    /// - Throws: Erreur si l'insertion échoue
    func insertPlayerSettings(_ settings: PlayerSettings) throws {
        try storageService.insert(settings)
    }

    /// Met à jour les PlayerSettings existants
    /// - Parameter settings: Paramètres de lecture à mettre à jour
    /// - Throws: Erreur si la mise à jour échoue
    func updatePlayerSettings(_ settings: PlayerSettings) throws {
        try storageService.save()
    }

    /// Récupère le nombre de PlayerSettings dans la base de données
    /// - Returns: Nombre de PlayerSettings
    /// - Throws: Erreur si la récupération échoue
    func getPlayerSettingsCount() throws -> Int {
        let descriptor = FetchDescriptor<PlayerSettings>()
        return try storageService.fetchCount(descriptor)
    }

    // MARK: - Statistics

    /// Récupère le nombre de chaînes Live TV dans la base de données
    /// - Returns: Nombre de chaînes Live TV
    /// - Throws: Erreur si la récupération échoue
    func getChannelsCount() throws -> Int {
        let descriptor = FetchDescriptor<LiveChannel>()
        return try storageService.fetchCount(descriptor)
    }

    /// Récupère le nombre de films dans la base de données
    /// - Returns: Nombre de films
    /// - Throws: Erreur si la récupération échoue
    func getMoviesCount() throws -> Int {
        let descriptor = FetchDescriptor<Movie>()
        return try storageService.fetchCount(descriptor)
    }

    /// Récupère le nombre de séries dans la base de données
    /// - Returns: Nombre de séries
    /// - Throws: Erreur si la récupération échoue
    func getSeriesCount() throws -> Int {
        let descriptor = FetchDescriptor<Series>()
        return try storageService.fetchCount(descriptor)
    }

    // MARK: - Episodes

    /// Récupère tous les épisodes d'une saison triés par numéro d'épisode
    /// - Parameters:
    ///   - seriesId: ID de la série
    ///   - seasonNumber: Numéro de la saison
    /// - Returns: Liste des épisodes triés
    /// - Throws: Erreur si la récupération échoue
    func fetchEpisodes(seriesId: Int, seasonNumber: Int) throws -> [Episode] {
        let descriptor = FetchDescriptor<Episode>(
            predicate: #Predicate<Episode> { ep in
                ep.seriesId == seriesId && ep.seasonNumber == seasonNumber
            },
            sortBy: [SortDescriptor(\Episode.episodeNum)]
        )
        return try storageService.fetch(descriptor)
    }

    // MARK: - Watch History

    /// Récupère l'historique de visionnage pour un contenu donné
    /// - Parameter content: Contenu de lecture
    /// - Returns: Historique de visionnage ou nil si non trouvé
    func getWatchHistory(content: PlaybackContent) async -> WatchHistory? {
        let streamId: Int
        let contentType: String
        let episodeId: String?

        switch content {
        case .liveChannel:
            return nil // Pas de WatchHistory pour Live TV

        case .movie(let movieDetail):
            streamId = movieDetail.streamId
            contentType = "movie"
            episodeId = nil

        case .episode(let episode, _, _, _):
            streamId = episode.seriesId
            contentType = "series"
            episodeId = episode.episodeId
        }

        // Construire le predicate
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

        return try? storageService.fetchOne(descriptor)
    }

    /// Sauvegarde ou met à jour l'historique de visionnage
    /// - Parameters:
    ///   - content: Contenu de lecture
    ///   - position: Position actuelle (en secondes)
    ///   - duration: Durée totale (en secondes)
    func saveWatchHistory(content: PlaybackContent, position: TimeInterval, duration: TimeInterval) async {
        // Ignorer Live TV
        guard content.contentType == .vod else { return }

        // Ignorer les positions invalides
        guard position > 0, duration > 0 else { return }

        let streamId: Int
        let contentType: String
        let episodeId: String?

        switch content {
        case .liveChannel:
            return

        case .movie(let movieDetail):
            streamId = movieDetail.streamId
            contentType = "movie"
            episodeId = nil

        case .episode(let episode, _, _, _):
            streamId = episode.seriesId
            contentType = "series"
            episodeId = episode.episodeId
        }

        // Chercher l'historique existant
        if let existingHistory = await getWatchHistory(content: content) {
            // Mettre à jour
            existingHistory.lastPosition = position
            existingHistory.duration = duration
            existingHistory.lastWatchedDate = Date()
        } else {
            // Créer nouveau
            let newHistory = WatchHistory(
                streamId: streamId,
                contentType: contentType,
                episodeId: episodeId,
                lastPosition: position,
                duration: duration,
                lastWatchedDate: Date()
            )
            try? storageService.insert(newHistory)
        }

        // Sauvegarder
        try? storageService.save()
    }
}
