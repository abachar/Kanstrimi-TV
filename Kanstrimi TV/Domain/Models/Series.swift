//
//  Series.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import Foundation
import SwiftData

/// Modèle représentant une série TV (version optimisée pour les listes)
@Model
final class Series {
    #Index<Series>([\.categoryId], [\.tmdbId])

    /// Identifiant unique de la série
    var id: String

    /// Identifiant de la série (series_id)
    var seriesId: Int

    /// Nom de la série
    var name: String

    /// ID de la catégorie
    var categoryId: String?

    /// URL du poster
    var cover: String?

    /// Genre
    var genre: String?

    /// Note sur 5 étoiles (1.0 à 5.0)
    var rating: Double?

    /// ID TMDB pour enrichissement et identification
    var tmdbId: Int?

    /// Ordre d'affichage (préservé depuis l'API Xtream)
    var sortOrder: Int

    init(
        seriesId: Int,
        name: String,
        sortOrder: Int,
        categoryId: String? = nil,
        cover: String? = nil,
        genre: String? = nil,
        rating: Double? = nil,
        tmdbId: Int? = nil
    ) {
        self.id = "series-\(seriesId)"
        self.seriesId = seriesId
        self.name = name
        self.categoryId = categoryId
        self.cover = cover
        self.genre = genre
        self.rating = rating
        self.tmdbId = tmdbId
        self.sortOrder = sortOrder
    }
}

// MARK: - Searchable Conformance
extension Series: Searchable {}

// MARK: - CardDisplayable Conformance
extension Series: CardDisplayable {
    var imageURL: String? { cover }
    var rating5based: Double? { rating }
}

// MARK: - Preview Data
#if DEBUG
extension Series {
    static var previewSeries: [Series] {
        [
            // Category 632 - |MULTI| ✪ ENGLISH MULTISUB
            Series(
                seriesId: 3070,
                name: "You're the Worst (US)_msub",
                sortOrder: 0,
                categoryId: "632",
                cover: "http://image.tmdb.org/t/p/w185/cc712GZjnMS8lusS9W3hhGoMgph.jpg",
                genre: "Comedy, Drama",
                rating: 3.5,
                tmdbId: 62981
            ),
            Series(
                seriesId: 3071,
                name: "Young Sheldon (US)_msub",
                sortOrder: 1,
                categoryId: "632",
                cover: "http://image.tmdb.org/t/p/w185/5Gf83qYgLY8Qivn7jpv5nxxZPu6.jpg",
                genre: "Comedy",
                rating: 4.0,
                tmdbId: 71728
            ),
            Series(
                seriesId: 3072,
                name: "You (US)_msub",
                sortOrder: 2,
                categoryId: "632",
                cover: "http://image.tmdb.org/t/p/w185/yxIdKGEjagaLs5kMjw92kAHmopH.jpg",
                genre: "Mystery, Crime, Drama",
                rating: 4.0,
                tmdbId: 78191
            ),
            Series(
                seriesId: 3073,
                name: "Yellowstone (US)_msub",
                sortOrder: 3,
                categoryId: "632",
                cover: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/iqWCUwLcjkVgtpsDLs8xx8kscg6.jpg",
                genre: "Western, Drama",
                rating: 4.0,
                tmdbId: 73586
            ),
            Series(
                seriesId: 3074,
                name: "Wynonna Earp (CA)_msub",
                sortOrder: 4,
                categoryId: "632",
                cover: "http://image.tmdb.org/t/p/w185/qnIaDelA81dmFaXrhpz6M6dpGSD.jpg",
                genre: "Action & Adventure, Sci-Fi & Fantasy, Western",
                rating: 4.0,
                tmdbId: 65567
            ),
            Series(
                seriesId: 3075,
                name: "Wu Assassins (US)_msub",
                sortOrder: 5,
                categoryId: "632",
                cover: "http://image.tmdb.org/t/p/w185/nhWgmdLveoJNw1GZBkb62aIzyNr.jpg",
                genre: "Sci-Fi & Fantasy, Drama, Action & Adventure, Crime",
                rating: 3.5,
                tmdbId: 88040
            ),
            Series(
                seriesId: 3076,
                name: "When They See Us (US)_msub",
                sortOrder: 6,
                categoryId: "632",
                cover: "http://image.tmdb.org/t/p/w185/oPv3nNtkuc6EPEql5lgdOuQNHuG.jpg",
                genre: "Drama",
                rating: 4.0,
                tmdbId: 90670
            ),

            // Category 2256 - ✪ ORIGINAL MAX MULTI
            Series(
                seriesId: 40013,
                name: "When No One Sees Us (2025) MX",
                sortOrder: 7,
                categoryId: "2256",
                cover: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/hKq3uKgcUfEFcxtS77jhIjlMEuj.jpg",
                genre: "Crime / Mystery",
                rating: 3.5,
                tmdbId: 123789
            ),
            Series(
                seriesId: 40014,
                name: "Warrior (2019) MX",
                sortOrder: 8,
                categoryId: "2256",
                cover: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/hR9qPFMI6BoR63XK6BBX5Ueghan.jpg",
                genre: "Crime / Drama / Action & Adventure / Western",
                rating: 4.0,
                tmdbId: 76170
            ),
            Series(
                seriesId: 40015,
                name: "True Detective (2014) MX",
                sortOrder: 9,
                categoryId: "2256",
                cover: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/cuV2O5ZyDLHSOWzg3nLVljp1ubw.jpg",
                genre: "Drama / Mystery",
                rating: 4.0,
                tmdbId: 46648
            ),
            Series(
                seriesId: 40016,
                name: "The Wire (2002) MX",
                sortOrder: 10,
                categoryId: "2256",
                cover: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/4lbclFySvugI51fwsyxBTOm4DqK.jpg",
                genre: "Crime / Drama",
                rating: 4.5,
                tmdbId: 1438
            ),
            Series(
                seriesId: 40017,
                name: "The White Lotus (2021) MX",
                sortOrder: 11,
                categoryId: "2256",
                cover: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/gbSaK9v1CbcYH1ISgbM7XObD2dW.jpg",
                genre: "Comedy / Drama / Mystery",
                rating: 4.0,
                tmdbId: 112831
            ),
            Series(
                seriesId: 40018,
                name: "The Thaw (2022) MX",
                sortOrder: 12,
                categoryId: "2256",
                cover: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/tSn83DGeshKmDTvMEWyMqEg74E1.jpg",
                genre: "Drama / Crime",
                rating: 3.0,
                tmdbId: 156789
            ),
            Series(
                seriesId: 40019,
                name: "The Staircase (2022) MX",
                sortOrder: 13,
                categoryId: "2256",
                cover: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/jiAcdCyf1UbWYBImcNtVeLW0pRj.jpg",
                genre: "Drama / Crime",
                rating: 3.5,
                tmdbId: 131052
            )
        ]
    }

    static func previewSeries(for categoryId: String) -> [Series] {
        previewSeries.filter { $0.categoryId == categoryId }
    }
}
#endif
