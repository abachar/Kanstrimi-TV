//
//  LiveTVNavigationState.swift
//  Kanstrimi TV
//
//  Created by Claude on 30/10/2025.
//

import Foundation

/// État de navigation pour la feature LiveTV
///
/// Gère les écrans de navigation dans la section TV en direct :
/// - Recherche de chaînes
/// - Lecteur vidéo
///
/// Note: L'écran principal (liste des catégories) est affiché quand la pile est vide
enum LiveTVNavigationState: Identifiable, Equatable {
    /// Écran de recherche de chaînes
    case search

    /// Lecteur vidéo pour une chaîne en direct
    /// - Parameter content: Contenu à lire
    case player(content: PlaybackContent)

    // MARK: - Identifiable
    var id: String {
        switch self {
        case .search:
            return "search"
        case .player(let content):
            return "player-\(content.id)"
        }
    }
}
