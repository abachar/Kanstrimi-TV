//
//  SeriesDetailService.swift
//  Kanstrimi TV
//
//  Created on 2025-10-27.
//  Service gérant le chargement des détails d'une série et l'enrichissement TMDB
//

import Foundation
import SwiftData

/// Service singleton gérant les détails des séries
final class SeriesDetailService {
    /// Instance partagée (singleton)
    static let shared = SeriesDetailService()

    /// Initialisation privée (singleton)
    private init() {}

    // MARK: - Load Series Detail

    /// Charge les détails d'une série depuis l'API Xtream et enrichit avec TMDB
    /// - Parameters:
    ///   - series: Série pour laquelle charger les détails
    ///   - account: Compte Xtream
    ///   - modelContext: Contexte SwiftData
    /// - Returns: SeriesDetail créé ou mis à jour
    /// - Throws: XtreamError si l'appel API échoue
    func loadSeriesDetail(
        series: Series,
        account: Account,
        modelContext: ModelContext
    ) async throws -> SeriesDetail {
        print("🔄 [SeriesDetailService] Début du chargement pour seriesId: \(series.seriesId)")
        print("🔍 [SeriesDetailService] ModelContext: \(ObjectIdentifier(modelContext))")

        // 1. Récupérer les infos détaillées depuis Xtream
        let seriesInfo = try await XtreamService.shared.getSeriesInfo(
            account: account,
            seriesId: series.seriesId
        )
        print("✅ [SeriesDetailService] Réponse API reçue pour seriesId: \(series.seriesId)")

        // 2. Créer ou mettre à jour le SeriesDetail
        let seriesDetail = createOrUpdateSeriesDetail(
            from: seriesInfo,
            seriesId: series.seriesId,
            modelContext: modelContext
        )
        print("✅ [SeriesDetailService] SeriesDetail créé/mis à jour")

        // 3. Créer ou mettre à jour les Seasons
        if let seasons = seriesInfo.seasons {
            createOrUpdateSeasons(
                seasons: seasons,
                seriesId: series.seriesId,
                modelContext: modelContext
            )
            print("✅ [SeriesDetailService] \(seasons.count) saisons insérées")

            // Vérifier immédiatement après l'insertion
            let currentSeriesId = series.seriesId
            let verifyDescriptor = FetchDescriptor<SeriesSeason>(
                predicate: #Predicate<SeriesSeason> { $0.seriesId == currentSeriesId }
            )
            if let count = try? modelContext.fetchCount(verifyDescriptor) {
                print("🔍 [SeriesDetailService] Vérification immédiate : \(count) saisons dans le contexte pour seriesId \(currentSeriesId)")
            }
        } else {
            print("⚠️ [SeriesDetailService] Aucune saison dans la réponse API")
        }

        // 4. Créer ou mettre à jour les Episodes
        if let episodesDict = seriesInfo.episodes {
            let totalEpisodes = episodesDict.values.flatMap { $0 }.count
            createOrUpdateEpisodes(
                episodesDict: episodesDict,
                seriesId: series.seriesId,
                account: account,
                modelContext: modelContext
            )
            print("✅ [SeriesDetailService] \(totalEpisodes) épisodes insérés")

            // Log détaillé par saison
            for (seasonKey, episodes) in episodesDict.sorted(by: { $0.key < $1.key }) {
                print("   - Saison \(seasonKey): \(episodes.count) épisodes")
            }
        } else {
            print("⚠️ [SeriesDetailService] Aucun épisode dans la réponse API")
        }

        // 5. Enrichir avec TMDB si tmdbId est disponible
        if let tmdbId = seriesDetail.tmdbId {
            do {
                try await enrichWithTMDB(seriesDetail: seriesDetail, tmdbId: tmdbId)
                print("✅ [SeriesDetailService] Enrichissement TMDB réussi")
            } catch {
                // Si l'enrichissement TMDB échoue, on continue quand même
                print("⚠️ [SeriesDetailService] Erreur lors de l'enrichissement TMDB: \(error)")
            }
        }

        // 6. Sauvegarder les modifications
        seriesDetail.lastUpdated = Date()
        try modelContext.save()
        print("✅ [SeriesDetailService] Modifications sauvegardées dans SwiftData")

        return seriesDetail
    }

    // MARK: - Create or Update SeriesDetail

    /// Crée ou met à jour un SeriesDetail depuis SeriesInfo
    private func createOrUpdateSeriesDetail(
        from seriesInfo: SeriesInfo,
        seriesId: Int,
        modelContext: ModelContext
    ) -> SeriesDetail {
        // Vérifier si un SeriesDetail existe déjà
        let descriptor = FetchDescriptor<SeriesDetail>(
            predicate: #Predicate { $0.seriesId == seriesId }
        )

        let existingDetail = try? modelContext.fetch(descriptor).first

        let seriesDetail: SeriesDetail
        if let existing = existingDetail {
            // Mettre à jour l'existant
            seriesDetail = existing
        } else {
            // Créer un nouveau SeriesDetail
            seriesDetail = SeriesDetail(seriesId: seriesId)
            modelContext.insert(seriesDetail)
        }

        // Remplir les données depuis seriesInfo
        if let info = seriesInfo.info {
            // Extraire tmdbId depuis backdropPath si disponible (format TMDB)
            // Note: l'API Xtream peut retourner un tmdbId dans certains champs
            seriesDetail.tmdbId = extractTmdbId(from: info)

            seriesDetail.name = info.name
            seriesDetail.genre = info.genre
            seriesDetail.rating = info.rating5based
            seriesDetail.cover = info.cover
            seriesDetail.plot = info.plot
            seriesDetail.director = info.director
            seriesDetail.cast = info.cast
            seriesDetail.backdropPaths = info.backdropPath
            seriesDetail.youtubeTrailer = info.youtubeTrailer

            // Extraire l'année depuis releaseDate (format YYYY-MM-DD ou YYYY)
            if let releaseDate = info.releaseDate {
                seriesDetail.year = String(releaseDate.prefix(4))
            }
        }

        return seriesDetail
    }

