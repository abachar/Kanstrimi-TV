//
//  MovieDetail.swift
//  Kanstrimi TV
//
//  Created on 2025-10-27.
//

import Foundation
import SwiftData

/// Modèle représentant les informations détaillées d'un film VOD
@Model
final class MovieDetail {
    #Index<MovieDetail>([\.streamId])

    /// Identifiant unique
    var id: String

    /// Identifiant du flux (stream_id) - clé pour lier au Movie
    var streamId: Int

    /// ID TMDB pour enrichissement
    var tmdbId: Int?

    /// Nom du film
    var name: String?

    /// Genres (séparés par virgule)
    var genre: String?

    /// Note du film
    var rating: Double?

    /// Durée en format lisible (ex: "2h 30min")
    var duration: String?

    /// Année de sortie
    var year: String?

    /// URL du cover/poster
    var cover: String?

    /// Synopsis
    var plot: String?

    /// Réalisateur
    var director: String?

    /// Acteurs depuis Xtream (séparés par virgule)
    var cast: String?

    /// URLs des images des acteurs depuis TMDB
    var castImages: [String]?

    /// URLs des images backdrop
    var backdropPaths: [String]?

    /// Date de dernière mise à jour
    var lastUpdated: Date

    /// Initialisation d'un MovieDetail
    init(
        streamId: Int,
        tmdbId: Int? = nil,
        name: String? = nil,
        genre: String? = nil,
        rating: Double? = nil,
        duration: String? = nil,
        year: String? = nil,
        cover: String? = nil,
        plot: String? = nil,
        director: String? = nil,
        cast: String? = nil,
        castImages: [String]? = nil,
        backdropPaths: [String]? = nil
    ) {
        self.id = "movie-detail-\(streamId)"
        self.streamId = streamId
        self.tmdbId = tmdbId
        self.name = name
        self.genre = genre
        self.rating = rating
        self.duration = duration
        self.year = year
        self.cover = cover
        self.plot = plot
        self.director = director
        self.cast = cast
        self.castImages = castImages
        self.backdropPaths = backdropPaths
        self.lastUpdated = Date()
    }
}
