import Foundation

/// Pointer to the next episode, season change included. The app asks its own playback.
nonisolated struct NextEpisode: Codable, Hashable, Sendable {
    let id: ContentID
    let title: String?
    let season: Int
    let number: Int
    let runtime: Int?
    let languages: [Language]
    let maxQuality: Quality?
    let dynamicRange: DynamicRange?
    let still: URL?
    /// What « À suivre » draws: the still, « Vincenzo · S1 · É3 · 1 h 20 », the badges, the overview.
    let item: ContentItem
    /// « ÉPISODE SUIVANT »: the player adds the countdown.
    let heading: String

    enum CodingKeys: String, CodingKey {
        case id, title, season, number, runtime, languages, still, item, heading
        case maxQuality = "max_quality"
        case dynamicRange = "dynamic_range"
    }

    init(id: ContentID, title: String?, season: Int, number: Int, runtime: Int?, languages: [Language], maxQuality: Quality?,
         dynamicRange: DynamicRange?, still: URL?, item: ContentItem, heading: String) {
        self.id = id; self.title = title; self.season = season; self.number = number; self.runtime = runtime; self.languages = languages
        self.maxQuality = maxQuality; self.dynamicRange = dynamicRange; self.still = still; self.item = item; self.heading = heading
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(ContentID.self, forKey: .id)
        title = try c.decodeIfPresent(String.self, forKey: .title)
        season = try c.decode(Int.self, forKey: .season)
        number = try c.decode(Int.self, forKey: .number)
        runtime = try c.decodeIfPresent(Int.self, forKey: .runtime)
        languages = try c.decodeIfPresent([Language].self, forKey: .languages) ?? []
        maxQuality = try c.decodeIfPresent(Quality.self, forKey: .maxQuality)
        dynamicRange = try c.decodeIfPresent(DynamicRange.self, forKey: .dynamicRange)
        still = try c.decodeIfPresent(URL.self, forKey: .still)
        item = try c.decodeIfPresent(ContentItem.self, forKey: .item) ?? ContentItem(id: id, kind: .episode, title: title ?? "", picture: still)
        heading = try c.decodeIfPresent(String.self, forKey: .heading) ?? ""
    }
    var ref: EpisodeRef { EpisodeRef(season: season, number: number, title: title) }
}

/// `GET /playback/{id}`: the same shape for a movie, an episode or a channel. Asked for a series, the
/// server plays the episode it resumes on and names it in `episode`.
nonisolated struct Playback: Codable, Hashable, Sendable {
    let versions: [Version]
    let resumeAt: TimeInterval?
    let duration: TimeInterval?
    let next: NextEpisode?
    /// The player's « Distribution » panel: the movie's cast, or the series'; empty for a channel.
    var cast: [Person] = []
    var episode: PlaybackEpisode? = nil

    enum CodingKeys: String, CodingKey {
        case versions, duration, next, cast, episode
        case resumeAt = "resume_at"
    }
}

/// The episode a series id resolved to.
nonisolated struct PlaybackEpisode: Codable, Hashable, Sendable {
    let id: ContentID
    let season: Int
    let number: Int
    let title: String?
    var ref: EpisodeRef { EpisodeRef(season: season, number: number, title: title) }
}

/// `GET /playback/{id}/suggestions`, asked once playback has started. `related`: the player's « Si vous
/// avez aimé… » panel, five at most, a series playing through its own id. `next`: what follows a movie,
/// or the last known episode of a series, nothing seen or in progress.
nonisolated struct Suggestions: Codable, Hashable, Sendable {
    let related: [ContentItem]
    let next: Suggestion?
}

nonisolated struct Suggestion: Codable, Hashable, Sendable {
    enum Reason: String, Codable, Sendable {
        case saga, recommended
        /// A reason this version does not know: shown as a plain recommendation.
        case other
        init(from decoder: Decoder) throws {
            self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .other
        }
    }
    /// What « À suivre » draws: « 2003 · Action · 2 h 18 », the badges, the overview.
    let item: ContentItem
    let reason: Reason
    /// « À SUIVRE · SUITE DE LA SAGA »: the player adds the countdown.
    let heading: String
}

/// `PUT /playback/{id}/progress` body.
nonisolated struct ProgressReport: Codable, Hashable, Sendable {
    let contentID: ContentID
    let position: TimeInterval
    let duration: TimeInterval
    let sentAt: Date

    enum CodingKeys: String, CodingKey {
        case position, duration
        case contentID = "content_id"
        case sentAt = "sent_at"
    }
}

/// What the app hands the player: who it is, plus the playback the server gave.
nonisolated struct PlaybackContent: Hashable, Sendable {
    let id: ContentID
    let kind: ContentKind
    let title: String
    /// Series name for an episode, programme for a channel.
    let subtitle: String?
    let episode: EpisodeRef?
    let backdrop: URL?
}

nonisolated struct PlaybackContext: Hashable, Sendable {
    let content: PlaybackContent
    let versions: [Version]
    let resumeAt: TimeInterval?
    let duration: TimeInterval?
    let next: NextEpisode?
    let cast: [Person]

    init(content: PlaybackContent, versions: [Version], resumeAt: TimeInterval? = nil, duration: TimeInterval? = nil, next: NextEpisode? = nil,
         cast: [Person] = []) {
        self.content = content; self.versions = versions; self.resumeAt = resumeAt; self.duration = duration; self.next = next; self.cast = cast
    }
    init(content: PlaybackContent, playback: Playback) {
        self.init(content: content, versions: playback.versions, resumeAt: playback.resumeAt, duration: playback.duration, next: playback.next,
                  cast: playback.cast)
    }

    /// The same title from `position` (nil: from the start), everything else kept.
    func resuming(at position: TimeInterval?) -> PlaybackContext {
        PlaybackContext(content: content, versions: versions, resumeAt: position, duration: duration, next: next, cast: cast)
    }

    /// A list item: a movie as itself, a series through the episode `/playback/{series}` resolved.
    init(item: ContentItem, playback: Playback) {
        let content = playback.episode.map {
            PlaybackContent(id: $0.id, kind: .episode, title: $0.title ?? item.title, subtitle: item.title, episode: $0.ref, backdrop: item.picture)
        } ?? PlaybackContent(id: item.id, kind: item.kind.content ?? .movie, title: item.title, subtitle: nil, episode: nil, backdrop: item.picture)
        self.init(content: content, playback: playback)
    }

    /// `tmdb:tv:1396:s01e05` → `tmdb:tv:1396`, for the series language preference.
    var seriesID: ContentID? { content.kind == .episode ? content.id.seriesID : nil }
}
