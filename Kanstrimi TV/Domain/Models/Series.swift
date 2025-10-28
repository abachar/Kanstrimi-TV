//
//  Series.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import Foundation
import SwiftData

/// Modèle représentant une série TV
@Model
final class Series {
    #Index<Series>([\.categoryId])
    
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
    
    /// Synopsis/Description
    var plot: String?

    /// Réalisateur
    var director: String?

    /// Acteurs
    var cast: String?
    
    /// Genre
    var genre: String?

    /// Date de sortie
    var releaseDate: String?
    
    /// Date de la dernière diffusion
    var lastModified: String?
    
    /// Note de la série
    var rating: String?

    /// Note sur 5 étoiles
    var rating5based: Double?
    
    var backdropPaths: [String]?
    
    /// URL de la bande-annonce YouTube
    var youtubeTrailer: String?

    /// Ordre d'affichage (préservé depuis l'API Xtream)
    var sortOrder: Int
    
    /// Nombre total d'épisodes
    var episodeRunTime: String?

    init(
        seriesId: Int,
        name: String,
        sortOrder: Int,
        categoryId: String? = nil,
        cover: String? = nil,
        backdropPaths: [String]?,
        rating: String? = nil,
        rating5based: Double? = nil,
        plot: String? = nil,
        director: String? = nil,
        cast: String? = nil,
        genre: String? = nil,
        releaseDate: String? = nil,
        lastModified: String? = nil,
        youtubeTrailer: String? = nil,
        episodeRunTime: String? = nil,

    ) {
        self.id = "series-\(seriesId)"
        self.seriesId = seriesId
        self.name = name
        self.categoryId = categoryId
        self.cover = cover
        self.plot = plot
        self.director = director
        self.cast = cast
        self.genre = genre
        self.releaseDate = releaseDate
        self.lastModified = lastModified
        self.rating = rating
        self.rating5based = rating5based
        self.backdropPaths = backdropPaths
        self.youtubeTrailer = youtubeTrailer
        self.episodeRunTime = episodeRunTime
        self.sortOrder = sortOrder
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
                backdropPaths: [
                    "http://dtv21.org:2082/images/series/abQlSjJTDL7QnQ2PCnCJzs0JhhI.jpg",
                    "http://dtv21.org:2082/images/series/t6W7NuKGeTEqNVj1IXFrMmS4FZa.jpg"
                ],
                rating: "7",
                rating5based: 3.5,
                plot: "Narcissistic, brash, and self-destructive \"Jimmy Shive-Overly,\" thinks all relationships are doomed. Cynical, people-pleasing, and stubborn \"Gretchen Cutler,\" knows that relationships aren't for her. So when they meet at a wedding, it's only natural that the two of them go home together and, despite their better judgment, begin to find themselves falling for each other.",
                director: "Stephen Falk",
                cast: "",
                genre: "Comedy, Drama",
                releaseDate: "2014-07-17",
                lastModified: "1635179407",
                youtubeTrailer: "",
                episodeRunTime: "26"
            ),
            Series(
                seriesId: 3071,
                name: "Young Sheldon (US)_msub",
                sortOrder: 1,
                categoryId: "632",
                cover: "http://image.tmdb.org/t/p/w185/5Gf83qYgLY8Qivn7jpv5nxxZPu6.jpg",
                backdropPaths: [
                    "http://dtv21.org:2082/images/series/jd55POurnmrFnKyJZtW4Rm78TpX.jpg",
                    "http://dtv21.org:2082/images/series/ixzy7s8FkTvvqGbOSmIImztuGu5.jpg"
                ],
                rating: "8",
                rating5based: 4.0,
                plot: "The early life of child genius Sheldon Cooper, later seen in The Big Bang Theory.",
                director: "Chuck Lorre, Steven Molaro",
                cast: "",
                genre: "Comedy",
                releaseDate: "2017-09-25",
                lastModified: "1635179374",
                youtubeTrailer: "",
                episodeRunTime: "22"
            ),
            Series(
                seriesId: 3072,
                name: "You (US)_msub",
                sortOrder: 2,
                categoryId: "632",
                cover: "http://image.tmdb.org/t/p/w185/yxIdKGEjagaLs5kMjw92kAHmopH.jpg",
                backdropPaths: [
                    "http://dtv21.org:2082/images/series/kfWUEC7uEOtVrUU8vjpsabiR2e3.jpg",
                    "http://dtv21.org:2082/images/series/xpIhxvpuWZyKqV6kMHU88yzywtG.jpg"
                ],
                rating: "8",
                rating5based: 4.0,
                plot: "A dangerously charming, intensely obsessive young man goes to extreme measures to insert himself into the lives of those he is transfixed by.",
                director: "Greg Berlanti, Sera Gamble",
                cast: "",
                genre: "Mystery, Crime, Drama",
                releaseDate: "2018-09-09",
                lastModified: "1635179351",
                youtubeTrailer: "",
                episodeRunTime: "46"
            ),
            Series(
                seriesId: 3073,
                name: "Yellowstone (US)_msub",
                sortOrder: 3,
                categoryId: "632",
                cover: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/iqWCUwLcjkVgtpsDLs8xx8kscg6.jpg",
                backdropPaths: [
                    "https://image.tmdb.org/t/p/w1280/5YTM1bh3Jyfy9IP2eS64W3JDeGs.jpg"
                ],
                rating: "8",
                rating5based: 4.0,
                plot: "Follow the violent world of the Dutton family, who controls the largest contiguous ranch in the United States. Led by their patriarch John Dutton, the family defends their property against constant attack by land developers, an Indian reservation, and America's first National Park.",
                director: "John Linson, Taylor Sheridan",
                cast: "",
                genre: "Western, Drama",
                releaseDate: "2018-06-20",
                lastModified: "1756416334",
                youtubeTrailer: "",
                episodeRunTime: "134"
            ),
            Series(
                seriesId: 3074,
                name: "Wynonna Earp (CA)_msub",
                sortOrder: 4,
                categoryId: "632",
                cover: "http://image.tmdb.org/t/p/w185/qnIaDelA81dmFaXrhpz6M6dpGSD.jpg",
                backdropPaths: [
                    "http://dtv21.org:2082/images/series/354iZbM2fdHBRuyEqqN9varLgo2.jpg",
                    "http://dtv21.org:2082/images/series/39Uj3g8sfzvGsnoMVB0b0CqUzjI.jpg"
                ],
                rating: "8",
                rating5based: 4.0,
                plot: "Wyatt Earp's great granddaughter Wynonna battles demons and other creatures with her unique abilities and a posse of dysfunctional allies - the only thing that can bring the paranormal to justice.",
                director: "Emily Andras",
                cast: "",
                genre: "Action & Adventure, Sci-Fi & Fantasy, Western",
                releaseDate: "2016-04-01",
                lastModified: "1635179312",
                youtubeTrailer: "",
                episodeRunTime: "44"
            ),
            Series(
                seriesId: 3075,
                name: "Wu Assassins (US)_msub",
                sortOrder: 5,
                categoryId: "632",
                cover: "http://image.tmdb.org/t/p/w185/nhWgmdLveoJNw1GZBkb62aIzyNr.jpg",
                backdropPaths: [],
                rating: "7",
                rating5based: 3.5,
                plot: "The last in a line of Chosen Ones, a wannabe chef teams up with a homicide detective to unravel an ancient mystery and take down supernatural assassins.",
                director: "Tony Krantz, John Wirth",
                cast: "",
                genre: "Sci-Fi & Fantasy, Drama, Action & Adventure, Crime",
                releaseDate: "2019-08-08",
                lastModified: "1635179290",
                youtubeTrailer: "",
                episodeRunTime: "45"
            ),
            Series(
                seriesId: 3076,
                name: "When They See Us (US)_msub",
                sortOrder: 6,
                categoryId: "632",
                cover: "http://image.tmdb.org/t/p/w185/oPv3nNtkuc6EPEql5lgdOuQNHuG.jpg",
                backdropPaths: [],
                rating: "8",
                rating5based: 4.0,
                plot: "Five teens from Harlem become trapped in a nightmare when they're falsely accused of a brutal attack in Central Park.",
                director: "Ava DuVernay",
                cast: "",
                genre: "Drama",
                releaseDate: "2019-05-31",
                lastModified: "1635179255",
                youtubeTrailer: "",
                episodeRunTime: "75"
            ),