    // MARK: - Create or Update Seasons

    /// Crée ou met à jour les saisons depuis SeriesInfo
    private func createOrUpdateSeasons(
        seasons: [Season],
        seriesId: Int,
        modelContext: ModelContext
    ) {
        for seasonData in seasons {
            let seasonNumber = seasonData.seasonNumber

            // Vérifier si la saison existe déjà
            let descriptor = FetchDescriptor<SeriesSeason>(
                predicate: #Predicate {
                    $0.seriesId == seriesId && $0.seasonNumber == seasonNumber
                }
            )

            let existingSeason = try? modelContext.fetch(descriptor).first

            let season: SeriesSeason
            if let existing = existingSeason {
                season = existing
            } else {
                season = SeriesSeason(seriesId: seriesId, seasonNumber: seasonNumber)
                modelContext.insert(season)
            }

            // Remplir les données
            season.name = seasonData.name
            season.overview = seasonData.overview
            season.airDate = seasonData.airDate
            season.episodeCount = seasonData.episodeCount
            season.coverTmdb = seasonData.coverTmdb
        }
    }

    // MARK: - Create or Update Episodes

    /// Crée ou met à jour les épisodes depuis SeriesInfo
    private func createOrUpdateEpisodes(
        episodesDict: [String: [EpisodeInfo]],
        seriesId: Int,
        account: Account,
        modelContext: ModelContext
    ) {
        for (seasonKey, episodes) in episodesDict {
            guard let seasonNumber = Int(seasonKey) else { continue }

            for episodeData in episodes {
                let episodeNum = episodeData.episodeNum

                // Vérifier si l'épisode existe déjà
                let descriptor = FetchDescriptor<Episode>(
                    predicate: #Predicate {
                        $0.seriesId == seriesId &&
                        $0.seasonNumber == seasonNumber &&
                        $0.episodeNum == episodeNum
                    }
                )

                let existingEpisode = try? modelContext.fetch(descriptor).first

                let episode: Episode
                if let existing = existingEpisode {
                    episode = existing
                } else {
                    // Construire l'URL de streaming
                    let streamURL = buildStreamURL(
                        account: account,
                        seriesId: seriesId,
                        episodeId: episodeData.id ?? "",
                        containerExtension: episodeData.containerExtension ?? "mkv"
                    )

                    episode = Episode(
                        seriesId: seriesId,
                        seasonNumber: seasonNumber,
                        episodeNum: episodeNum,
                        episodeId: episodeData.id ?? "",
                        streamURL: streamURL
                    )
                    modelContext.insert(episode)
                }

                // Remplir les données
                episode.title = episodeData.title
                episode.containerExtension = episodeData.containerExtension

                if let info = episodeData.info {
                    episode.overview = info.overview
                    episode.airDate = info.airDate
                    episode.rating = info.rating
                    episode.duration = info.duration
                    episode.durationSecs = info.durationSecs
                    episode.movieImage = info.movieImage
                }
            }
        }
    }

    // MARK: - Build Stream URL

    /// Construit l'URL de streaming pour un épisode
    /// Format Xtream: http://server:port/series/username/password/seriesId/episodeId.ext
    func buildStreamURL(
        account: Account,
        seriesId: Int,
        episodeId: String,
        containerExtension: String
    ) -> String {
        return "\(account.serverURL)/series/\(account.username)/\(account.password)/\(seriesId)/\(episodeId).\(containerExtension)"
    }

    // MARK: - Enrich with TMDB

    /// Enrichit un SeriesDetail avec les données TMDB (images des acteurs)
    /// - Parameters:
    ///   - seriesDetail: SeriesDetail à enrichir
    ///   - tmdbId: ID TMDB de la série
    /// - Throws: TMDBError si l'appel API échoue
    func enrichWithTMDB(seriesDetail: SeriesDetail, tmdbId: Int) async throws {
        // Récupérer les crédits depuis TMDB
        let credits = try await TMDBService.shared.getSeriesCredits(tmdbId: tmdbId)

        // Extraire les URLs des images des acteurs (limiter à 12 acteurs)
        let castImageURLs = credits.cast
            .prefix(12)
            .compactMap { $0.profileImageURL }

        // Mettre à jour le SeriesDetail
        seriesDetail.castImages = castImageURLs
    }

    // MARK: - Helper Methods

    /// Extrait le tmdbId depuis SeriesDetailInfo
    /// Note: Le tmdbId n'est pas toujours présent dans l'API Xtream
    private func extractTmdbId(from info: SeriesDetailInfo) -> Int? {
        // Tentative d'extraction depuis categoryId (certains providers l'utilisent)
        // Sinon retourne nil
        // TODO: Implémenter une vraie extraction si le provider le supporte
        return nil
    }
}
