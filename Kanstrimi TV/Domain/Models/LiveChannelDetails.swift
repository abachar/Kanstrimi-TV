//
//  LiveChannelDetails.swift
//  Kanstrimi TV
//
//  Created on 2025-10-29.
//

import Foundation
import SwiftData

/// Modèle représentant les détails d'une chaîne TV en direct
@Model
final class LiveChannelDetails {
    #Index<LiveChannelDetails>([\.streamId])

    /// Identifiant unique
    var id: String

    /// Identifiant du flux (stream_id) - clé pour lier au LiveChannel
    var streamId: Int

    /// URL de lecture de la chaîne
    var streamURL: String

    /// Informations EPG (Electronic Program Guide)
    var epgChannelId: String?

    /// Ajouté à la date
    var added: String?

    /// Date de dernière mise à jour
    var lastUpdated: Date

    /// Initialisation des détails d'une chaîne
    init(
        streamId: Int,
        streamURL: String,
        epgChannelId: String? = nil,
        added: String? = nil
    ) {
        self.id = "live-detail-\(streamId)"
        self.streamId = streamId
        self.streamURL = streamURL
        self.epgChannelId = epgChannelId
        self.added = added
        self.lastUpdated = Date()
    }
}

// MARK: - Preview Data
#if DEBUG
extension LiveChannelDetails {
    static var previewChannelDetails: [LiveChannelDetails] {
        [
            LiveChannelDetails(
                streamId: 1515148,
                streamURL: "http://example.com/live/1515148",
                epgChannelId: "",
                added: "1753477583"
            ),
            LiveChannelDetails(
                streamId: 22198,
                streamURL: "http://example.com/live/22198",
                epgChannelId: "beinsportsnews.qa",
                added: "1560023298"
            ),
            LiveChannelDetails(
                streamId: 22199,
                streamURL: "http://example.com/live/22199",
                epgChannelId: "beinsportsglobal.qa",
                added: "1560023322"
            )
        ]
    }

    static func previewChannelDetails(for streamId: Int) -> LiveChannelDetails? {
        previewChannelDetails.first { $0.streamId == streamId }
    }
}
#endif
