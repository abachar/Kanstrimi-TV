import Foundation

nonisolated struct Progress: Codable, Hashable, Sendable {
    /// Seconds.
    let position: TimeInterval
    let duration: TimeInterval
    let finished: Bool

    var fraction: Double { duration > 0 ? min(1, max(0, position / duration)) : 0 }
    var remaining: TimeInterval { max(0, duration - position) }
    /// Server marks "seen" at 90 %.
    var isWatched: Bool { finished || fraction >= 0.9 }
    var isResumable: Bool { !isWatched && fraction >= 0.05 }
}

nonisolated struct EpisodeRef: Codable, Hashable, Sendable {
    let season: Int
    let number: Int
    let title: String?

    /// "S2 · É4".
    var code: String { "S\(season) · É\(number)" }
    var shortCode: String { "S\(season) É\(number)" }
}

/// What every list carries, identical everywhere.
nonisolated struct ContentCard: Codable, Hashable, Identifiable, Sendable {
    let id: ContentID
    let kind: ContentKind
    let title: String
    let year: Int?
    let poster: URL?
    let backdrop: URL?
    let rating: Double?
    let genres: [String]
    let languages: [Language]
    let maxQuality: Quality?
    let dynamicRange: DynamicRange?
    /// Present on "Reprendre" cards.
    let progress: Progress?
    /// Present when the card is an episode (resume row, search).
    let episode: EpisodeRef?
    /// Optional hint the server computes: "VOSTFR seul", "VF le 12/10".
    let hint: String?
    let addedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, kind, title, year, poster, backdrop, rating, genres, languages, progress, episode, hint
        case maxQuality = "max_quality"
        case dynamicRange = "dynamic_range"
        case addedAt = "added_at"
    }

    /// "4K DV" or nil.
    var qualityBadge: String? {
        guard let maxQuality else { return nil }
        if let dynamicRange, dynamicRange != .sdr { return "\(maxQuality.rawValue) \(dynamicRange.shortLabel)" }
        return maxQuality.rawValue
    }
}

nonisolated struct Genre: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let name: String
    let count: Int
}

nonisolated struct Page<Item: Codable & Hashable & Sendable>: Codable, Hashable, Sendable {
    let items: [Item]
    let nextCursor: String?

    enum CodingKeys: String, CodingKey {
        case items
        case nextCursor = "next_cursor"
    }
}
