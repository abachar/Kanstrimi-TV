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

// MARK: - Preview Data
#if DEBUG
extension SeriesSeason {
    /// Saisons de preview pour Yellowstone (seriesId: 3073)
    static var previewSeriesSeasons: [SeriesSeason] {
        [
            // Saison 1
            SeriesSeason(
                seriesId: 3073,
                seasonNumber: 1,
                name: "Season 1",
                overview: "The Dutton family, owners of the largest ranch in Montana, fight ruthlessly to keep their land from the neighboring Indian reservation and the new chief seeking to reclaim it.",
                airDate: "2018-06-20",
                episodeCount: 9,
                coverTmdb: nil
            ),

            // Saison 2
            SeriesSeason(
                seriesId: 3073,
                seasonNumber: 2,
                name: "Season 2",
                overview: "The Duttons face new threats as John's position becomes increasingly precarious and family secrets come to light.",
                airDate: "2019-06-19",
                episodeCount: 10,
                coverTmdb: nil
            ),

            // Saison 3
            SeriesSeason(
                seriesId: 3073,
                seasonNumber: 3,
                name: "Season 3",
                overview: "John makes a deal with Governor Perry, while powerful new enemies threaten the future of Yellowstone.",
                airDate: "2020-06-21",
                episodeCount: 10,
                coverTmdb: nil
            ),

            // Saison 4
            SeriesSeason(
                seriesId: 3073,
                seasonNumber: 4,
                name: "Season 4",
                overview: "The Duttons face the aftermath of a coordinated attack and fight to protect their legacy.",
                airDate: "2021-11-07",
                episodeCount: 10,
                coverTmdb: nil
            ),

            // Saison 5
            SeriesSeason(
                seriesId: 3073,
                seasonNumber: 5,
                name: "Season 5",
                overview: "John is sworn in as governor of Montana and makes bold moves to protect the Yellowstone.",
                airDate: "2022-11-13",
                episodeCount: 7,
                coverTmdb: nil
            )
        ]
    }
}
#endif
