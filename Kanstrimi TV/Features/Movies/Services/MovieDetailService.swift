//
//  MovieDetailService.swift
//  Kanstrimi TV
//
//  Created on 2025-10-27.
//  Service gérant le chargement des détails d'un film et l'enrichissement TMDB
//

import Foundation
import SwiftData

/// Service singleton gérant les détails des films
final class MovieDetailService {
    /// Instance partagée (singleton)
    static let shared = MovieDetailService()

    /// Initialisation privée (singleton)
    private init() {}

    // MARK: - Load Movie Detail

    /// Charge les détails d'un film depuis l'API Xtream et enrichit avec TMDB
    /// - Parameters:
    ///   - movie: Film pour lequel charger les détails
    ///   - account: Compte Xtream
    ///   - modelContext: Contexte SwiftData
    /// - Returns: MovieDetail créé ou mis à jour
    /// - Throws: XtreamError si l'appel API échoue
    func loadMovieDetail(
        movie: Movie,
        account: Account,
        modelContext: ModelContext
    ) async throws -> MovieDetail {
        // 1. Récupérer les infos détaillées depuis Xtream
        let movieInfo = try await XtreamService.shared.getVODInfo(
            account: account,
            vodId: movie.streamId
        )

        // 2. Créer ou mettre à jour le MovieDetail
        let movieDetail = createOrUpdateMovieDetail(
            from: movieInfo,
            streamId: movie.streamId,
            modelContext: modelContext
        )

        // 3. Enrichir avec TMDB si tmdbId est disponible
        if let tmdbId = movieDetail.tmdbId {
            do {
                try await enrichWithTMDB(movieDetail: movieDetail, tmdbId: tmdbId)
            } catch {
                // Si l'enrichissement TMDB échoue, on continue quand même
                print("⚠️ Erreur lors de l'enrichissement TMDB: \(error)")
            }
        }

        // 4. Sauvegarder les modifications
        movieDetail.lastUpdated = Date()
        try modelContext.save()

        return movieDetail
    }

    // MARK: - Create or Update MovieDetail

    /// Crée ou met à jour un MovieDetail depuis MovieInfo
    private func createOrUpdateMovieDetail(
        from movieInfo: MovieInfo,
        streamId: Int,
        modelContext: ModelContext
    ) -> MovieDetail {
        // Vérifier si un MovieDetail existe déjà
        let descriptor = FetchDescriptor<MovieDetail>(
            predicate: #Predicate { $0.streamId == streamId }
        )

        let existingDetail = try? modelContext.fetch(descriptor).first

        let movieDetail: MovieDetail
        if let existing = existingDetail {
            // Mettre à jour l'existant
            movieDetail = existing
        } else {
            // Créer un nouveau MovieDetail
            movieDetail = MovieDetail(streamId: streamId)
            modelContext.insert(movieDetail)
        }

        // Remplir les données depuis movieInfo
        if let info = movieInfo.info {
            movieDetail.tmdbId = info.tmdbId
            movieDetail.name = info.name
            movieDetail.genre = info.genre
            movieDetail.rating = info.rating
            movieDetail.duration = info.duration
            movieDetail.cover = info.coverBig
            movieDetail.plot = info.plot
            movieDetail.director = info.director
            movieDetail.cast = info.cast
            movieDetail.backdropPaths = info.backdropPath

            // Extraire l'année depuis releaseDate (format YYYY-MM-DD ou YYYY)
            if let releaseDate = info.releaseDate {
                movieDetail.year = String(releaseDate.prefix(4))
            }
        }

        return movieDetail
    }

    // MARK: - Enrich with TMDB

    /// Enrichit un MovieDetail avec les données TMDB (images des acteurs)
    /// - Parameters:
    ///   - movieDetail: MovieDetail à enrichir
    ///   - tmdbId: ID TMDB du film
    /// - Throws: TMDBError si l'appel API échoue
    func enrichWithTMDB(movieDetail: MovieDetail, tmdbId: Int) async throws {
        // Récupérer les crédits depuis TMDB
        let credits = try await TMDBService.shared.getMovieCredits(tmdbId: tmdbId)

        // Extraire les URLs des images des acteurs (limiter à 12 acteurs)
        let castImageURLs = credits.cast
            .prefix(12)
            .compactMap { $0.profileImageURL }

        // Mettre à jour le MovieDetail
        movieDetail.castImages = castImageURLs
    }
}
