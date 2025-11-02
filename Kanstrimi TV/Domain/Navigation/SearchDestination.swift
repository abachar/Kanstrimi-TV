//
//  NavigationDestination.swift
//  Kanstrimi TV
//
//  Created by Claude on 02/11/2025.
//

import Foundation

/// Destination de navigation pour NavigationStack
///
/// Permet de naviguer vers tous les écrans de l'app :
/// ```swift
/// // Navigation vers la recherche
/// navigationPath.wrappedValue.append(.searchMovies)
///
/// // Navigation vers un détail
/// navigationPath.wrappedValue.append(.movieDetail(streamId: 123))
/// ```
enum NavigationDestination: Hashable {
    // MARK: - Search Destinations

    /// Recherche de films
    case searchMovies

    /// Recherche de séries
    case searchSeries

    /// Recherche de chaînes Live TV
    case searchLiveTV

    // MARK: - Detail Destinations

    /// Détails d'un film
    case movieDetail(streamId: Int)

    /// Détails d'une série
    case seriesDetail(seriesId: Int)
}
