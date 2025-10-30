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
@MainActor
final class DomainService: DomainServiceProtocol {
    /// Instance de StorageService encapsulée
    private let storageService: StorageService

    /// Instance d'AccountService encapsulée
    private let accountService: AccountService

    /// ModelContainer exposé pour l'injection dans SwiftUI
    var modelContainer: ModelContainer {
        storageService.container
    }

    /// Initialisation par défaut (crée un nouveau StorageService)
    init() {
        self.storageService = StorageService()
        self.accountService = AccountService(storageService: storageService)
    }

    /// Initialisation avec une instance de StorageService personnalisée (pour les tests)
    init(storageService: StorageService) {
        self.storageService = storageService
        self.accountService = AccountService(storageService: storageService)
    }

    // MARK: - Movies

    /// Charge les détails d'un film si nécessaire (enrichit le MovieDetail existant)
    func loadMovieDetailsIfNeeded(movie: Movie) async {
        // Extraire le streamId depuis l'ID
        guard let streamId = movie.extractedStreamId else {
            print("DomainService: Impossible d'extraire streamId depuis movie.id=\(movie.id)")
            return
        }

        // Vérifier si les détails sont déjà enrichis (genre présent)
        let descriptor = FetchDescriptor<MovieDetail>(
            predicate: #Predicate { $0.streamId == streamId }
        )

        guard let existingDetail = try? storageService.fetchOne(descriptor) else {
            print("DomainService: MovieDetail introuvable pour streamId=\(streamId)")
            return
        }

        // Si le genre est déjà présent, pas besoin d'enrichir
        if existingDetail.genre != nil {
            return
        }

        // Charger depuis Xtream + TMDB
        guard let account = try? storageService.fetchOne(FetchDescriptor<Account>()) else {
            print("DomainService: Aucun compte actif")
            return
        }

        do {
            // Appel Xtream pour récupérer les détails du film
            let xtreamDetail = try await XtreamService.shared.getVODInfo(
                account: account,
                vodId: streamId
            )

            // Recherche TMDB pour enrichir les données
            var castImages: [String] = []

            if let info = xtreamDetail.info, let tmdbId = info.tmdbId {
                if let credits = try? await TMDBService.shared.getMovieCredits(tmdbId: tmdbId) {
                    castImages = credits.cast.prefix(12).compactMap { actor in
                        guard let profilePath = actor.profilePath else { return nil }
                        return "https://image.tmdb.org/t/p/w185\(profilePath)"
                    }
                }
            }

            // Enrichir le MovieDetail existant
            await MainActor.run {
                existingDetail.genre = xtreamDetail.info?.genre
                existingDetail.duration = xtreamDetail.info?.duration
                existingDetail.year = xtreamDetail.info?.releaseDate
                existingDetail.cover = xtreamDetail.info?.coverBig
                existingDetail.plot = xtreamDetail.info?.plot
                existingDetail.director = xtreamDetail.info?.director
                existingDetail.cast = xtreamDetail.info?.cast
                existingDetail.castImages = castImages
                existingDetail.backdropPaths = xtreamDetail.info?.backdropPath
                existingDetail.lastUpdated = Date()

                try? storageService.save()
            }

            print("DomainService: Détails du film \(movie.name) enrichis avec succès")
        } catch {
            print("DomainService: Erreur enrichissement détails film: \(error)")
        }
    }

    // MARK: - Series

    /// Charge les détails d'une série si nécessaire (met à jour la DB)
    func loadSeriesDetailsIfNeeded(series: Series) async {
        // Extraire le seriesId depuis l'ID
        guard let seriesId = series.extractedSeriesId else {
            print("DomainService: Impossible d'extraire seriesId depuis series.id=\(series.id)")
            return
        }

        // Vérifier si les détails existent déjà
        let descriptor = FetchDescriptor<SeriesDetail>(
            predicate: #Predicate { $0.seriesId == seriesId }
        )

        guard (try? storageService.fetchOne(descriptor)) == nil else {
            return  // Détails déjà chargés
        }

        // Charger depuis Xtream + TMDB
        guard let account = try? storageService.fetchOne(FetchDescriptor<Account>()) else {
            print("DomainService: Aucun compte actif")
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
        // Supprimer toutes les données liées
        let liveChannelsDescriptor = FetchDescriptor<LiveChannel>()
        if let liveChannels = try? storageService.fetch(liveChannelsDescriptor) {
            liveChannels.forEach { storageService.context.delete($0) }
        }

        let moviesDescriptor = FetchDescriptor<Movie>()
        if let movies = try? storageService.fetch(moviesDescriptor) {
            movies.forEach { storageService.context.delete($0) }
        }

        let seriesDescriptor = FetchDescriptor<Series>()
        if let series = try? storageService.fetch(seriesDescriptor) {
            series.forEach { storageService.context.delete($0) }
        }

        // Supprimer les catégories
        let categoriesDescriptor = FetchDescriptor<LiveCategory>()
        if let categories = try? storageService.fetch(categoriesDescriptor) {
            categories.forEach { storageService.context.delete($0) }
        }

        let moviesCategoriesDescriptor = FetchDescriptor<MoviesCategory>()
        if let moviesCategories = try? storageService.fetch(moviesCategoriesDescriptor) {
            moviesCategories.forEach { storageService.context.delete($0) }
        }

        let seriesCategoriesDescriptor = FetchDescriptor<SeriesCategory>()
        if let seriesCategories = try? storageService.fetch(seriesCategoriesDescriptor) {
            seriesCategories.forEach { storageService.context.delete($0) }
        }

        // Supprimer le compte
        storageService.context.delete(account)

        // Sauvegarder
        try? storageService.save()

        print("✅ DomainService: Compte et données associées supprimés avec succès")
    }

    // MARK: - PlayerSettings

    /// Insère de nouveaux PlayerSettings dans la base de données
    func insertPlayerSettings(_ settings: PlayerSettings) throws {
        try storageService.insert(settings)
    }

    /// Met à jour les PlayerSettings existants
    func updatePlayerSettings(_ settings: PlayerSettings) throws {
        try storageService.save()
    }

    /// Récupère le nombre de PlayerSettings dans la base de données
    func getPlayerSettingsCount() throws -> Int {
        let descriptor = FetchDescriptor<PlayerSettings>()
        return try storageService.fetchCount(descriptor)
    }

    // MARK: - Statistics

    /// Récupère le nombre de chaînes Live TV dans la base de données
    func getChannelsCount() throws -> Int {
        let descriptor = FetchDescriptor<LiveChannel>()
        return try storageService.fetchCount(descriptor)
    }

    /// Récupère le nombre de films dans la base de données
    func getMoviesCount() throws -> Int {
        let descriptor = FetchDescriptor<Movie>()
        return try storageService.fetchCount(descriptor)
    }

    /// Récupère le nombre de séries dans la base de données
    func getSeriesCount() throws -> Int {
        let descriptor = FetchDescriptor<Series>()
        return try storageService.fetchCount(descriptor)
    }

    // MARK: - Episodes

    /// Récupère tous les épisodes d'une saison triés par numéro d'épisode
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
