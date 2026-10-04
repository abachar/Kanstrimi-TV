import Foundation

nonisolated struct Progress: Codable, Hashable, Sendable {
    /// Seconds.
    let position: TimeInterval
    let duration: TimeInterval
    /// Derived by the server at 90 %; absent on list cards.
    let finished: Bool?
    /// Decided by the server (between 5 % and « Vu »): the app compares no threshold.
    let resumable: Bool

    var fraction: Double { duration > 0 ? min(1, max(0, position / duration)) : 0 }
    var remaining: TimeInterval { max(0, duration - position) }
    var isWatched: Bool { finished ?? false }
    var isResumable: Bool { resumable }
}

nonisolated struct EpisodeRef: Codable, Hashable, Sendable {
    let season: Int
    let number: Int
    let title: String?

    /// "S2 · É4".
    var code: String { "S\(season) · É\(number)" }
    var shortCode: String { "S\(season) É\(number)" }
}

/// A cast member of a sheet. `id` = `person:<TMDB id>`; nil on a sheet the server has not copied again
/// (no link to their titles). `photo` is nil when TMDB has none.
nonisolated struct Person: Codable, Hashable, Sendable {
    let id: String?
    let name: String
    let role: String?
    let photo: URL?

    init(id: String? = nil, name: String, role: String? = nil, photo: URL? = nil) {
        self.id = id; self.name = name; self.role = role; self.photo = photo
    }

    /// What the navigation carries to the actor's screen; nil without an `id`.
    var ref: PersonRef? { id.map { PersonRef(id: $0, name: name, photo: photo) } }
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
    /// What its card draws: the still, « É4 · 52 min », the progress, « vu ».
    let item: ContentItem

    enum CodingKeys: String, CodingKey {
        case id, season, number, title, overview, runtime, still, versions, progress, item
        case airDate = "air_date"
    }

    init(id: ContentID, season: Int, number: Int, title: String, overview: String?, runtime: Int?, still: URL?, airDate: Date?,
         versions: [Version], progress: Progress?, item: ContentItem) {
        self.id = id; self.season = season; self.number = number; self.title = title; self.overview = overview; self.runtime = runtime
        self.still = still; self.airDate = airDate; self.versions = versions; self.progress = progress; self.item = item
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(ContentID.self, forKey: .id)
        season = try c.decode(Int.self, forKey: .season)
        number = try c.decode(Int.self, forKey: .number)
        title = try c.decode(String.self, forKey: .title)
        overview = try c.decodeIfPresent(String.self, forKey: .overview)
        runtime = try c.decodeIfPresent(Int.self, forKey: .runtime)
        still = try c.decodeIfPresent(URL.self, forKey: .still)
        airDate = try c.decodeIfPresent(Date.self, forKey: .airDate)
        versions = try c.decodeIfPresent([Version].self, forKey: .versions) ?? []
        progress = try c.decodeIfPresent(Progress.self, forKey: .progress)
        // The demo fixtures carry none: the still alone until the client writes it.
        item = try c.decodeIfPresent(ContentItem.self, forKey: .item) ?? ContentItem(id: id, kind: .episode, title: title, picture: still)
    }

    var ref: EpisodeRef { EpisodeRef(season: season, number: number, title: title) }
    var languages: [Language] { versions.languages }
}

/// A season with its episodes: `GET /series/{id}` carries them all.
nonisolated struct Season: Codable, Hashable, Identifiable, Sendable {
    let number: Int
    let title: String?
    let year: Int?
    let episodes: [Episode]
    var id: Int { number }
}

