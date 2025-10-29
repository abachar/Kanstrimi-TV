//
//  Series.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import Foundation
import SwiftData

/// Modèle représentant une série TV (optimisé pour listing)
@Model
final class Series {
    #Index<Series>([\.categoryId])

    /// Identifiant unique de la série (format: "series-{seriesId}")
    var id: String

    /// Nom de la série
    var name: String

    /// URL du poster
    var cover: String?

    /// Note de la série sur 5 étoiles
    var rating: Double?

    /// Genre (conservé car disponible dès la synchro et affiché dans les cards)
    var genre: String?

    /// Ordre d'affichage (préservé depuis l'API Xtream)
    var sortOrder: Int

    /// ID de la catégorie
    var categoryId: String?

    /// Initialisation d'une série
    init(
        seriesId: Int,
        name: String,
        sortOrder: Int,
        categoryId: String? = nil,
        cover: String? = nil,
        rating: Double? = nil,
        genre: String? = nil
    ) {
        self.id = "series-\(seriesId)"
        self.name = name
        self.cover = cover
        self.rating = rating
        self.genre = genre
        self.sortOrder = sortOrder
        self.categoryId = categoryId
    }

    /// Extrait le seriesId depuis l'ID
    var extractedSeriesId: Int? {
        let components = id.split(separator: "-")
        guard components.count == 2 else { return nil }
        return Int(components[1])
    }
}

// MARK: - Searchable Conformance
extension Series: Searchable {}

// MARK: - CardDisplayable Conformance
extension Series: CardDisplayable {
    var imageURL: String? { cover }
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
                rating: 3.5,
                genre: "Comedy, Drama"
            ),
            Series(
                seriesId: 3071,
                name: "Young Sheldon (US)_msub",
                sortOrder: 1,
                categoryId: "632",
                cover: "http://image.tmdb.org/t/p/w185/5Gf83qYgLY8Qivn7jpv5nxxZPu6.jpg",
                rating: 4.0,
                genre: "Comedy"
            ),
            Series(
                seriesId: 3072,
                name: "You (US)_msub",
                sortOrder: 2,
                categoryId: "632",
                cover: "http://image.tmdb.org/t/p/w185/yxIdKGEjagaLs5kMjw92kAHmopH.jpg",
                rating: 4.0,
                genre: "Mystery, Crime, Drama"
            ),
            Series(
                seriesId: 3073,
                name: "Yellowstone (US)_msub",
                sortOrder: 3,
                categoryId: "632",
                cover: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/iqWCUwLcjkVgtpsDLs8xx8kscg6.jpg",
                rating: 4.0,
                genre: "Western, Drama"
            ),

            // Category 2256 - ✪ ORIGINAL MAX MULTI
            Series(
                seriesId: 40013,
                name: "When No One Sees Us (2025) MX",
                sortOrder: 7,
                categoryId: "2256",
                cover: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/hKq3uKgcUfEFcxtS77jhIjlMEuj.jpg",
                rating: 3.5,
                genre: "Crime / Mystery"
            ),
            Series(
                seriesId: 40014,
                name: "Warrior (2019) MX",
                sortOrder: 8,
                categoryId: "2256",
                cover: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/hR9qPFMI6BoR63XK6BBX5Ueghan.jpg",
                rating: 4.0,
                genre: "Crime / Drama / Action & Adventure / Western"
            ),
            Series(
                seriesId: 40015,
                name: "True Detective (2014) MX",
                sortOrder: 9,
                categoryId: "2256",
                cover: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/cuV2O5ZyDLHSOWzg3nLVljp1ubw.jpg",
                rating: 4.0,
                genre: "Drama / Mystery"
            ),
            Series(
                seriesId: 40016,
                name: "The Wire (2002) MX",
                sortOrder: 10,
                categoryId: "2256",
                cover: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/4lbclFySvugI51fwsyxBTOm4DqK.jpg",
                rating: 4.5,
                genre: "Crime / Drama"
            ),
            Series(
                seriesId: 40017,
                name: "The White Lotus (2021) MX",
                sortOrder: 11,
                categoryId: "2256",
                cover: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/gbSaK9v1CbcYH1ISgbM7XObD2dW.jpg",
                rating: 4.0,
                genre: "Comedy / Drama / Mystery"
            ),
            Series(
                seriesId: 40018,
                name: "The Thaw (2022) MX",
                sortOrder: 12,
                categoryId: "2256",
                cover: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/tSn83DGeshKmDTvMEWyMqEg74E1.jpg",
                rating: 3.0,
                genre: "Drama / Crime"
            ),
            Series(
                seriesId: 40019,
                name: "The Staircase (2022) MX",
                sortOrder: 13,
                categoryId: "2256",
                cover: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/jiAcdCyf1UbWYBImcNtVeLW0pRj.jpg",
                rating: 3.5,
                genre: "Drama / Crime"
            )
        ]
    }

    static func previewSeries(for categoryId: String) -> [Series] {
        previewSeries.filter { $0.categoryId == categoryId }
    }
}
#endif
