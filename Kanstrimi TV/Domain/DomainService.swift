//
//  DomainService.swift
//  Kanstrimi TV
//
//  Created on 2025-10-27.
//  Coordinateur central pour les actions métier
//

import Foundation
import SwiftData

/// Coordinateur central pour les actions métier
@Observable
final class DomainService {
    static let shared = DomainService()

    private init() {}

    // MARK: - Movies

    /// Charge les détails d'un film si nécessaire (met à jour la DB)
    func loadMovieDetailsIfNeeded(movie: Movie) async {
        // Vérifier si les détails existent déjà
        let streamId = movie.streamId
        let descriptor = FetchDescriptor<MovieDetail>(
            predicate: #Predicate { $0.streamId == streamId }
        )

        guard (try? StorageService.shared.fetchOne(descriptor)) == nil else {
            return  // Détails déjà chargés
        }

        // Charger depuis Xtream + TMDB
        guard let account = try? StorageService.shared.fetchOne(FetchDescriptor<Account>()) else {
            print("DomainService: Aucun compte actif")
            return
        }

        do {
            // Appel Xtream pour récupérer les détails du film
            let xtreamDetail = try await XtreamService.shared.getVODInfo(
                account: account,
                vodId: movie.streamId
            )

            // Recherche TMDB pour enrichir les données
            var tmdbMovieId: Int?
            var castImages: [String] = []

            if let info = xtreamDetail.info, let tmdbId = info.tmdbId {
                tmdbMovieId = tmdbId
                if let credits = try? await TMDBService.shared.getMovieCredits(tmdbId: tmdbId) {
                    castImages = credits.cast.prefix(12).compactMap { actor in
                        guard let profilePath = actor.profilePath else { return nil }
                        return "https://image.tmdb.org/t/p/w185\(profilePath)"
                    }
                }
            }

            // Créer MovieDetail et insérer dans la DB
            let detail = MovieDetail(
                streamId: movie.streamId,
                tmdbId: tmdbMovieId,
                name: xtreamDetail.info?.name,
                genre: xtreamDetail.info?.genre,
                rating: xtreamDetail.info?.rating5based,
                duration: xtreamDetail.info?.duration,
                year: xtreamDetail.info?.releaseDate,
                cover: xtreamDetail.info?.coverBig,
                plot: xtreamDetail.info?.plot,
                director: xtreamDetail.info?.director,
                cast: xtreamDetail.info?.cast,
                castImages: castImages,
                backdropPaths: xtreamDetail.info?.backdropPath
            )

            await MainActor.run {
                try? StorageService.shared.insert(detail)

                // Mettre à jour le tmdbId dans l'objet Movie pour permettre le groupement
                if let tmdbId = tmdbMovieId {
                    movie.tmdbId = tmdbId
                    try? StorageService.shared.save()
                }
            }

            print("DomainService: Détails du film \(movie.name) chargés avec succès")
        } catch {
            print("DomainService: Erreur chargement détails film: \(error)")
        }
    }

    // MARK: - Series

