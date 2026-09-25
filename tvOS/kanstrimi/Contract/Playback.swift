import Foundation

nonisolated struct PlaybackContent: Codable, Hashable, Sendable {
    let id: ContentID
    let kind: ContentKind
    let title: String
    /// Series name for an episode, programme for a channel.
    let subtitle: String?
    let episode: EpisodeRef?
    let backdrop: URL?
}

/// Pointer to the next episode, season change included. The app asks its own context.
nonisolated struct NextEpisode: Codable, Hashable, Sendable {
    let id: ContentID
    let seriesTitle: String
    let episode: EpisodeRef
    let runtime: Int?
    let languages: [Language]
    let maxQuality: Quality?
    let dynamicRange: DynamicRange?
    let still: URL?

    enum CodingKeys: String, CodingKey {
        case id, episode, runtime, languages, still
        case seriesTitle = "series_title"
        case maxQuality = "max_quality"
        case dynamicRange = "dynamic_range"
    }
}

/// What the player receives, never less.
nonisolated struct PlaybackContext: Codable, Hashable, Sendable {
    let content: PlaybackContent
    let versions: [Version]
    let resumeAt: TimeInterval?
    let duration: TimeInterval?
    let next: NextEpisode?
    /// Series identity for an episode, to read the series language preference.
    let seriesID: ContentID?

    enum CodingKeys: String, CodingKey {
        case content, versions, duration, next
        case resumeAt = "resume_at"
        case seriesID = "series_id"
    }
}

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
