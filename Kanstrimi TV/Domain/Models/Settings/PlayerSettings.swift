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

    /// Taille du buffer pour Live TV en secondes
    var liveBufferSize: Int

    /// Taille du buffer pour VOD/Séries en secondes
    var vodBufferSize: Int

    /// Options disponibles pour le buffer Live TV (en secondes)
    static let liveBufferOptions = [1, 3, 5, 10]

    /// Options disponibles pour le buffer VOD/Séries (en secondes)
    static let vodBufferOptions = [5, 10, 20, 30]

    /// Initialisation des paramètres de lecture
    /// - Parameters:
    ///   - liveBufferSize: Taille du buffer Live TV en secondes (défaut: 3)
    ///   - vodBufferSize: Taille du buffer VOD/Séries en secondes (défaut: 10)
    init(id: UUID = UUID(), liveBufferSize: Int = 3, vodBufferSize: Int = 10) {
        self.id = id
        self.liveBufferSize = liveBufferSize
        self.vodBufferSize = vodBufferSize
    }
}
