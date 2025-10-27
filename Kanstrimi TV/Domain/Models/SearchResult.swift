//
//  SearchResult.swift
//  Kanstrimi TV
//
//  Created by Claude on 27/10/2025.
//

import Foundation
import SwiftUI

/// Enum wrapper pour unifier les 3 types de contenu dans les résultats de recherche
///
/// Permet d'afficher LiveChannel, Movie et Series dans une seule grille unifiée
enum SearchResult: Identifiable {
    case liveChannel(LiveChannel)
    case movie(Movie)
    case series(Series)

    // MARK: - Identifiable

    var id: String {
        switch self {
        case .liveChannel(let channel):
            return "live-\(channel.id)"
        case .movie(let movie):
            return "movie-\(movie.id)"
        case .series(let series):
            return "series-\(series.id)"
        }
    }

    // MARK: - Computed Properties

    /// Nom du contenu
    var name: String {
        switch self {
        case .liveChannel(let channel):
            return channel.name
        case .movie(let movie):
            return movie.name
        case .series(let series):
            return series.name
        }
    }

    /// URL de l'image (poster, cover ou logo)
    var imageURL: String? {
        switch self {
        case .liveChannel(let channel):
            return channel.streamIcon
        case .movie(let movie):
            return movie.streamIcon
        case .series(let series):
            return series.cover
        }
    }

    /// Type de contenu (Live/Film/Série)
    var contentType: ContentType {
        switch self {
        case .liveChannel:
            return .live
        case .movie:
            return .movie
        case .series:
            return .series
        }
    }

    /// Score de pertinence pour le tri (basé sur la position du match)
    /// - Parameter terms: Termes de recherche
    /// - Returns: Score (plus bas = plus pertinent)
    func relevanceScore(for terms: [String]) -> Int {
        let nameLower = name.lowercased()
        var minPosition = Int.max

        for term in terms {
            if let range = nameLower.range(of: term.lowercased()) {
                let position = nameLower.distance(from: nameLower.startIndex, to: range.lowerBound)
                minPosition = min(minPosition, position)
            }
        }

        return minPosition
    }
}

// MARK: - ContentType

/// Type de contenu pour les badges
enum ContentType {
    case live
    case movie
    case series

    /// Label affiché dans le badge
    var label: String {
        switch self {
        case .live:
            return "Live"
        case .movie:
            return "Film"
        case .series:
            return "Série"
        }
    }

    /// Icône SF Symbol
    var icon: String {
        switch self {
        case .live:
            return "dot.radiowaves.left.and.right"
        case .movie:
            return "film"
        case .series:
            return "tv"
        }
    }

    /// Couleur du badge
    var color: Color {
        switch self {
        case .live:
            return .blue
        case .movie:
            return .red
        case .series:
            return .green
        }
    }
}
