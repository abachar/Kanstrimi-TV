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

    // MARK: - Methods

    /// Sélectionne un film pour afficher les détails
    /// - Parameter movie: Le film à afficher
    func selectMovie(_ movie: Movie) {
        selectedMovie = movie
    }

    /// Réinitialise toutes les sélections
    func clearSelections() {
        selectedMovie = nil
    }
}
