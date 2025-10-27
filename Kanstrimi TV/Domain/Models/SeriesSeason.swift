//
//  SeriesSeason.swift
//  Kanstrimi TV
//
//  Created on 2025-10-27.
//

import Foundation
import SwiftData

/// Modèle représentant une saison d'une série TV
@Model
final class SeriesSeason {
    #Index<SeriesSeason>([\.seriesId, \.seasonNumber])

    /// Identifiant unique
    var id: String

    /// Identifiant de la série (series_id) - clé pour lier à Series
    var seriesId: Int

    /// Numéro de la saison
    var seasonNumber: Int

    /// Nom de la saison
    var name: String?

    /// Synopsis de la saison
    var overview: String?

    /// Date de première diffusion
    var airDate: String?

    /// Nombre d'épisodes dans la saison
    var episodeCount: Int?

    /// URL du cover depuis TMDB
    var coverTmdb: String?

    /// Initialisation d'une saison
    init(
        seriesId: Int,
        seasonNumber: Int,
        name: String? = nil,
        overview: String? = nil,
        airDate: String? = nil,
        episodeCount: Int? = nil,
        coverTmdb: String? = nil
    ) {
        self.id = "season-\(seriesId)-\(seasonNumber)"
        self.seriesId = seriesId
        self.seasonNumber = seasonNumber
        self.name = name
        self.overview = overview
        self.airDate = airDate
        self.episodeCount = episodeCount
        self.coverTmdb = coverTmdb
    }
}
