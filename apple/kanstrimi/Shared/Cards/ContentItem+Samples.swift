#if DEBUG
import Foundation

/// Fixed items for the cards' previews: drawn at once, without the demo client.
extension ContentItem {
    private static func image(_ path: String) -> URL? { URL(string: "https://kanstrimi.crafters.dev/img/\(path)") }

    static let sampleMovie = ContentItem(id: ContentID("tmdb:movie:496243"), kind: .movie, title: "Parasite",
                                         poster: image("w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg"), picture: image("w1280/TU9NIjwzjoKPwQHoHshkFcQUCG.jpg"),
                                         facts: "2019 · ★ 8.5", badges: ["4K", "VF", "VOSTFR", "VO"])
    static let sampleInProgress = ContentItem(id: ContentID("tmdb:movie:603"), kind: .movie, title: "Matrix",
                                              facts: "1999 · ★ 8.2", badges: ["4K DV", "VF"], progress: 0.62, caption: "52 min restantes")
    static let sampleSaga = ContentItem(id: ContentID("saga:2344"), kind: .saga, title: "Matrix - Saga", facts: "4 films")
    static let sampleWatched = ContentItem(id: ContentID("tmdb:movie:550"), kind: .movie, title: "Fight Club",
                                           facts: "1999 · ★ 8.4", badges: ["HD", "VF"], watched: true)
    static let sampleHint = ContentItem(id: ContentID("tmdb:tv:300388"), kind: .series, title: "Güller ve Günahlar",
                                        facts: "2025 · ★ 8.3", badges: ["HD", "VOSTFR"], hint: "VOSTFR seul")
    static let sampleResume = ContentItem(id: ContentID("tmdb:tv:1396:s02e04"), kind: .episode, title: "Vincenzo",
                                          picture: image("w1280/dvXJgEDQXhL9Ouot2WkBHpQx1HY.jpg"), badges: ["4K", "VF", "VOSTFR"],
                                          progress: 0.35, caption: "S2 · É4 · 1 h 08 restantes")
    static let sampleRelated = ContentItem(id: ContentID("tmdb:movie:604"), kind: .movie, title: "Matrix Reloaded",
                                           badges: ["HD", "VF"], caption: "2003 · Action · 2 h 18")
    static let sampleEpisode = ContentItem(id: ContentID("tmdb:tv:300388:s01e02"), kind: .episode, title: "Épisode 2",
                                           facts: "É2 · 52 min", progress: 0.3, caption: "É2 · 52 min")
    static let sampleWatchedEpisode = ContentItem(id: ContentID("tmdb:tv:300388:s01e01"), kind: .episode, title: "Épisode 1",
                                                  facts: "É1 · 48 min", watched: true, caption: "É1 · 48 min")
    static let sampleChannel = ContentItem(id: ContentID("live:fr-tf1"), kind: .live, title: "TF1", facts: "France · Généralistes", badges: ["FHD"])
    static let sampleNextEpisode = ContentItem(id: ContentID("tmdb:tv:300388:s01e03"), kind: .episode, title: "Épisode 3",
                                               facts: "Güller ve Günahlar · S1 · É3 · 2 h 23", badges: ["HD", "VOSTFR"],
                                               overview: "Serhat découvre ce que sa femme lui cachait.")
    static let sampleNextTitle = ContentItem(id: ContentID("tmdb:movie:604"), kind: .movie, title: "Matrix Reloaded",
                                             facts: "2003 · Action · 2 h 18", badges: ["4K", "VF", "VOSTFR"],
                                             overview: "Neo et ses alliés défendent Zion contre l'assaut des machines.")
    static let sampleHero = ContentItem(id: ContentID("tmdb:movie:496243"), kind: .movie, title: "Parasite",
                                        poster: image("w780/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg"), picture: image("w1280/TU9NIjwzjoKPwQHoHshkFcQUCG.jpg"),
                                        facts: "2019 · Thriller · 2 h 13", badges: ["4K", "VF", "VOSTFR"],
                                        overview: "Toute la famille de Ki-taek est au chômage. Elle s'intéresse au train de vie de la richissime famille Park, jusqu'au jour où le fils réussit à s'y faire recommander pour donner des cours d'anglais.")
    static let sampleNoPoster = ContentItem(id: ContentID("fallback:movie:silver-book-of-dreams:2026"), kind: .movie,
                                            title: "Silver Book of Dreams", facts: "2026")
}
#endif
