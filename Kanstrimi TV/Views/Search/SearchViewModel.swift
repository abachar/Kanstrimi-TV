//
//  SearchViewModel.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 27/10/2025.
//

import Foundation
import Observation
import SwiftData

/// ViewModel observable pour gérer l'état de recherche et de sélection
///
/// Responsabilités :
/// - Gestion du texte de recherche
/// - Gestion des sélections (channel, movie, series)
/// - Filtrage et tri des résultats via SearchHelper
@Observable
class SearchViewModel {
    // MARK: - Properties

    /// Texte de recherche saisi par l'utilisateur
    var searchText = ""

    /// Résultat actuellement sélectionné (pour navigation)
    var selectedResult: SearchResult?

    /// Contenu en cours de lecture (pour les films via MovieDetailView)
    var playingContent: PlaybackContent?

    // MARK: - Computed Properties

    /// Termes de recherche (splitté sur espaces)
    var searchTerms: [String] {
        searchText.split(separator: " ").map(String.init)
    }

    /// La recherche est active si >= 3 caractères
    var isSearchActive: Bool {
        searchText.count >= 3
    }

    // MARK: - Methods

    /// Filtre et trie tous les résultats par pertinence
    /// - Parameters:
    ///   - liveChannels: Chaînes TV en direct
    ///   - movies: Films VOD
    ///   - series: Séries TV
    /// - Returns: Résultats unifiés triés par pertinence (max 30)
    func filterAllResults(
        liveChannels: [LiveChannel],
        movies: [Movie],
        series: [Series]
    ) -> [SearchResult] {
        guard isSearchActive else { return [] }

        let results = SearchHelper.filterAll(
            liveChannels: liveChannels,
            movies: movies,
            series: series,
            terms: searchTerms
        )

        return Array(results.prefix(30)) // Limite à 30 résultats
    }

    /// Sélectionne un résultat pour navigation
    /// - Parameter result: Le résultat à sélectionner
    func selectResult(_ result: SearchResult) {
        selectedResult = result
    }

    /// Démarre la lecture d'un contenu
    /// - Parameter content: Le contenu à lire
    func playContent(_ content: PlaybackContent) {
        playingContent = content
    }

    /// Réinitialise toutes les sélections
    func clearSelections() {
        selectedResult = nil
        playingContent = nil
    }
}
