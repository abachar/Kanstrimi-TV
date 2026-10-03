import Foundation

nonisolated enum HomeRowKind: String, Codable, Sendable {
    case resume, mostWatchedChannels = "most_watched_channels", recommended, recentMovies = "recent_movies", recentSeries = "recent_series"
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
    let cards: [ContentItem]
}

/// A slide of the home carousel. `item` is what it draws and what Fiche opens (the series for a new episode);
/// `playID` what Lecture plays, `versions`, `runtime`, `resumeAt` and `duration` being that title's own;
/// `episode` names it.
nonisolated struct HomeHero: Codable, Hashable, Sendable {
    let item: ContentItem
    /// What the slide is: "FILM · N° 1 CETTE SEMAINE", "SÉRIE · NOUVEL ÉPISODE · S2 É5".
    let tagline: String
    let overview: String?
    let runtime: Int?
    let certification: String?
    let versions: [Version]
    let playID: ContentID
    let episode: EpisodeRef?
    let isFavorite: Bool
    /// Seconds: where Lecture resumes a movie, nil from the start.
    let resumeAt: TimeInterval?
    let duration: TimeInterval?

    enum CodingKeys: String, CodingKey {
        case item, tagline, overview, runtime, certification, versions, episode
        case playID = "play_id"
        case isFavorite = "is_favorite"
        case resumeAt = "resume_at"
        case duration
    }

    init(item: ContentItem, tagline: String, overview: String?, runtime: Int?, certification: String?, versions: [Version],
         playID: ContentID, episode: EpisodeRef?, isFavorite: Bool = false, resumeAt: TimeInterval? = nil, duration: TimeInterval? = nil) {
        self.item = item; self.tagline = tagline; self.overview = overview; self.runtime = runtime; self.certification = certification
        self.versions = versions; self.playID = playID; self.episode = episode; self.isFavorite = isFavorite; self.resumeAt = resumeAt
        self.duration = duration
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        item = try c.decode(ContentItem.self, forKey: .item)
        tagline = try c.decode(String.self, forKey: .tagline)
        overview = try c.decodeIfPresent(String.self, forKey: .overview)
        runtime = try c.decodeIfPresent(Int.self, forKey: .runtime)
        certification = try c.decodeIfPresent(String.self, forKey: .certification)
        versions = try c.decodeIfPresent([Version].self, forKey: .versions) ?? []
        playID = try c.decode(ContentID.self, forKey: .playID)
        episode = try c.decodeIfPresent(EpisodeRef.self, forKey: .episode)
        isFavorite = try c.decodeIfPresent(Bool.self, forKey: .isFavorite) ?? false
        resumeAt = try c.decodeIfPresent(TimeInterval.self, forKey: .resumeAt)
        duration = try c.decodeIfPresent(TimeInterval.self, forKey: .duration)
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
