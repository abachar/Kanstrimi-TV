//
//  MovieService.swift
//  Kanstrimi TV
//
//  Created on 2025-10-31.
//  Service gérant les films VOD
//

import Foundation
import SwiftData

/// Service gérant la logique métier des films VOD
@MainActor
final class MovieService {
    private let storageService: StorageService

    init(storageService: StorageService) {
        self.storageService = storageService
    }

    // MARK: - Insert

    /// Insère une liste de films dans la base de données
    /// - Parameter movies: Liste des films à insérer
    /// - Throws: Erreur si l'insertion échoue
    func insertMovies(_ movies: [Movie]) throws {
        try storageService.insertAll(movies)
    }

    /// Insère une liste de MovieDetail dans la base de données
    /// - Parameter details: Liste des détails de films à insérer
    /// - Throws: Erreur si l'insertion échoue
    func insertMovieDetails(_ details: [MovieDetail]) throws {
        try storageService.insertAll(details)
    }

    // MARK: - Load Details

    /// Charge les détails d'un film si nécessaire (crée ou enrichit le MovieDetail)
    /// - Parameter movie: Film dont charger les détails
    func loadDetailsIfNeeded(movie: Movie) async {
        // Extraire le streamId depuis l'ID
        guard let streamId = movie.extractedStreamId else {
            print("MovieService: Impossible d'extraire streamId depuis movie.id=\(movie.id)")
            return
        }

        // Vérifier si les détails existent déjà et sont enrichis
        let descriptor = FetchDescriptor<MovieDetail>(
            predicate: #Predicate { $0.streamId == streamId }
        )

        let existingDetail = try? storageService.fetchOne(descriptor)

        // Si les détails existent et sont déjà enrichis (genre présent), ne rien faire
        if let detail = existingDetail, detail.genre != nil {
            return
        }

        // Charger depuis Xtream + TMDB
        guard let account = try? storageService.fetchOne(FetchDescriptor<Account>()) else {
            print("MovieService: Aucun compte actif")
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

            await MainActor.run {
                if let detail = existingDetail {
                    // Enrichir le MovieDetail existant
                    detail.genre = xtreamDetail.info?.genre
                    detail.duration = xtreamDetail.info?.duration
                    detail.year = xtreamDetail.info?.releaseDate
                    detail.cover = xtreamDetail.info?.coverBig
                    detail.plot = xtreamDetail.info?.plot
                    detail.director = xtreamDetail.info?.director
                    detail.cast = xtreamDetail.info?.cast
                    detail.castImages = castImages
                    detail.backdropPaths = xtreamDetail.info?.backdropPath
                    detail.lastUpdated = Date()
                } else {
                    // Créer un nouveau MovieDetail complet
                    let streamURL = XtreamURLBuilder.buildVODStreamURL(
                        account: account,
                        streamId: streamId,
                        containerExtension: xtreamDetail.movieData?.containerExtension ?? "mp4"
                    )

                    let newDetail = MovieDetail(
                        streamId: streamId,
                        streamURL: streamURL,
                        containerExtension: xtreamDetail.movieData?.containerExtension,
                        added: xtreamDetail.movieData?.added,
                        tmdbId: xtreamDetail.info?.tmdbId,
                        name: movie.name,
                        genre: xtreamDetail.info?.genre,
                        rating: movie.rating,
                        duration: xtreamDetail.info?.duration,
                        year: xtreamDetail.info?.releaseDate,
                        cover: xtreamDetail.info?.coverBig,
                        plot: xtreamDetail.info?.plot,
                        director: xtreamDetail.info?.director,
                        cast: xtreamDetail.info?.cast,
                        castImages: castImages,
                        backdropPaths: xtreamDetail.info?.backdropPath
                    )

                    try? storageService.insert(newDetail)
                }

                try? storageService.save()
            }

            print("MovieService: Détails du film \(movie.name) chargés avec succès")
        } catch {
            print("MovieService: Erreur chargement détails film: \(error)")
        }
    }

    // MARK: - Delete

    /// Supprime tous les films et leurs détails
    /// - Throws: Erreur si la suppression échoue
    func deleteAllMovies() throws {
        try storageService.deleteAll(Movie.self)
        try storageService.deleteAll(MovieDetail.self)
    }
}
