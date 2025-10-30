//
//  SeriesNavigationState.swift
//  Kanstrimi TV
//
//  Created by Claude on 30/10/2025.
//

import Foundation

/// État de navigation pour la feature Series
///
/// Gère les écrans de navigation dans la section Séries :
/// - Recherche de séries
/// - Détails d'une série
/// - Lecteur vidéo
///
/// Note: L'écran principal (liste des catégories) est affiché quand la pile est vide
enum SeriesNavigationState: Identifiable, Equatable {
    /// Écran de recherche de séries
    case search

    /// Détails d'une série spécifique
    /// - Parameters:
    ///   - seriesId: ID de la série à afficher
    ///   - returnTo: Destination de retour lors du cancel
    case seriesDetail(seriesId: Int, returnTo: ReturnDestination)

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
        case .seriesDetail(let seriesId, _):
            return "detail-\(seriesId)"
        case .player(let content, _):
            return "player-\(content.id)"
        }
    }

    // MARK: - Return Destination
    /// Destination possible lors du retour en arrière
    enum ReturnDestination: Equatable {
        /// Retour vers la liste des séries
        case seriesList

        /// Retour vers l'écran de recherche
        case search
    }
}
