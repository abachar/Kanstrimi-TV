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
    case episode(Episode, seriesName: String? = nil, previousEpisode: Episode? = nil, nextEpisode: Episode? = nil)

    var id: String {
        switch self {
        case .liveChannel(let channel):
            return channel.id
        case .movie(let movie):
            return movie.id
        case .episode(let episode, _, _, _):
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
        case .episode(let episode, _, _, _):
            return episode.streamURL
        }
    }

    /// Titre du contenu (pour overlay)
    var title: String {
        switch self {
        case .liveChannel(let channel):
            return channel.name
        case .movie(let movie):
            return movie.name
        case .episode(let episode, let seriesName, _, _):
            if let seriesName = seriesName {
                return seriesName
            } else {
                return "Épisode \(episode.episodeNum)"
            }
        }
    }

    /// Sous-titre du contenu (pour overlay)
    var subtitle: String? {
        switch self {
        case .liveChannel:
            return nil
        case .movie(let movie):
            // Ex: "2023 · 2h 30min · ★ 8.5"
            var parts: [String] = []

            // TODO: Ajouter l'année depuis MovieDetail si disponible
            // TODO: Ajouter la durée depuis MovieDetail si disponible

            if let rating = movie.rating, rating > 0 {
                parts.append("★ \(String(format: "%.1f", rating))")
            }

            return parts.isEmpty ? nil : parts.joined(separator: " · ")

        case .episode(let episode, _, _, _):
            // Ex: "S01E05 · The Heist"
            var subtitle = "S\(String(format: "%02d", episode.seasonNumber))E\(String(format: "%02d", episode.episodeNum))"
            if let title = episode.title, !title.isEmpty {
                subtitle += " · \(title)"
            }
            return subtitle
        }
    }

    /// Type de contenu (pour overlay)
    var contentType: ContentType {
        switch self {
        case .liveChannel:
            return .live
        case .movie, .episode:
            return .vod
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
struct EpisodeNavigation {
    let previous: Episode?
    let next: Episode?
}
