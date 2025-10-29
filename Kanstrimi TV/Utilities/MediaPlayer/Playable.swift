//
//  Playable.swift
//  Kanstrimi TV
//
//  Created on 2025-10-29.
//

import Foundation

/// Protocole définissant un contenu lisible par MediaPlayerView
protocol Playable {
    /// URL du stream vidéo
    var streamURL: String { get }

    /// Titre principal du contenu pour l'affichage
    var displayTitle: String { get }

    /// Sous-titre optionnel (ex: "S01E05 · The Heist")
    var subtitle: String? { get }

    /// Type de contenu (live ou vod)
    var contentType: PlaybackContent.ContentType { get }

    /// Navigation entre épisodes (pour séries uniquement, nil par défaut)
    var episodeNavigation: EpisodeNavigation? { get }
}

// Extension par défaut pour episodeNavigation
extension Playable {
    var episodeNavigation: EpisodeNavigation? {
        nil
    }
}
