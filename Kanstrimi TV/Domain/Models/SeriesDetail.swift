//
//  SeriesDetail.swift
//  Kanstrimi TV
//
//  Created on 2025-10-27.
//

import Foundation
import SwiftData

/// Modèle représentant les informations détaillées d'une série TV
@Model
final class SeriesDetail {
    #Index<SeriesDetail>([\.seriesId])

    /// Identifiant unique
    var id: String

    /// Identifiant de la série (series_id) - clé pour lier à Series
    var seriesId: Int

    /// ID TMDB pour enrichissement
    var tmdbId: Int?

    /// Nom de la série
    var name: String?

    /// Genres (séparés par virgule)
    var genre: String?

    /// Note de la série
    var rating: Double?

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

    /// URL de la bande-annonce YouTube (ID YouTube)
    var youtubeTrailer: String?

    /// Date de dernière mise à jour
    var lastUpdated: Date

    /// Initialisation d'un SeriesDetail
    init(
        seriesId: Int,
        tmdbId: Int? = nil,
        name: String? = nil,
        genre: String? = nil,
        rating: Double? = nil,
        year: String? = nil,
        cover: String? = nil,
        plot: String? = nil,
        director: String? = nil,
        cast: String? = nil,
        castImages: [String]? = nil,
        backdropPaths: [String]? = nil,
        youtubeTrailer: String? = nil
    ) {
        self.id = "series-detail-\(seriesId)"
        self.seriesId = seriesId
        self.tmdbId = tmdbId
        self.name = name
        self.genre = genre
        self.rating = rating
        self.year = year
        self.cover = cover
        self.plot = plot
        self.director = director
        self.cast = cast
        self.castImages = castImages
        self.backdropPaths = backdropPaths
        self.youtubeTrailer = youtubeTrailer
        self.lastUpdated = Date()
    }
}
