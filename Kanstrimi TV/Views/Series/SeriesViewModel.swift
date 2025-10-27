//
//  SeriesViewModel.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 27/10/2025.
//

import Foundation
import Observation

/// ViewModel observable pour gérer l'état de sélection dans SeriesView
@Observable
class SeriesViewModel {
    // MARK: - Properties

    /// Série actuellement sélectionnée (déclenchera l'ouverture de SeriesDetailView)
    var selectedSeries: Series?

    /// Contenu en cours de lecture (pour lancer un épisode)
    var playingContent: PlaybackContent?

    // MARK: - Methods

    /// Sélectionne une série pour afficher les détails
    /// - Parameter series: La série à afficher
    func selectSeries(_ series: Series) {
        selectedSeries = series
    }

    /// Démarre la lecture d'un contenu
    /// - Parameter content: Le contenu à lire
    func playContent(_ content: PlaybackContent) {
        selectedSeries = nil  // Fermer la vue de détail avant de lancer le player
        playingContent = content
    }

    /// Réinitialise la sélection
    func clearSelection() {
        selectedSeries = nil
        playingContent = nil
    }
}
