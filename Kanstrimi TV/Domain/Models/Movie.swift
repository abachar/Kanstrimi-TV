//
//  Movie.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import Foundation
import SwiftData
import os

/// Modèle représentant un film VOD (version optimisée pour les listes)
@Model
final class Movie {
    #Index<Movie>([\.categoryId], [\.tmdbId])

    /// Identifiant unique du film
    var id: String

    /// Identifiant du flux (stream_id)
    var streamId: Int

    /// Nom du film
    var name: String

    /// ID de la catégorie
    var categoryId: String?

    /// URL du poster
    var streamIcon: String?

    /// Note sur 5 étoiles (1.0 à 5.0)
    var rating: Double?

    /// ID TMDB pour grouper les variantes (langues/qualités différentes)
    var tmdbId: Int?

    /// Ordre d'affichage (préservé depuis l'API Xtream)
    var sortOrder: Int

    /// URL de lecture du film
    var streamURL: String

    /// Initialisation d'un film
    init(
        streamId: Int,
        name: String,
        streamURL: String,
        sortOrder: Int,
        categoryId: String? = nil,
        streamIcon: String? = nil,
        rating: Double? = nil,
        tmdbId: Int? = nil
    ) {
        self.id = "movie-\(streamId)"
        self.streamId = streamId
        self.name = name
        self.categoryId = categoryId
        self.streamIcon = streamIcon
        self.rating = rating
        self.tmdbId = tmdbId
        self.sortOrder = sortOrder
        self.streamURL = streamURL
    }
}

// MARK: - Searchable Conformance
extension Movie: Searchable {}

// MARK: - CardDisplayable Conformance
extension Movie: CardDisplayable {
    var imageURL: String? { streamIcon }
    var rating5based: Double? { rating }
}

// MARK: - Preview Data
#if DEBUG
extension Movie {
    static var previewMovies: [Movie] {
        [
            // Category 2087 - ORIGINAL AMAZON 2024/2025 MULTI
            Movie(
                streamId: 1308888,
                name: "AZ - Yudhra (-2024)",
                streamURL: "http://example.com/movie/1308888.mkv",
                sortOrder: 0,
                categoryId: "2087",
                streamIcon: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/cwmVHD41mGDQyPyCAsR8x6aMGc2.jpg",
                rating: 2.0,
                tmdbId: 123456
            ),
            Movie(
                streamId: 1308887,
                name: "AZ - You're Cordially Invited (2025)",
                streamURL: "http://example.com/movie/1308887.mkv",
                sortOrder: 1,
                categoryId: "2087",
                streamIcon: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/muXnwAdVdEEktto0NBNMyqK3uQH.jpg",
                rating: 2.9,
                tmdbId: 996821
            ),
            Movie(
                streamId: 1308886,
                name: "AZ - Your Fault - 2024",
                streamURL: "http://example.com/movie/1308886.mkv",
                sortOrder: 2,
                categoryId: "2087",
                streamIcon: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/1sQA7lfcF9yUyoLYC0e6Zo3jmxE.jpg",
                rating: 3.6,
                tmdbId: 654321
            ),
            Movie(
                streamId: 1308885,
                name: "AZ - Yodha (-2024)",
                streamURL: "http://example.com/movie/1308885.mkv",
                sortOrder: 3,
                categoryId: "2087",
                streamIcon: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/d4xrJ9mLFEheS8b7HLyAC9GjHxc.jpg",
                rating: 3.3,
                tmdbId: 789012
            ),
            Movie(
                streamId: 1308884,
                name: "AZ - With You in the Future (2025)",
                streamURL: "http://example.com/movie/1308884.mkv",
                sortOrder: 4,
                categoryId: "2087",
                streamIcon: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/ee9iNQi91kpIkdfsAiGmJO7QdSF.jpg",
                rating: 3.9,
                tmdbId: 345678
            ),
            Movie(
                streamId: 1308883,
                name: "AZ - With Difficulty Comes Ease - 2024",
                streamURL: "http://example.com/movie/1308883.mkv",
                sortOrder: 5,
                categoryId: "2087",
                streamIcon: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/fjPhUeAgKYJ5Bx1hOJl71RlTUBQ.jpg",
                rating: 4.0,
                tmdbId: 901234
            ),
            Movie(
                streamId: 1308882,
                name: "AZ - When Love Strikes - 2024",
                streamURL: "http://example.com/movie/1308882.mkv",
                sortOrder: 6,
                categoryId: "2087",
                streamIcon: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/hZPkT1hx5aLuBMncLgtePNjh4Hl.jpg",
                rating: 0,
                tmdbId: 567890
            ),

            // Category 1535 - ORIGINAL AMAZON MULTI
            Movie(
                streamId: 1307673,
                name: "AZ - Zindagi.Na.Milegi.Dobara.2011",
                streamURL: "http://example.com/movie/1307673.mkv",
                sortOrder: 7,
                categoryId: "1535",
                streamIcon: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/hKO9O715wYxjkQSEv47giCYcyO8.jpg",
                rating: 3.8,
                tmdbId: 111222
            ),
            Movie(
                streamId: 1307672,
                name: "AZ - Zakir.Khan.Mannpasand.2013",
                streamURL: "http://example.com/movie/1307672.mkv",
                sortOrder: 8,
                categoryId: "1535",
                streamIcon: "https://image.tmdb.org/t/p/w600_and_h900_bestv2",
                rating: 0,
                tmdbId: 333444
            ),
            Movie(
                streamId: 1307671,
                name: "AZ - Zakir.Khan.Haq.Se.Single.2017",
                streamURL: "http://example.com/movie/1307671.mkv",
                sortOrder: 9,
                categoryId: "1535",
                streamIcon: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/ybNEKl4BMLCjlAxCok6t8DHb9x0.jpg",
                rating: 4.1,
                tmdbId: 555666
            ),
            Movie(
                streamId: 1307670,
                name: "AZ - Yuvarathnaa.2021",
                streamURL: "http://example.com/movie/1307670.mkv",
                sortOrder: 10,
                categoryId: "1535",
                streamIcon: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/ZVrXoqSL8lwdN9ZQHUTf9KzGOw.jpg",
                rating: 2.6,
                tmdbId: 777888
            ),
            Movie(
                streamId: 1307669,
                name: "AZ - Yours.Mine.and.Ours..2005",
                streamURL: "http://example.com/movie/1307669.mkv",
                sortOrder: 11,
                categoryId: "1535",
                streamIcon: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/1SfsoUYXRRrfL31br8q4DlTYvKK.jpg",
                rating: 3.1,
                tmdbId: 999000
            ),
            Movie(
                streamId: 1307668,
                name: "AZ - Youre.My.Favourite.Place.2022",
                streamURL: "http://example.com/movie/1307668.mkv",
                sortOrder: 12,
                categoryId: "1535",
                streamIcon: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/pPrUv1zFZmRuKevb4z6Fx3p3wTl.jpg",
                rating: 1.3,
                tmdbId: 112233
            ),
            Movie(
                streamId: 1307667,
                name: "AZ - Your.Christmas.or.Mine.2022",
                streamURL: "http://example.com/movie/1307667.mkv",
                sortOrder: 13,
                categoryId: "1535",
                streamIcon: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/A806wuTGJECDh9krhQAhnieQcLr.jpg",
                rating: 3.2,
                tmdbId: 445566
            )
        ]
    }

    static func previewMovies(for categoryId: String) -> [Movie] {
        previewMovies.filter { $0.categoryId == categoryId }
    }
}
#endif
