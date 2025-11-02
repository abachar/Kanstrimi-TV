//
//  ContentType.swift
//  Kanstrimi TV
//
//  Created on 2025-11-02.
//  Enum pour les types de contenu (Live, Movies, Series)
//

import Foundation

/// Type de contenu disponible dans l'application
enum ContentType: String {
    case live
    case movies
    case series

    /// Label affiché dans l'empty state
    var emptyLabel: String {
        switch self {
        case .live: return "TV en direct"
        case .movies: return "Films"
        case .series: return "Séries"
        }
    }

    /// Icône affichée dans l'empty state
    var emptyIcon: String {
        switch self {
        case .live: return "tv.slash"
        case .movies: return "film.slash"
        case .series: return "tv.slash"
        }
    }

    /// Description affichée dans l'empty state
    var emptyDescription: String {
        switch self {
        case .live: return "Aucune chaîne disponible"
        case .movies: return "Aucun film disponible"
        case .series: return "Aucune série disponible"
        }
    }

    /// Destination de navigation pour la recherche
    var searchDestination: NavigationDestination {
        switch self {
        case .live: return .searchLiveTV
        case .movies: return .searchMovies
        case .series: return .searchSeries
        }
    }
}