/// The sheet of a title (`GET /movies/{id}`, `GET /series/{id}`). Lists, resume rows and search carry a `ContentItem`.
nonisolated struct Card: Codable, Hashable, Identifiable, Sendable {
    let id: ContentID
    let kind: ContentKind
    let title: String
    let poster: URL?
    let maxQuality: Quality?
    let dynamicRange: DynamicRange?
    let languages: [Language]

    let backdrop: URL?
    let progress: Progress?
    let episode: EpisodeRef?

    let year: Int?
    let rating: Double?
    let genres: [String]
    let hint: String?
    let addedAt: Date?

    /// The title's logo (transparent PNG), drawn in place of the title.
    let logo: URL?
    let originalTitle: String?
    let endYear: Int?
    let overview: String?
    let runtime: Int?
    let certification: String?
    let cast: [Person]
    let director: String?
    let trailer: URL?
    let hasTMDB: Bool?
    let providerCategory: String?
    let rawTitle: String?
    let versions: [Version]
    var isFavorite: Bool?
    let seasons: [Season]?
    let currentEpisode: EpisodeRef?
    /// Movie sheet: its saga, when the server lists it.
    let saga: SagaRef?
    /// Sheet texts, written by the server: « FILM », « SÉRIE · 3 SAISONS »; « 2019 · Drame, Crime · 52 min »; « ★ 8.5 »; the play button.
    let tagline: String
    let facts: String?
    let ratingLabel: String?
    let playLabel: String
    /// Sheet: « Si vous avez aimé… », TMDB's recommendations in the catalogue, nothing already seen.
    let related: [ContentItem]

    enum CodingKeys: String, CodingKey {
        case id, kind, title, poster, languages, backdrop, progress, episode, year, rating, genres, hint
        case overview, runtime, certification, cast, director, trailer, versions, seasons, saga, logo, related, tagline, facts
        case maxQuality = "max_quality"
        case dynamicRange = "dynamic_range"
        case addedAt = "added_at"
        case originalTitle = "original_title"
        case endYear = "end_year"
        case hasTMDB = "has_tmdb"
        case providerCategory = "provider_category"
        case rawTitle = "raw_title"
        case isFavorite = "is_favorite"
        case currentEpisode = "current_episode"
        case ratingLabel = "rating_label"
        case playLabel = "play_label"
    }

    init(id: ContentID, kind: ContentKind, title: String, poster: URL? = nil, maxQuality: Quality? = nil, dynamicRange: DynamicRange? = nil,
         languages: [Language] = [], backdrop: URL? = nil, progress: Progress? = nil, episode: EpisodeRef? = nil,
         year: Int? = nil, rating: Double? = nil, genres: [String] = [], hint: String? = nil, addedAt: Date? = nil, logo: URL? = nil,
         originalTitle: String? = nil, endYear: Int? = nil, overview: String? = nil, runtime: Int? = nil, certification: String? = nil,
         cast: [Person] = [], director: String? = nil, trailer: URL? = nil, hasTMDB: Bool? = nil, providerCategory: String? = nil,
         rawTitle: String? = nil, versions: [Version] = [], isFavorite: Bool? = nil, seasons: [Season]? = nil, currentEpisode: EpisodeRef? = nil,
         saga: SagaRef? = nil, tagline: String = "", facts: String? = nil, ratingLabel: String? = nil, playLabel: String = "",
         related: [ContentItem] = []) {
        self.id = id; self.kind = kind; self.title = title; self.poster = poster; self.maxQuality = maxQuality; self.dynamicRange = dynamicRange
        self.languages = languages; self.backdrop = backdrop; self.progress = progress; self.episode = episode
        self.year = year; self.rating = rating; self.genres = genres; self.hint = hint; self.addedAt = addedAt; self.logo = logo
        self.originalTitle = originalTitle; self.endYear = endYear; self.overview = overview; self.runtime = runtime; self.certification = certification
        self.cast = cast; self.director = director; self.trailer = trailer; self.hasTMDB = hasTMDB; self.providerCategory = providerCategory
        self.rawTitle = rawTitle; self.versions = versions; self.isFavorite = isFavorite; self.seasons = seasons; self.currentEpisode = currentEpisode
        self.saga = saga; self.tagline = tagline; self.facts = facts; self.ratingLabel = ratingLabel; self.playLabel = playLabel; self.related = related
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(ContentID.self, forKey: .id)
        kind = try c.decode(ContentKind.self, forKey: .kind)
        title = try c.decode(String.self, forKey: .title)
        poster = try c.decodeIfPresent(URL.self, forKey: .poster)
        maxQuality = try c.decodeIfPresent(Quality.self, forKey: .maxQuality)
        dynamicRange = try c.decodeIfPresent(DynamicRange.self, forKey: .dynamicRange)
        languages = try c.decodeIfPresent([Language].self, forKey: .languages) ?? []
        backdrop = try c.decodeIfPresent(URL.self, forKey: .backdrop)
        progress = try c.decodeIfPresent(Progress.self, forKey: .progress)
        episode = try c.decodeIfPresent(EpisodeRef.self, forKey: .episode)
        year = try c.decodeIfPresent(Int.self, forKey: .year)
        rating = try c.decodeIfPresent(Double.self, forKey: .rating)
        genres = try c.decodeIfPresent([String].self, forKey: .genres) ?? []
        hint = try c.decodeIfPresent(String.self, forKey: .hint)
        addedAt = try c.decodeIfPresent(Date.self, forKey: .addedAt)
        logo = try c.decodeIfPresent(URL.self, forKey: .logo)
        originalTitle = try c.decodeIfPresent(String.self, forKey: .originalTitle)
        endYear = try c.decodeIfPresent(Int.self, forKey: .endYear)
        overview = try c.decodeIfPresent(String.self, forKey: .overview)
        runtime = try c.decodeIfPresent(Int.self, forKey: .runtime)
        certification = try c.decodeIfPresent(String.self, forKey: .certification)
        cast = try c.decodeIfPresent([Person].self, forKey: .cast) ?? []
        director = try c.decodeIfPresent(String.self, forKey: .director)
        trailer = try c.decodeIfPresent(URL.self, forKey: .trailer)
        hasTMDB = try c.decodeIfPresent(Bool.self, forKey: .hasTMDB)
        providerCategory = try c.decodeIfPresent(String.self, forKey: .providerCategory)
        rawTitle = try c.decodeIfPresent(String.self, forKey: .rawTitle)
        versions = try c.decodeIfPresent([Version].self, forKey: .versions) ?? []
        isFavorite = try c.decodeIfPresent(Bool.self, forKey: .isFavorite)
        seasons = try c.decodeIfPresent([Season].self, forKey: .seasons)
        currentEpisode = try c.decodeIfPresent(EpisodeRef.self, forKey: .currentEpisode)
        saga = try c.decodeIfPresent(SagaRef.self, forKey: .saga)
        tagline = try c.decodeIfPresent(String.self, forKey: .tagline) ?? ""
        facts = try c.decodeIfPresent(String.self, forKey: .facts)
        ratingLabel = try c.decodeIfPresent(String.self, forKey: .ratingLabel)
        playLabel = try c.decodeIfPresent(String.self, forKey: .playLabel) ?? ""
        related = try c.decodeIfPresent([ContentItem].self, forKey: .related) ?? []
    }

    /// "4K DV" or nil.
    var qualityBadge: String? {
        guard let maxQuality else { return nil }
        if let dynamicRange, dynamicRange != .sdr { return "\(maxQuality.rawValue) \(dynamicRange.shortLabel)" }
        return maxQuality.rawValue
    }
    /// Movies: the sheet says TMDB matched unless told otherwise.
    var isMatched: Bool { hasTMDB ?? true }
    var allEpisodes: [Episode] { seasons?.flatMap(\.episodes) ?? [] }

}

/// A row of `GET /movies` or `GET /series`: one genre, twenty cards, the total for "Voir tout".
nonisolated struct CatalogRow: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let name: String
    let total: Int
    let cards: [ContentItem]

    private enum CodingKeys: String, CodingKey { case id, name, total, movies, series }

    init(id: String, name: String, total: Int, cards: [ContentItem]) {
        self.id = id; self.name = name; self.total = total; self.cards = cards
    }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        total = try c.decodeIfPresent(Int.self, forKey: .total) ?? 0
        cards = try c.decodeIfPresent([ContentItem].self, forKey: .movies) ?? c.decodeIfPresent([ContentItem].self, forKey: .series) ?? []
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id); try c.encode(name, forKey: .name); try c.encode(total, forKey: .total)
        try c.encode(cards, forKey: cards.first?.kind == .series ? .series : .movies)
    }
}

nonisolated struct Page<Item: Codable & Hashable & Sendable>: Codable, Hashable, Sendable {
    let items: [Item]
    let nextCursor: String?
    /// Sent by the lists that count their items (`/movies/sagas`).
    var total: Int? = nil

    enum CodingKeys: String, CodingKey {
        case items, total
        case nextCursor = "next_cursor"
    }
}
