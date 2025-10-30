//
//  MovieNavigationState.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 30/10/2025.
//

import Foundation

/// État de navigation pour la feature Movies
///
/// Gère les écrans de navigation dans la section Films :
/// - Recherche de films
/// - Détails d'un film
/// - Lecteur vidéo
///
/// Note: L'écran principal (liste des catégories) est affiché quand la pile est vide
enum MovieNavigationState: Identifiable, Equatable {
    /// Écran de recherche de films
    case search

    /// Détails d'un film spécifique
    /// - Parameters:
    ///   - streamId: ID du film à afficher
    ///   - returnTo: Destination de retour lors du cancel
    case movieDetail(streamId: Int, returnTo: ReturnDestination)

    /// Lecteur vidéo
    /// - Parameters:
    ///   - content: Contenu à lire
    ///   - returnTo: Destination de retour lors du cancel
    case player(content: PlaybackContent, returnTo: ReturnDestination)

    // MARK: - Identifiable
    var id: String {
        switch self {
        case .search:
            return "search"
        case .movieDetail(let streamId, _):
            return "detail-\(streamId)"
        case .player(let content, _):
            return "player-\(content.id)"
        }
    }

    // MARK: - Return Destination
    /// Destination possible lors du retour en arrière
    enum ReturnDestination: Equatable {
        /// Retour vers la liste des films
        case moviesList

        /// Retour vers l'écran de recherche
        case search
    }
}
