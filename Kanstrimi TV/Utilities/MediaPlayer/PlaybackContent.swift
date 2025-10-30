//
//  PlaybackContent.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 27/10/2025.
//

import Foundation

/// Représente le contenu à lire dans le player universel
enum PlaybackContent: Identifiable, Equatable {
    case liveChannel(LiveChannel)
    case movie(MovieDetail)
    case episode(Episode, seriesName: String? = nil, previousEpisode: Episode? = nil, nextEpisode: Episode? = nil)

    var id: String {
        switch self {
        case .liveChannel(let details):
            return details.id
        case .movie(let details):
            return details.id
        case .episode(let episode, _, _, _):
            return episode.id
        }
    }

    /// URL du stream vidéo
    var streamURL: String {
        switch self {
        case .liveChannel(let details):
            return details.streamURL
        case .movie(let details):
            return details.streamURL
        case .episode(let episode, _, _, _):
            return episode.streamURL
        }
    }

    /// Titre du contenu (pour overlay)
    var title: String {
        switch self {
        case .liveChannel(let details):
            return details.displayTitle
        case .movie(let details):
            return details.displayTitle
        case .episode(let episode, let seriesName, _, _):
            return seriesName ?? episode.displayTitle
        }
    }

    /// Sous-titre du contenu (pour overlay)
    var subtitle: String? {
        switch self {
        case .liveChannel(let details):
            return details.subtitle
        case .movie(let details):
            return details.subtitle
        case .episode(let episode, _, _, _):
            return episode.subtitle
        }
    }

    /// Type de contenu (pour overlay)
    var contentType: ContentType {
        switch self {
        case .liveChannel(let details):
            return details.contentType
        case .movie(let details):
            return details.contentType
        case .episode(let episode, _, _, _):
            return episode.contentType
        }
    }

    /// Navigation entre épisodes (pour séries uniquement)
    var episodeNavigation: EpisodeNavigation? {
        switch self {
        case .episode(_, _, let previous, let next):
            return EpisodeNavigation(previous: previous, next: next)
        default:
            return nil
        }
    }

    enum ContentType {
        case live
        case vod
    }
}

/// Navigation entre épisodes de séries
struct EpisodeNavigation: Equatable {
    let previous: Episode?
    let next: Episode?

    static func == (lhs: EpisodeNavigation, rhs: EpisodeNavigation) -> Bool {
        lhs.previous?.id == rhs.previous?.id && lhs.next?.id == rhs.next?.id
    }
}

// MARK: - Equatable Conformance
extension PlaybackContent {
    static func == (lhs: PlaybackContent, rhs: PlaybackContent) -> Bool {
        lhs.id == rhs.id
    }
}