    /// Charge les détails d'une série si nécessaire (met à jour la DB)
    func loadSeriesDetailsIfNeeded(series: Series) async {
        // Vérifier si les détails existent déjà
        let streamId = series.seriesId
        let descriptor = FetchDescriptor<SeriesDetail>(
            predicate: #Predicate { $0.seriesId == streamId }
        )

        guard (try? StorageService.shared.fetchOne(descriptor)) == nil else {
            return  // Détails déjà chargés
        }

        // Charger depuis Xtream + TMDB
        guard let account = try? StorageService.shared.fetchOne(FetchDescriptor<Account>()) else {
            print("DomainService: Aucun compte actif")
            return
        }

        do {
            // Appel Xtream pour récupérer les détails de la série
            let xtreamDetail = try await XtreamService.shared.getSeriesInfo(
                account: account,
                seriesId: series.seriesId
            )

            // Récupérer le tmdbId si disponible
            var tmdbSeriesId: Int? = nil
            var castImages: [String] = []

            if let info = xtreamDetail.info, let tmdbId = info.tmdbId {
                tmdbSeriesId = tmdbId
                // Optionnel : enrichir avec TMDB si nécessaire
            }

            // Créer SeriesDetail et insérer dans la DB
            let detail = SeriesDetail(
                seriesId: series.seriesId,
                tmdbId: tmdbSeriesId,
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
                try? StorageService.shared.insert(detail)

                // Mettre à jour le tmdbId dans l'objet Series pour identification
                if let tmdbId = tmdbSeriesId {
                    series.tmdbId = tmdbId
                }

                // Créer les saisons et épisodes
                guard let episodes = xtreamDetail.episodes else { return }
                for (seasonNumberStr, episodesDict) in episodes {
                    guard let seasonNumber = Int(seasonNumberStr) else { continue }

                    // Créer la saison
                    let season = SeriesSeason(
                        seriesId: series.seriesId,
                        seasonNumber: seasonNumber
                    )
                    StorageService.shared.context.insert(season)

                    // Créer les épisodes
                    for episodeData in episodesDict {
                        guard let episodeId = episodeData.id else { continue }

                        // Construire l'URL de streaming de l'épisode
                        let serverURL = account.serverURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
                        let ext = episodeData.containerExtension ?? "mp4"
                        let streamURL = "\(serverURL)/series/\(account.username)/\(account.password)/\(episodeId).\(ext)"

                        let episode = Episode(
                            seriesId: series.seriesId,
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
                        StorageService.shared.context.insert(episode)
                    }
                }

                try? StorageService.shared.save()
            }

            print("DomainService: Détails de la série \(series.name) chargés avec succès")
        } catch {
            print("DomainService: Erreur chargement détails série: \(error)")
        }
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
        try await AccountService.shared.createAccount(
            name: name,
            serverURL: serverURL,
            username: username,
            password: password,
            onStepChange: onStepChange
        )
    }

    /// Rafraîchit les données du compte
    func refreshAccount(account: Account, onStepChange: @escaping (SyncStep) -> Void) async throws {
        try await AccountService.shared.refreshAccount(
            account: account,
            onStepChange: onStepChange
        )
    }

    /// Supprime toutes les données du compte
    func deleteAllAccountData() {
        AccountService.shared.deleteAllAccountData()
    }

    /// Supprime un compte et toutes ses données associées
    /// - Parameter account: Le compte à supprimer
    @MainActor
    func deleteAccount(account: Account) async {
        // Supprimer toutes les données liées
        let liveChannelsDescriptor = FetchDescriptor<LiveChannel>()
        if let liveChannels = try? StorageService.shared.fetch(liveChannelsDescriptor) {
            liveChannels.forEach { StorageService.shared.context.delete($0) }
        }

        let moviesDescriptor = FetchDescriptor<Movie>()
        if let movies = try? StorageService.shared.fetch(moviesDescriptor) {
            movies.forEach { StorageService.shared.context.delete($0) }
        }

        let seriesDescriptor = FetchDescriptor<Series>()
        if let series = try? StorageService.shared.fetch(seriesDescriptor) {
            series.forEach { StorageService.shared.context.delete($0) }
        }

        // Supprimer les catégories
        let categoriesDescriptor = FetchDescriptor<LiveCategory>()
        if let categories = try? StorageService.shared.fetch(categoriesDescriptor) {
            categories.forEach { StorageService.shared.context.delete($0) }
        }

        let moviesCategoriesDescriptor = FetchDescriptor<MoviesCategory>()
        if let moviesCategories = try? StorageService.shared.fetch(moviesCategoriesDescriptor) {
            moviesCategories.forEach { StorageService.shared.context.delete($0) }
        }

        let seriesCategoriesDescriptor = FetchDescriptor<SeriesCategory>()
        if let seriesCategories = try? StorageService.shared.fetch(seriesCategoriesDescriptor) {
            seriesCategories.forEach { StorageService.shared.context.delete($0) }
        }

        // Supprimer le compte
        StorageService.shared.context.delete(account)

        // Sauvegarder
        try? StorageService.shared.save()

        print("✅ DomainService: Compte et données associées supprimés avec succès")
    }

    // MARK: - Watch History

    /// Récupère l'historique de visionnage pour un contenu donné
    func getWatchHistory(content: PlaybackContent) async -> WatchHistory? {
        let streamId: Int
        let contentType: String
        let episodeId: String?

        switch content {
        case .liveChannel:
            return nil // Pas de WatchHistory pour Live TV

        case .movie(let movie):
            streamId = movie.streamId
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

        return try? StorageService.shared.fetchOne(descriptor)
    }

    /// Sauvegarde ou met à jour l'historique de visionnage
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

        case .movie(let movie):
            streamId = movie.streamId
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
            try? StorageService.shared.insert(newHistory)
        }

        // Sauvegarder
        try? StorageService.shared.save()
    }
}
