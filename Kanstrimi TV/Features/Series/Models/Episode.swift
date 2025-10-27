//
//  Episode.swift
//  Kanstrimi TV
//
//  Created on 2025-10-27.
//

import Foundation
import SwiftData

/// Modèle représentant un épisode d'une série TV
@Model
final class Episode {
    #Index<Episode>([\.seriesId, \.seasonNumber])

    /// Identifiant unique
    var id: String

    /// Identifiant de la série (series_id)
    var seriesId: Int

    /// Numéro de la saison
    var seasonNumber: Int

    /// Numéro de l'épisode
    var episodeNum: Int

    /// Identifiant de l'épisode pour le streaming (depuis API Xtream)
    var episodeId: String

    /// Titre de l'épisode
    var title: String?

    /// Synopsis de l'épisode
    var overview: String?

    /// Date de diffusion
    var airDate: String?

    /// Note de l'épisode
    var rating: Double?

    /// Durée en format lisible (ex: "42min")
    var duration: String?

    /// Durée en secondes
    var durationSecs: Int?

    /// URL de l'image de l'épisode
    var movieImage: String?

    /// URL de streaming de l'épisode
    var streamURL: String

    /// Extension du conteneur (ex: "mkv", "mp4")
    var containerExtension: String?

    /// Indicateur visuel si l'épisode a été visionné
    var isWatched: Bool

    /// Initialisation d'un épisode
    init(
        seriesId: Int,
        seasonNumber: Int,
        episodeNum: Int,
        episodeId: String,
        title: String? = nil,
        overview: String? = nil,
        airDate: String? = nil,
        rating: Double? = nil,
        duration: String? = nil,
        durationSecs: Int? = nil,
        movieImage: String? = nil,
        streamURL: String,
        containerExtension: String? = nil,
        isWatched: Bool = false
    ) {
        self.id = "episode-\(seriesId)-\(seasonNumber)-\(episodeNum)"
        self.seriesId = seriesId
        self.seasonNumber = seasonNumber
        self.episodeNum = episodeNum
        self.episodeId = episodeId
        self.title = title
        self.overview = overview
        self.airDate = airDate
        self.rating = rating
        self.duration = duration
        self.durationSecs = durationSecs
        self.movieImage = movieImage
        self.streamURL = streamURL
        self.containerExtension = containerExtension
        self.isWatched = isWatched
    }
}
