//
//  LiveTVViewModel.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 27/10/2025.
//

import Foundation
import Observation

/// ViewModel observable pour gérer l'état de sélection dans LiveTVView
@Observable
class LiveTVViewModel {
    // MARK: - Properties

    /// Chaîne actuellement sélectionnée (déclenchera l'ouverture du player)
    var selectedChannel: LiveChannel?

    // MARK: - Methods

    /// Sélectionne une chaîne pour lecture
    /// - Parameter channel: La chaîne à lire
    func selectChannel(_ channel: LiveChannel) {
        selectedChannel = channel
    }

    /// Réinitialise la sélection
    func clearSelection() {
        selectedChannel = nil
    }
}
