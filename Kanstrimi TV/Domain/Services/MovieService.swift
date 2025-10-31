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

    /// Charge les détails d'un film si nécessaire (enrichit le MovieDetail existant)
    /// - Parameter movie: Film dont charger les détails
    func loadDetailsIfNeeded(movie: Movie) async {
        // Extraire le streamId depuis l'ID
        guard let streamId = movie.extractedStreamId else {
            print("MovieService: Impossible d'extraire streamId depuis movie.id=\(movie.id)")
            return
        }

        // Vérifier si les détails sont déjà enrichis (genre présent)
        let descriptor = FetchDescriptor<MovieDetail>(
            predicate: #Predicate { $0.streamId == streamId }
        )

        guard let existingDetail = try? storageService.fetchOne(descriptor) else {
            print("MovieService: MovieDetail introuvable pour streamId=\(streamId)")
            return
        }

        // Si le genre est déjà présent, pas besoin d'enrichir
        if existingDetail.genre != nil {
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

            print("MovieService: Détails du film \(movie.name) enrichis avec succès")
        } catch {
            print("MovieService: Erreur enrichissement détails film: \(error)")
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
