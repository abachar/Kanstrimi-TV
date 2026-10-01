import Foundation

nonisolated enum HomeRowKind: String, Codable, Sendable {
    case resume, mostWatchedChannels = "most_watched_channels", recentMovies = "recent_movies", recentSeries = "recent_series"
    case favorites, collection
    /// A kind this version does not know: the row still shows, as a plain row of cards.
    case other

    init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .other
    }
}

nonisolated struct HomeRow: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let kind: HomeRowKind
    let title: String
    let cards: [Card]
}

/// A slide of the home carousel. `card` is what Fiche opens (the series for a new episode); `playID`
/// what Lecture plays, `versions`, `runtime` and `overview` being that title's own; `episode` names it.
nonisolated struct HomeHero: Codable, Hashable, Sendable {
    let card: Card
    /// What the slide is: "FILM · N° 1 CETTE SEMAINE", "SÉRIE · NOUVEL ÉPISODE · S2 É5".
    let tagline: String
    let overview: String?
    let runtime: Int?
    let certification: String?
    let versions: [Version]
    let playID: ContentID
    let episode: EpisodeRef?

    enum CodingKeys: String, CodingKey {
        case card, tagline, overview, runtime, certification, versions, episode
        case playID = "play_id"
    }
}

/// `GET /home`: composed by the server, one call, the carousel then ordered rows.
nonisolated struct HomeScreen: Codable, Hashable, Sendable {
    /// The Top Shelf without the title in progress, six at most.
    let heroes: [HomeHero]
    let rows: [HomeRow]
    let generatedAt: Date

    init(heroes: [HomeHero], rows: [HomeRow], generatedAt: Date) {
        self.heroes = heroes
        self.rows = rows
        self.generatedAt = generatedAt
    }

    /// A home cached by an older version has a single `hero`: read without a carousel rather than not at all.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        heroes = try c.decodeIfPresent([HomeHero].self, forKey: .heroes) ?? []
        rows = try c.decode([HomeRow].self, forKey: .rows)
        generatedAt = try c.decode(Date.self, forKey: .generatedAt)
    }

    enum CodingKeys: String, CodingKey {
        case heroes, rows
        case generatedAt = "generated_at"
    }
}
