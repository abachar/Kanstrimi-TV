//
//  SyncStep.swift
//  Kanstrimi TV
//
//  Created on 2025-10-26.
//  Modèle représentant les étapes de synchronisation d'un compte
//

import Foundation

/// Énumération des étapes de synchronisation d'un compte Xtream
enum SyncStep: Int, CaseIterable {
    case liveChannels = 0
    case movies = 1
    case series = 2
    case finalization = 3
    case completed = 4

    /// Message descriptif affiché à l'utilisateur pour chaque étape
    var message: String {
        switch self {
        case .liveChannels:
            return "Synchronisation des chaînes live..."
        case .movies:
            return "Synchronisation des films..."
        case .series:
            return "Synchronisation des séries..."
        case .finalization:
            return "Finalisation..."
        case .completed:
            return "Synchronisation terminée avec succès"
        }
    }

    /// Progression normalisée entre 0.0 et 1.0
    var progress: Double {
        return Double(rawValue) / Double(SyncStep.allCases.count - 1)
    }
}
