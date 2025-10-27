//
//  PlayerSettings.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import Foundation
import SwiftData

/// Modèle représentant les paramètres de lecture (singleton)
@Model
final class PlayerSettings {
    /// Identifiant unique (toujours le même pour le singleton)
    var id: UUID

    /// Taille du buffer en secondes
    var bufferSize: Int

    /// Initialisation des paramètres de lecture
    /// - Parameter bufferSize: Taille du buffer en secondes (défaut: 30)
    init(id: UUID = UUID(), bufferSize: Int = 30) {
        self.id = id
        self.bufferSize = bufferSize
    }
}
