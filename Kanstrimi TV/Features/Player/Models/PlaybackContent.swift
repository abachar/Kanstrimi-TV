//
//  PlaybackContent.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 27/10/2025.
//

import Foundation

/// Représente le contenu à lire dans le player universel
enum PlaybackContent: Identifiable {
    case liveChannel(LiveChannel)
    case movie(Movie)
    case episode(Episode)

    var id: String {
        switch self {
        case .liveChannel(let channel):
            return channel.id
        case .movie(let movie):
            return movie.id
        case .episode(let episode):
            return episode.id
        }
    }

    /// URL du stream vidéo
    var streamURL: String {
        switch self {
        case .liveChannel(let channel):
            return channel.streamURL
        case .movie(let movie):
            return movie.streamURL
        case .episode(let episode):
            return episode.streamURL
        }
    }

    /// Titre du contenu (pour overlay futur)
    var title: String {
        switch self {
        case .liveChannel(let channel):
            return channel.name
        case .movie(let movie):
            return movie.name
        case .episode(let episode):
            if let title = episode.title {
                return "S\(episode.seasonNumber)E\(episode.episodeNum) - \(title)"
            } else {
                return "S\(episode.seasonNumber)E\(episode.episodeNum)"
            }
        }
    }

    /// Type de contenu (pour overlay futur)
    var contentType: ContentType {
        switch self {
        case .liveChannel:
            return .live
        case .movie, .episode:
            return .vod
        }
    }

    enum ContentType {
        case live
        case vod
    }
}