            // Category 2256 - ✪ ORIGINAL MAX MULTI
            Series(
                seriesId: 40013,
                name: "When No One Sees Us (2025) MX",
                sortOrder: 7,
                categoryId: "2256",
                cover: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/hKq3uKgcUfEFcxtS77jhIjlMEuj.jpg",
                backdropPaths: [
                    "https://image.tmdb.org/t/p/w1280/7LhbN2JfTZgt4cdxaHl14pqV9JT.jpg",
                    "https://image.tmdb.org/t/p/w1280/ndGquoHddy395hgaJKUL9u6zQ9T.jpg"
                ],
                rating: "7",
                rating5based: 3.5,
                plot: "Set against the dramatic backdrop of the Spanish Holy Week celebrations, two policewomen try to solve a series of crimes in the Andalusian town of Morón de la Frontera, in the political and cultural region of Seville's so-called 'deep Spain', which is home to one of the biggest international U.S. military bases.",
                director: "Daniel Corpas",
                cast: "Maribel Verdú, Mariela Garriga, Austin Amelio, Ben Temple, Dani Rovira, Lucía Jiménez, Numa Paredes, María Alfonsa Rosso",
                genre: "Crime / Mystery",
                releaseDate: "2025-03-07",
                lastModified: "1753715800",
                youtubeTrailer: "o0si9Hg-xLU",
                episodeRunTime: "0"
            ),
            Series(
                seriesId: 40014,
                name: "Warrior (2019) MX",
                sortOrder: 8,
                categoryId: "2256",
                cover: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/hR9qPFMI6BoR63XK6BBX5Ueghan.jpg",
                backdropPaths: [
                    "https://image.tmdb.org/t/p/w1280/rzOxgYYXYcjv5N5KS759DiZKqPA.jpg",
                    "https://image.tmdb.org/t/p/w1280/jSBUu67DL0ajUo2e8b2orVX2TOw.jpg"
                ],
                rating: "8",
                rating5based: 4.0,
                plot: "A gritty, action-packed crime drama set during the brutal Tong Wars of San Francisco's Chinatown in the second half of the 19th century. The series follows Ah Sahm, a martial arts prodigy who immigrates from China to San Francisco under mysterious circumstances, and becomes a hatchet man for one of Chinatown's most powerful tongs.",
                director: "Jonathan Tropper",
                cast: "Andrew Koji, Olivia Cheng, Jason Tobin, Dianne Doan, Kieran Bew, Dean S. Jagger, Tom Weston-Jones, Hoon Lee",
                genre: "Crime / Drama / Action & Adventure / Western",
                releaseDate: "2019-04-05",
                lastModified: "1753715790",
                youtubeTrailer: "79rtcCnaeyo",
                episodeRunTime: "55"
            ),
            Series(
                seriesId: 40015,
                name: "True Detective (2014) MX",
                sortOrder: 9,
                categoryId: "2256",
                cover: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/cuV2O5ZyDLHSOWzg3nLVljp1ubw.jpg",
                backdropPaths: [
                    "https://image.tmdb.org/t/p/w1280/e3nq2DcnHj250o1bLClF3hExoIm.jpg",
                    "https://image.tmdb.org/t/p/w1280/82qpvU7AzT9D8oC02fIceb5KAz8.jpg"
                ],
                rating: "8",
                rating5based: 4.0,
                plot: "An American anthology police detective series utilizing multiple timelines in which investigations seem to unearth personal and professional secrets of those involved, both within or outside the law.",
                director: "Nic Pizzolatto, Issa López",
                cast: "Jodie Foster, Kali Reis, Fiona Shaw, Finn Bennett, Isabella Star LaBlanc, John Hawkes",
                genre: "Drama / Mystery",
                releaseDate: "2014-01-12",
                lastModified: "1753715773",
                youtubeTrailer: "33OBRE2T088",
                episodeRunTime: "0"
            ),
            Series(
                seriesId: 40016,
                name: "The Wire (2002) MX",
                sortOrder: 10,
                categoryId: "2256",
                cover: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/4lbclFySvugI51fwsyxBTOm4DqK.jpg",
                backdropPaths: [
                    "https://image.tmdb.org/t/p/w1280/layPSOJGckJv3PXZDIVluMq69mn.jpg",
                    "https://image.tmdb.org/t/p/w1280/oggnxmvofLtGQvXsO9bAFyCj3p6.jpg"
                ],
                rating: "9",
                rating5based: 4.5,
                plot: "Told from the points of view of both the Baltimore homicide and narcotics detectives and their targets, the series captures a universe in which the national war on drugs has become a permanent, self-sustaining bureaucracy, and distinctions between good and evil are routinely obliterated.",
                director: "David Simon",
                cast: "Dominic West, Lance Reddick, Sonja Sohn, Wendell Pierce, Michael Kenneth Williams, Deirdre Lovejoy, J.D. Williams, John Doman",
                genre: "Crime / Drama",
                releaseDate: "2002-06-02",
                lastModified: "1753715847",
                youtubeTrailer: "hz401ifciSM",
                episodeRunTime: "60"
            ),
            Series(
                seriesId: 40017,
                name: "The White Lotus (2021) MX",
                sortOrder: 11,
                categoryId: "2256",
                cover: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/gbSaK9v1CbcYH1ISgbM7XObD2dW.jpg",
                backdropPaths: [
                    "https://image.tmdb.org/t/p/w1280/rCTLaPwuApDx8vLGjYZ9pRl7zRB.jpg",
                    "https://image.tmdb.org/t/p/w1280/qVBIAcZkK5j6WRq7JehJcOMbdgb.jpg"
                ],
                rating: "8",
                rating5based: 4.0,
                plot: "Follow the exploits of various guests and employees at an exclusive tropical resort over the span of a week as with each passing day, a darker complexity emerges in these picture-perfect travelers, the hotel's cheerful employees and the idyllic locale itself.",
                director: "Mike White",
                cast: "Leslie Bibb, Carrie Coon, Walton Goggins, Sarah Catherine Hook, Jason Isaacs, LISA, Michelle Monaghan, Natasha Rothwell",
                genre: "Comedy / Drama / Mystery",
                releaseDate: "2021-07-11",
                lastModified: "1753715757",
                youtubeTrailer: "l2wj6q6YSXBZmGZCsxAo1ekO6If",
                episodeRunTime: "0"
            ),
            Series(
                seriesId: 40018,
                name: "The Thaw (2022) MX",
                sortOrder: 12,
                categoryId: "2256",
                cover: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/tSn83DGeshKmDTvMEWyMqEg74E1.jpg",
                backdropPaths: [
                    "https://image.tmdb.org/t/p/w1280/ainCmvG8YZp0WfeDiAD9VPoYh68.jpg",
                    "https://image.tmdb.org/t/p/w1280/znUILiRc2nfnBBmYEFZswyE4UUp.jpg"
                ],
                rating: "6",
                rating5based: 3.0,
                plot: "Set in Szczecin, Poland, the series begins after the body of a young woman is discovered under the melting ice. It asks 'Who was she? Why did she die? Who did she leave behind?",
                director: "",
                cast: "Katarzyna Wajda, Bartłomiej Kotschedoff, Juliusz Chrząstowski, Agnieszka Dygant, Mirosław Zbrojewicz, Nikodem Rozbicki, Aleksander Kaleta, Eryk Kulm",
                genre: "Drama / Crime",
                releaseDate: "2022-04-01",
                lastModified: "1760794749",
                youtubeTrailer: "",
                episodeRunTime: "50"
            ),
            Series(
                seriesId: 40019,
                name: "The Staircase (2022) MX",
                sortOrder: 13,
                categoryId: "2256",
                cover: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/jiAcdCyf1UbWYBImcNtVeLW0pRj.jpg",
                backdropPaths: [
                    "https://image.tmdb.org/t/p/w1280/rtDGYw9xUh4bdrIdjzUuvVHS7kb.jpg",
                    "https://image.tmdb.org/t/p/w1280/1OFW2d7x7OmCPw7J2mVonzgC0vv.jpg"
                ],
                rating: "7",
                rating5based: 3.5,
                plot: "An exploration of the life of Michael Peterson, his sprawling North Carolina family, and the suspicious death of his wife, Kathleen Peterson.",
                director: "Antonio Campos",
                cast: "Colin Firth, Toni Collette, Michael Stuhlbarg, Dane DeHaan, Olivia DeJonge, Patrick Schwarzenegger, Sophie Turner, Odessa Young",
                genre: "Drama / Crime",
                releaseDate: "2022-05-05",
                lastModified: "1753715688",
                youtubeTrailer: "O8TW6Ap-IYE",
                episodeRunTime: "0"
            )
        ]
    }

    static func previewSeries(for categoryId: String) -> [Series] {
        previewSeries.filter { $0.categoryId == categoryId }
    }
}
#endif
