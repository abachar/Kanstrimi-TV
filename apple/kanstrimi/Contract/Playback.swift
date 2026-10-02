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

    enum CodingKeys: String, CodingKey {
        case id, title, season, number, runtime, languages, still
        case maxQuality = "max_quality"
        case dynamicRange = "dynamic_range"
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
    var episode: PlaybackEpisode? = nil

    enum CodingKeys: String, CodingKey {
        case versions, duration, next, episode
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
    let related: [Card]
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
    let card: Card
    let reason: Reason
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

    init(content: PlaybackContent, versions: [Version], resumeAt: TimeInterval? = nil, duration: TimeInterval? = nil, next: NextEpisode? = nil) {
        self.content = content; self.versions = versions; self.resumeAt = resumeAt; self.duration = duration; self.next = next
    }
    init(content: PlaybackContent, playback: Playback) {
        self.init(content: content, versions: playback.versions, resumeAt: playback.resumeAt, duration: playback.duration, next: playback.next)
    }

    /// A suggested title: a movie as itself, a series through the episode `/playback/{series}` resolved.
    init(suggested card: Card, playback: Playback) {
        let content = playback.episode.map {
            PlaybackContent(id: $0.id, kind: .episode, title: $0.title ?? card.title, subtitle: card.title, episode: $0.ref, backdrop: card.backdrop)
        } ?? PlaybackContent(id: card.id, kind: card.kind, title: card.title, subtitle: nil, episode: nil, backdrop: card.backdrop)
        self.init(content: content, playback: playback)
    }

    /// `tmdb:tv:1396:s01e05` → `tmdb:tv:1396`, for the series language preference.
    var seriesID: ContentID? { content.kind == .episode ? content.id.seriesID : nil }
}
