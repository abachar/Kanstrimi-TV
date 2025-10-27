//
//  SearchViewModel.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 27/10/2025.
//

import Foundation
import Observation

/// ViewModel observable pour gérer l'état de sélection dans SearchView
@Observable
class SearchViewModel {
    // MARK: - Properties

    /// Chaîne actuellement sélectionnée (pour TV en direct)
    var selectedChannel: LiveChannel?

    /// Film actuellement sélectionné
    var selectedMovie: Movie?

    /// Série actuellement sélectionnée
    var selectedSeries: Series?

    /// Contenu en cours de lecture (pour les films)
    var playingContent: PlaybackContent?

    // MARK: - Methods

    /// Sélectionne une chaîne pour lecture
    /// - Parameter channel: La chaîne à lire
    func selectChannel(_ channel: LiveChannel) {
        selectedChannel = channel
    }

    /// Sélectionne un film pour afficher les détails
    /// - Parameter movie: Le film à afficher
    func selectMovie(_ movie: Movie) {
        selectedMovie = movie
    }

    /// Sélectionne une série pour afficher les détails
    /// - Parameter series: La série à afficher
    func selectSeries(_ series: Series) {
        selectedSeries = series
    }

    /// Réinitialise toutes les sélections
    func clearSelections() {
        selectedChannel = nil
        selectedMovie = nil
        selectedSeries = nil
        playingContent = nil
    }
}
