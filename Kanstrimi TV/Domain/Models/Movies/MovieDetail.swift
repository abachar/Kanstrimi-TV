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

    /// URL de lecture du film
    var streamURL: String

    /// Extension du conteneur (mp4, mkv, etc.)
    var containerExtension: String?

    /// Ajouté à la date
    var added: String?

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
        streamURL: String,
        containerExtension: String? = nil,
        added: String? = nil,
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
        self.streamURL = streamURL
        self.containerExtension = containerExtension
        self.added = added
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

// MARK: - Playable Conformance
extension MovieDetail: Playable {
    var displayTitle: String {
        name ?? "Film sans titre"
    }

    var subtitle: String? {
        var parts: [String] = []
        if let year = year {
            parts.append(year)
        }
        if let duration = duration {
            parts.append(duration)
        }
        if let rating = rating {
            parts.append("★ \(String(format: "%.1f", rating))")
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    var contentType: PlaybackContent.ContentType {
        .vod
    }
}

// MARK: - Preview Data
#if DEBUG
extension MovieDetail {
    /// MovieDetail pour "You're Cordially Invited (2025)"
    static var youreInvitedDetail: MovieDetail {
        MovieDetail(
            streamId: 1308887, // Correspond à Movie.previewMovies[1]
            streamURL: "http://example.com/movie/1308887.mkv",
            containerExtension: "mkv",
            added: "1743294540",
            tmdbId: 996821,
            name: "You're Cordially Invited",
            genre: "Comedy",
            rating: 5.894,
            duration: "01:49:00",
            year: "2025",
            cover: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/muXnwAdVdEEktto0NBNMyqK3uQH.jpg",
            plot: "When two weddings are accidentally booked on the same day at the same venue, each bridal party is challenged with preserving their family's special moment while making the most of the unanticipated tight quarters. In a hilarious battle of determination and grit, the father of the bride and sister of the other bride chaotically go head-to-head as they stop at nothing to uphold an unforgettable celebration for their loved ones.",
            director: "Nicholas Stoller, Scott Peterson",
            cast: "Will Ferrell, Reese Witherspoon, Geraldine Viswanathan, Meredith Hagner, Jimmy Tatro",
            castImages: [
                "https://image.tmdb.org/t/p/w185/kuSlwTPsVlBMW0cvnFmbZce6PaV.jpg", // Will Ferrell
                "https://image.tmdb.org/t/p/w185/6NsMbJXRlDZuDzatN2akFdGuTvx.jpg", // Reese Witherspoon
                "https://image.tmdb.org/t/p/w185/9jAU38lf6GgWDVSZ2npnV9nYmTA.jpg", // Geraldine Viswanathan
                "https://image.tmdb.org/t/p/w185/yNs4KHxWkXPLfH7DGwwXxcdR1U8.jpg", // Meredith Hagner
                "https://image.tmdb.org/t/p/w185/4V0rNAHUzF5CnqBcyYLYcrmG3tN.jpg"  // Jimmy Tatro
            ],
            backdropPaths: [
                "https://image.tmdb.org/t/p/w1280/xaNBpBkONtupAVJqQBIW5EZa7xi.jpg"
            ]
        )
    }
}
#endif
