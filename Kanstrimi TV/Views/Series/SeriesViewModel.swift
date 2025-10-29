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

    // MARK: - Methods

    /// Sélectionne une série pour afficher les détails
    /// - Parameter series: La série à afficher
    func selectSeries(_ series: Series) {
        selectedSeries = series
    }

    /// Réinitialise la sélection
    func clearSelection() {
        selectedSeries = nil
    }
}
