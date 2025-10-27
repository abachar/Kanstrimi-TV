//
//  MoviesViewModel.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 27/10/2025.
//

import Foundation
import Observation

/// ViewModel observable pour gérer l'état de sélection dans MoviesView
@Observable
class MoviesViewModel {
    // MARK: - Properties

    /// Film actuellement sélectionné (déclenchera l'ouverture de MovieDetailView)
    var selectedMovie: Movie?

    /// Contenu en cours de lecture
    var playingContent: PlaybackContent?

    // MARK: - Methods

    /// Sélectionne un film pour afficher les détails
    /// - Parameter movie: Le film à afficher
    func selectMovie(_ movie: Movie) {
        selectedMovie = movie
    }

    /// Démarre la lecture d'un contenu
    /// - Parameter content: Le contenu à lire
    func playContent(_ content: PlaybackContent) {
        selectedMovie = nil  // Fermer la vue de détail avant de lancer le player
        playingContent = content
    }

    /// Réinitialise toutes les sélections
    func clearSelections() {
        selectedMovie = nil
        playingContent = nil
    }
}
