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
/// Tri par pertinence : match au début du nom = prioritaire
struct SearchHelper {

    // MARK: - Unified Search

    /// Filtre et trie tous les types de contenu par pertinence
    /// - Parameters:
    ///   - liveChannels: Chaînes TV en direct
    ///   - movies: Films VOD
    ///   - series: Séries TV
    ///   - terms: Termes de recherche (splitté sur espaces)
    /// - Returns: Résultats unifiés triés par pertinence (match au début = prioritaire)
    static func filterAll(
        liveChannels: [LiveChannel],
        movies: [Movie],
        series: [Series],
        terms: [String]
    ) -> [SearchResult] {
        var results: [SearchResult] = []

        // Filtrer les chaînes
        let filteredChannels = filterLiveChannels(liveChannels, terms: terms)
        results.append(contentsOf: filteredChannels.map { .liveChannel($0) })

        // Filtrer les films
        let filteredMovies = filterMovies(movies, terms: terms)
        results.append(contentsOf: filteredMovies.map { .movie($0) })

        // Filtrer les séries
        let filteredSeries = filterSeries(series, terms: terms)
        results.append(contentsOf: filteredSeries.map { .series($0) })

        // Trier par pertinence (score le plus bas = match au début du nom)
        return results.sorted { result1, result2 in
            let score1 = result1.relevanceScore(for: terms)
            let score2 = result2.relevanceScore(for: terms)
            return score1 < score2
        }
    }

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
