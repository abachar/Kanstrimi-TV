import Foundation

nonisolated enum HomeRowKind: String, Codable, Sendable {
    case resume, recentMovies = "recent_movies", recentSeries = "recent_series", favorites, collection
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
