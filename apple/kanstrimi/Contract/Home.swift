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

nonisolated struct HomeHero: Codable, Hashable, Sendable {
    let card: Card
    /// "FILM · NOUVEAUTÉ"
    let tagline: String
    let overview: String?
    let runtime: Int?
    let certification: String?
    let versions: [Version]
}

/// `GET /home`: composed by the server, one call, ordered rows.
nonisolated struct HomeScreen: Codable, Hashable, Sendable {
    let hero: HomeHero?
    let rows: [HomeRow]
    let generatedAt: Date

    enum CodingKeys: String, CodingKey {
        case hero, rows
        case generatedAt = "generated_at"
    }
}
