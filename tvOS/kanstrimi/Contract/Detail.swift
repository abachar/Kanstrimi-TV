import Foundation

nonisolated struct Person: Codable, Hashable, Sendable {
    let name: String
    let role: String?
}

nonisolated struct Season: Codable, Hashable, Identifiable, Sendable {
    let number: Int
    let title: String?
    let episodeCount: Int
    let year: Int?
    var id: Int { number }

    enum CodingKeys: String, CodingKey {
        case number, title, year
        case episodeCount = "episode_count"
    }
}

nonisolated struct Episode: Codable, Hashable, Identifiable, Sendable {
    let id: ContentID
    let season: Int
    let number: Int
    let title: String
    let overview: String?
    let runtime: Int?
    let still: URL?
    let airDate: Date?
    let versions: [Version]
    let progress: Progress?

    enum CodingKeys: String, CodingKey {
        case id, season, number, title, overview, runtime, still, versions, progress
        case airDate = "air_date"
    }

    var ref: EpisodeRef { EpisodeRef(season: season, number: number, title: title) }
    var languages: [Language] { versions.languages }
}

/// The full sheet: one call.
nonisolated struct ContentDetail: Codable, Hashable, Identifiable, Sendable {
    let id: ContentID
    let kind: ContentKind
    let title: String
    let originalTitle: String?
    let year: Int?
    let endYear: Int?
    let overview: String?
    let genres: [String]
    let runtime: Int?
    let certification: String?
    let rating: Double?
    let poster: URL?
    let backdrop: URL?
    let cast: [Person]
    let director: String?
    let trailer: URL?
    /// False when the server found no TMDB match; then `providerCategory` and `rawTitle` fill in.
    let hasTMDB: Bool
    let providerCategory: String?
    let rawTitle: String?
    /// Movies: the versions. Series: empty, versions live on episodes.
    let versions: [Version]
    let progress: Progress?
    var isFavorite: Bool
    /// Series only, without episodes.
    let seasons: [Season]?
    /// Series only: the episode the main button resumes or starts.
    let currentEpisode: EpisodeRef?
    let addedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, kind, title, year, overview, genres, runtime, certification, rating, poster, backdrop, cast, director, trailer, versions, progress, seasons
        case originalTitle = "original_title"
        case endYear = "end_year"
        case hasTMDB = "has_tmdb"
        case providerCategory = "provider_category"
        case rawTitle = "raw_title"
        case isFavorite = "is_favorite"
        case currentEpisode = "current_episode"
        case addedAt = "added_at"
    }

    var card: ContentCard {
        ContentCard(id: id, kind: kind, title: title, year: year, poster: poster, backdrop: backdrop,
                    rating: rating, genres: genres, languages: versions.languages,
                    maxQuality: versions.maxQuality, dynamicRange: versions.maxDynamicRange,
                    progress: progress, episode: nil, hint: nil, addedAt: addedAt)
    }
}
