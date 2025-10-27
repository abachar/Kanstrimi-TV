//
//  WatchHistory.swift
//  Kanstrimi TV
//
//  Created on 2025-10-27.
//

import Foundation
import SwiftData

/// Modèle représentant l'historique de visionnage d'un contenu VOD
@Model
final class WatchHistory {
    #Index<WatchHistory>([\.streamId])

    /// Identifiant unique
    var id: String

    /// Identifiant du flux (stream_id)
    var streamId: Int

    /// Type de contenu (movie, series)
    var contentType: String

    /// Position de lecture actuelle (en secondes)
    var lastPosition: TimeInterval

    /// Durée totale du contenu (en secondes)
    var duration: TimeInterval

    /// Date de dernier visionnage
    var lastWatchedDate: Date

    /// Initialisation d'un historique de visionnage
    init(
        streamId: Int,
        contentType: String,
        lastPosition: TimeInterval,
        duration: TimeInterval,
        lastWatchedDate: Date = Date()
    ) {
        self.id = "watch-\(contentType)-\(streamId)"
        self.streamId = streamId
        self.contentType = contentType
        self.lastPosition = lastPosition
        self.duration = duration
        self.lastWatchedDate = lastWatchedDate
    }

    /// Calcule le pourcentage de progression
    var progressPercentage: Double {
        guard duration > 0 else { return 0 }
        return (lastPosition / duration) * 100
    }

    /// Indique si le contenu a été complètement visionné (>95%)
    var isCompleted: Bool {
        progressPercentage >= 95
    }
}
