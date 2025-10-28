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

// MARK: - Preview Data
#if DEBUG
    extension SeriesDetail {
        /// SeriesDetail pour "Yellowstone (US)_msub"
        static var previewSeriesDetails: SeriesDetail {
            SeriesDetail(
                seriesId: 3073,  // Correspond à Series.previewSeries[3]
                tmdbId: 73586,
                name: "Yellowstone",
                genre: "Western, Drama",
                rating: 4.0,  // 8/10 = 4.0/5
                year: "2018",
                cover:
                    "https://image.tmdb.org/t/p/w600_and_h900_bestv2/iqWCUwLcjkVgtpsDLs8xx8kscg6.jpg",
                plot:
                    "Follow the violent world of the Dutton family, who controls the largest contiguous ranch in the United States. Led by their patriarch John Dutton, the family defends their property against constant attack by land developers, an Indian reservation, and America's first National Park.",
                director: "John Linson, Taylor Sheridan",
                cast: "",
                castImages: [],
                backdropPaths: [
                    "https://image.tmdb.org/t/p/w1280/5YTM1bh3Jyfy9IP2eS64W3JDeGs.jpg"
                ],
                youtubeTrailer: ""
            )
        }
    }
#endif
