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

// MARK: - Playable Conformance
extension Episode: Playable {
    var displayTitle: String {
        title ?? "Épisode \(episodeNum)"
    }

    var subtitle: String? {
        "S\(String(format: "%02d", seasonNumber))E\(String(format: "%02d", episodeNum))"
    }

    var contentType: PlaybackContent.ContentType {
        .vod
    }

    // Episode navigation sera géré par la vue qui construit le PlaybackContent
}

// MARK: - Preview Data
#if DEBUG
extension Episode {
    /// Épisodes de preview pour Yellowstone (seriesId: 3073)
    static var previewEpisodes: [Episode] {
        [
            // ==================== SAISON 1 ====================
            Episode(
                seriesId: 3073,
                seasonNumber: 1,
                episodeNum: 1,
                episodeId: "176093",
                title: "Daybreak",
                overview: "The Dutton family, owners of the largest ranch in Montana, fight ruthlessly to keep their land from the neighboring Indian reservation and the new chief seeking to reclaim it.",
                airDate: "2018-06-20",
                rating: 8.2,
                duration: "01:33:00",
                durationSecs: 5580,
                movieImage: "https://image.tmdb.org/t/p/w300/6uX0MNaI18hu6IJ5I5DRbmx09yN.jpg",
                streamURL: "http://example.com/series/176093.mkv",
                containerExtension: "mkv",
                isWatched: false
            ),
            Episode(
                seriesId: 3073,
                seasonNumber: 1,
                episodeNum: 2,
                episodeId: "176094",
                title: "Kill the Messenger",
                overview: "As the dust settles from the shootout, the Duttons deal with the potential repercussions. John calls in a favor and collects on some old debts. Jamie meets with the governor to do damage control.",
                airDate: "2018-06-27",
                rating: 7.6,
                duration: "00:55:00",
                durationSecs: 3300,
                movieImage: "https://image.tmdb.org/t/p/w300/x1Oom04u2dwa8Jv3U4bBXu5OFW4.jpg",
                streamURL: "http://example.com/series/176094.mkv",
                containerExtension: "mkv",
                isWatched: false
            ),
            Episode(
                seriesId: 3073,
                seasonNumber: 1,
                episodeNum: 3,
                episodeId: "176095",
                title: "No Good Horses",
                overview: "The Duttons deal with a painful family anniversary. Kayce saves a young girl from danger. Jamie and Beth plan their respective political careers. Rainwater makes an ominous threat to the Dutton legacy.",
                airDate: "2018-07-11",
                rating: 7.3,
                duration: "00:50:00",
                durationSecs: 3000,
                movieImage: "https://image.tmdb.org/t/p/w300/hRlpgIwvu1NkHVRE7EKMzx3ITaX.jpg",
                streamURL: "http://example.com/series/176095.mkv",
                containerExtension: "mkv",
                isWatched: true
            ),
            Episode(
                seriesId: 3073,
                seasonNumber: 1,
                episodeNum: 4,
                episodeId: "176096",
                title: "The Long Black Train",
                overview: "A secret about John comes to the surface. Beth shows Jenkins a rough night out. Quality time with Tate leads to a close call.",
                airDate: "2018-07-18",
                rating: 7.9,
                duration: "00:42:00",
                durationSecs: 2520,
                movieImage: "https://image.tmdb.org/t/p/w300/vGemvoRc2nFMpnRFNqWI2EjkPE6.jpg",
                streamURL: "http://example.com/series/176096.mkv",
                containerExtension: "mkv",
                isWatched: true
            ),
            Episode(
                seriesId: 3073,
                seasonNumber: 1,
                episodeNum: 5,
                episodeId: "176097",
                title: "Coming Home",
                overview: "As Kayce feels the heat from tribal police, Jamie works some legal magic. Rip recruits a new cowboy for the ranch, and a beaten-down Jimmy begins to find some respect. John makes a play to keep Kayce and Monica close to home.",
                airDate: "2018-07-25",
                rating: 7.9,
                duration: "00:51:00",
                durationSecs: 3060,
                movieImage: "https://image.tmdb.org/t/p/w300/ehPPF0uko10BRjosnHZ0XLd8eyf.jpg",
                streamURL: "http://example.com/series/176097.mkv",
                containerExtension: "mkv",
                isWatched: false
            ),
            Episode(
                seriesId: 3073,
                seasonNumber: 1,
                episodeNum: 6,
                episodeId: "176098",
                title: "The Remembering",
                overview: "John reveals a family secret to Monica, Jamie ramps up his political career, Beth pushes John too far, Kayce and Rip butt heads, and a new partnership threatens Yellowstone.",
                airDate: "2018-08-01",
                rating: 7.9,
                duration: "00:41:00",
                durationSecs: 2460,
                movieImage: "https://image.tmdb.org/t/p/w300/31jdlZMWsdYtpPVqjbkiybzCx3W.jpg",
                streamURL: "http://example.com/series/176098.mkv",
                containerExtension: "mkv",
                isWatched: false
            ),

            // ==================== SAISON 2 ====================
            Episode(
                seriesId: 3073,
                seasonNumber: 2,
                episodeNum: 1,
                episodeId: "176102",
                title: "A Thundering",
                overview: "Kayce settles into his new role at the ranch. A damaging article threatens to expose John. Rainwater pitches his new plan to the tribal council.",
                airDate: "2019-06-19",
                rating: 8.0,
                duration: "00:46:00",
                durationSecs: 2760,
                movieImage: "https://image.tmdb.org/t/p/w300/bIduIibBMONcfhadY4PyczM5SMV.jpg",
                streamURL: "http://example.com/series/176102.mkv",
                containerExtension: "mkv",
                isWatched: false
            ),
            Episode(
                seriesId: 3073,
                seasonNumber: 2,
                episodeNum: 2,
                episodeId: "176103",
                title: "New Beginnings",
                overview: "Kayce and Rip come to blows. Beth starts buying up land to protect the ranch. Monica begins a new chapter at the university.",
                airDate: "2019-06-26",
                rating: 7.8,
                duration: "00:47:00",
                durationSecs: 2820,
                movieImage: "https://image.tmdb.org/t/p/w300/c5SoDINMn36IMtl04l3BcPCLwOS.jpg",
                streamURL: "http://example.com/series/176103.mkv",
                containerExtension: "mkv",
                isWatched: false
            ),
            Episode(
                seriesId: 3073,
                seasonNumber: 2,
                episodeNum: 3,
                episodeId: "176104",
                title: "The Reek of Desperation",
                overview: "Rainwater teams up with Jenkins for a big business deal, but powerful new enemies look to block their plans. John and Beth groom a new political candidate.",
                airDate: "2019-07-10",
                rating: 7.6,
                duration: "00:47:00",
                durationSecs: 2820,
                movieImage: "https://image.tmdb.org/t/p/w300/leeud6E82MArT6l8mTZ4DW5cMpu.jpg",
                streamURL: "http://example.com/series/176104.mkv",
                containerExtension: "mkv",
                isWatched: false
            ),

            // ==================== SAISON 3 ====================
            Episode(
                seriesId: 3073,
                seasonNumber: 3,
                episodeNum: 1,
                episodeId: "176112",
                title: "You're the Indian Now",
                overview: "John makes a deal with Governor Perry, Beth is uneasy about a hospitality company's presence near the ranch, Monica asks for a favor, and Jamie gets a new opportunity.",
                airDate: "2020-06-21",
                rating: 7.2,
                duration: "00:40:00",
                durationSecs: 2400,
                movieImage: "https://image.tmdb.org/t/p/w300/5wjIsTMk2pl9a0gIVapO7eXNzZL.jpg",
                streamURL: "http://example.com/series/176112.mkv",
                containerExtension: "mkv",
                isWatched: false
            ),
            Episode(
                seriesId: 3073,
                seasonNumber: 3,
                episodeNum: 2,
                episodeId: "176113",
                title: "Freight Trains and Monsters",
                overview: "The Duttons open camp, which proves to be the best therapy for Tate. Jamie and Hendon agree to teach a lesson to two criminals, but it does not go as intended. Beth learns more about Roarke's business plans. Teeter joins the bunkhouse.",
                airDate: "2020-06-28",
                rating: 7.0,
                duration: "00:47:00",
                durationSecs: 2820,
                movieImage: "https://image.tmdb.org/t/p/w300/6E2F8x51HSTVDLOmyHaGDLmUkAi.jpg",
                streamURL: "http://example.com/series/176113.mkv",
                containerExtension: "mkv",
                isWatched: false
            ),

            // ==================== SAISON 4 ====================
            Episode(
                seriesId: 3073,
                seasonNumber: 4,
                episodeNum: 1,
                episodeId: "1597854",
                title: "Half the Money",
                overview: "The Duttons deal with the aftermath of the coordinated attacks and begin their path to recovery.",
                airDate: "2021-11-07",
                rating: 8.6,
                duration: "00:57:49",
                durationSecs: 3469,
                movieImage: "https://image.tmdb.org/t/p/w185/4zzPd71GP52hRFie9TTaUp8pn0V.jpg",
                streamURL: "http://example.com/series/1597854.mkv",
                containerExtension: "mkv",
                isWatched: false
            ),
            Episode(
                seriesId: 3073,
                seasonNumber: 4,
                episodeNum: 2,
                episodeId: "1597855",
                title: "Phantom Pain",
                overview: "The Duttons continue to recover and search for answers about who orchestrated the attacks.",
                airDate: "2021-11-07",
                rating: 8.2,
                duration: "00:50:09",
                durationSecs: 3009,
                movieImage: "https://image.tmdb.org/t/p/w185/dfg3wQUFC8maWeKWJd8OOuZmXES.jpg",
                streamURL: "http://example.com/series/1597855.mkv",
                containerExtension: "mkv",
                isWatched: false
            ),

            // ==================== SAISON 5 ====================
            Episode(
                seriesId: 3073,
                seasonNumber: 5,
                episodeNum: 1,
                episodeId: "269858",
                title: "One Hundred Years Is Nothing",
                overview: "John is sworn in as governor of Montana, settles into the powers of his office and makes bold moves to protect the Yellowstone, and the bunkhouse and the Duttons enjoy the Governor's Ball.",
                airDate: "2022-11-13",
                rating: 8.0,
                duration: "01:04:00",
                durationSecs: 3840,
                movieImage: "https://image.tmdb.org/t/p/w300/pLHvzY7Q7TFDtvvRuEu6I80m410.jpg",
                streamURL: "http://example.com/series/269858.mp4",
                containerExtension: "mp4",
                isWatched: false
            ),
            Episode(
                seriesId: 3073,
                seasonNumber: 5,
                episodeNum: 2,
                episodeId: "269859",
                title: "The Sting of Wisdom",
                overview: "John makes a passionate speech to the state of Montana, a formidable new opponent from Market Equities arrives on a private jet, and the cowboys on the Yellowstone deal with a new problem.",
                airDate: "2022-11-13",
                rating: 7.9,
                duration: "01:00:00",
                durationSecs: 3600,
                movieImage: "https://image.tmdb.org/t/p/w300/gAVvcD1NbX2iZJHHYWQNAF9Gucb.jpg",
                streamURL: "http://example.com/series/269859.mp4",
                containerExtension: "mp4",
                isWatched: false
            ),
            Episode(
                seriesId: 3073,
                seasonNumber: 5,
                episodeNum: 3,
                episodeId: "274175",
                title: "Tall Drink of Water",
                overview: "Beth heads to Salt Lake City to take care of unfinished business, a trap's set for Jamie, Kayce makes an important decision for his family, and Thomas Rainwater deals with mounting pressure.",
                airDate: "2022-11-20",
                rating: 7.8,
                duration: "00:54:00",
                durationSecs: 3240,
                movieImage: "https://image.tmdb.org/t/p/w300/VAQmK1Fr6NKkPwLSsWkCzDsEeS.jpg",
                streamURL: "http://example.com/series/274175.mp4",
                containerExtension: "mp4",
                isWatched: false
            )
        ]
    }

    static func previewEpisodes(for seriesId: Int, season: Int) -> [Episode] {
        previewEpisodes.filter { $0.seriesId == seriesId && $0.seasonNumber == season }
    }

    static func previewEpisodes(for seriesId: Int) -> [Episode] {
        previewEpisodes.filter { $0.seriesId == seriesId }
    }
}
#endif
