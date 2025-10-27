//
//  SearchHelper.swift
//  Kanstrimi TV
//
//  Created by Claude on 26/10/2025.
//

import Foundation

/// Helper pour la recherche multi-mots dans le contenu
///
/// Algorithme: Split sur espaces + recherche indépendante de l'ordre
/// Tous les termes doivent être présents (AND), mais l'ordre n'a pas d'importance
struct SearchHelper {

    // MARK: - Live Channels

    /// Filtre les chaînes TV en direct par nom
    /// - Parameters:
    ///   - channels: Liste des chaînes à filtrer
    ///   - terms: Termes de recherche (splitté sur espaces)
    /// - Returns: Chaînes correspondant à tous les termes
    static func filterLiveChannels(_ channels: [LiveChannel], terms: [String]) -> [LiveChannel] {
        channels.filter { channel in
            matchesAllTerms(in: [channel.name], terms: terms)
        }
    }

    // MARK: - Movies

    /// Filtre les films par nom
    /// - Parameters:
    ///   - movies: Liste des films à filtrer
    ///   - terms: Termes de recherche (splitté sur espaces)
    /// - Returns: Films correspondant à tous les termes
    ///
    /// FUTURE: Ajouter cast et plot quand disponibles
    /// ```swift
    /// let searchableFields = [
    ///     movie.name,
    ///     movie.cast ?? "",
    ///     movie.plot ?? ""
    /// ]
    /// return matchesAllTerms(in: searchableFields, terms: terms)
    /// ```
    static func filterMovies(_ movies: [Movie], terms: [String]) -> [Movie] {
        movies.filter { movie in
            // Actuellement : name uniquement
            // TODO: Ajouter cast et plot quand la recherche sera étendue
            matchesAllTerms(in: [movie.name], terms: terms)
        }
    }

    // MARK: - Series

    /// Filtre les séries par name, plot, cast, genre
    /// - Parameters:
    ///   - series: Liste des séries à filtrer
    ///   - terms: Termes de recherche (splitté sur espaces)
    /// - Returns: Séries correspondant à tous les termes
    static func filterSeries(_ series: [Series], terms: [String]) -> [Series] {
        series.filter { serie in
            let searchableFields = [
                serie.name,
                serie.plot ?? "",
                serie.cast ?? "",
                serie.genre ?? ""
            ]
            return matchesAllTerms(in: searchableFields, terms: terms)
        }
    }

    // MARK: - Private Helper

    /// Vérifie si tous les termes sont présents dans au moins un champ
    /// - Parameters:
    ///   - fields: Liste des champs de texte à rechercher
    ///   - terms: Termes de recherche
    /// - Returns: true si tous les termes sont présents (ordre indépendant)
    private static func matchesAllTerms(in fields: [String], terms: [String]) -> Bool {
        // Combiner tous les champs en un seul texte
        let combinedText = fields.joined(separator: " ").lowercased()

        // Tous les termes doivent être présents (AND)
        // L'ordre n'a pas d'importance
        return terms.allSatisfy { term in
            combinedText.contains(term.lowercased())
        }
    }
}
