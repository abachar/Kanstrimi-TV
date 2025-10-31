//
//  SeriesService.swift
//  Kanstrimi TV
//
//  Created on 2025-10-31.
//  Service gérant les séries TV
//

import Foundation
import SwiftData

/// Service gérant la logique métier des séries TV
@MainActor
final class SeriesService {
    private let storageService: StorageService

    init(storageService: StorageService) {
        self.storageService = storageService
    }

    // MARK: - Insert

    /// Insère une liste de séries dans la base de données
    /// - Parameter series: Liste des séries à insérer
    /// - Throws: Erreur si l'insertion échoue
    func insertSeries(_ series: [Series]) throws {
        try storageService.insertAll(series)
    }

    /// Insère une liste de SeriesDetail dans la base de données
    /// - Parameter details: Liste des détails de séries à insérer
    /// - Throws: Erreur si l'insertion échoue
    func insertSeriesDetails(_ details: [SeriesDetail]) throws {
        try storageService.insertAll(details)
    }

    // MARK: - Load Details

    /// Charge les détails d'une série si nécessaire (crée le SeriesDetail, les saisons et épisodes)
    /// - Parameter series: Série dont charger les détails
    func loadDetailsIfNeeded(series: Series) async {
        // Extraire le seriesId depuis l'ID
        guard let seriesId = series.extractedSeriesId else {
            print("SeriesService: Impossible d'extraire seriesId depuis series.id=\(series.id)")
            return
        }

        // Vérifier si les détails existent déjà
        let descriptor = FetchDescriptor<SeriesDetail>(
            predicate: #Predicate { $0.seriesId == seriesId }
        )

        // Si les détails existent déjà, ne rien faire
        guard (try? storageService.fetchOne(descriptor)) == nil else {
            return
        }

        // Charger depuis Xtream + TMDB
        guard let account = try? storageService.fetchOne(FetchDescriptor<Account>()) else {
            print("SeriesService: Aucun compte actif")
            return
        }

        do {
            // Appel Xtream pour récupérer les détails de la série
            let xtreamDetail = try await XtreamService.shared.getSeriesInfo(
                account: account,
                seriesId: seriesId
            )

            // Recherche TMDB pour enrichir les données (pas de tmdbId dans SeriesDetailInfo)
            let castImages: [String] = []

            // Créer SeriesDetail et insérer dans la DB
            let detail = SeriesDetail(
                seriesId: seriesId,
                tmdbId: nil,
                name: xtreamDetail.info?.name,
                genre: xtreamDetail.info?.genre,
                rating: xtreamDetail.info?.rating5based,
                year: xtreamDetail.info?.releaseDate,
                cover: xtreamDetail.info?.cover,
                plot: xtreamDetail.info?.plot,
                director: xtreamDetail.info?.director,
                cast: xtreamDetail.info?.cast,
                castImages: castImages,
                backdropPaths: xtreamDetail.info?.backdropPath,
                youtubeTrailer: xtreamDetail.info?.youtubeTrailer
            )

            await MainActor.run {
                try? storageService.insert(detail)

                // Créer les saisons et épisodes
                guard let episodes = xtreamDetail.episodes else { return }
                for (seasonNumberStr, episodesDict) in episodes {
                    guard let seasonNumber = Int(seasonNumberStr) else { continue }

                    // Créer la saison
                    let season = SeriesSeason(
                        seriesId: seriesId,
                        seasonNumber: seasonNumber
                    )
                    storageService.context.insert(season)

                    // Créer les épisodes
                    for episodeData in episodesDict {
                        guard let episodeId = episodeData.id else { continue }

                        // Construire l'URL de streaming de l'épisode
                        let serverURL = account.serverURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
                        let ext = episodeData.containerExtension ?? "mp4"
                        let streamURL = "\(serverURL)/series/\(account.username)/\(account.password)/\(episodeId).\(ext)"

                        let episode = Episode(
                            seriesId: seriesId,
                            seasonNumber: seasonNumber,
                            episodeNum: episodeData.episodeNum,
                            episodeId: episodeId,
                            title: episodeData.title,
                            overview: episodeData.info?.overview,
                            airDate: episodeData.info?.airDate,
                            rating: episodeData.info?.rating,
                            duration: episodeData.info?.duration,
                            durationSecs: episodeData.info?.durationSecs,
                            movieImage: episodeData.info?.movieImage,
                            streamURL: streamURL,
                            containerExtension: episodeData.containerExtension
                        )
                        storageService.context.insert(episode)
                    }
                }

                try? storageService.save()
            }

            print("SeriesService: Détails de la série \(series.name) chargés avec succès")
        } catch {
            print("SeriesService: Erreur chargement détails série: \(error)")
        }
    }

    // MARK: - Delete

    /// Supprime toutes les séries et leurs détails
    /// - Throws: Erreur si la suppression échoue
    func deleteAllSeries() throws {
        try storageService.deleteAll(Series.self)
        try storageService.deleteAll(SeriesDetail.self)
        try storageService.deleteAll(SeriesSeason.self)
        try storageService.deleteAll(Episode.self)
    }
}
