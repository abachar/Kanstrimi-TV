//
//  LiveChannel.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import Foundation
import SwiftData
import os

/// Modèle représentant une chaîne TV en direct
@Model
final class LiveChannel {
    /// Identifiant unique de la chaîne
    var id: String

    /// Identifiant du flux (stream_id)
    var streamId: Int

    /// Nom de la chaîne
    var name: String
    
    /// Icône/Logo de la chaîne
    var streamIcon: String?

    /// ID de la catégorie
    @Attribute(.indexed) var categoryId: String
    
    /// Informations EPG (Electronic Program Guide)
    var epgChannelId: String?
    
    /// Ajouté à la date
    var added: String?
    
    /// Ordre d'affichage (préservé depuis l'API Xtream)
    var sortOrder: Int
    
    /// URL de lecture de la chaîne
    var streamURL: String
    
    /// Initialisation d'une chaîne TV
    /// - Parameters:
    ///   - streamId: ID du flux
    ///   - name: Nom de la chaîne
    ///   - streamType: Type de flux
    ///   - streamIcon: URL de l'icône
    ///   - categoryId: ID de la catégorie
    init(
        streamId: Int,
        name: String,
        streamURL: String,
        categoryId: String,
        sortOrder: Int,
        streamIcon: String? = nil,
        epgChannelId: String? = nil,
        added: String? = nil
    ) {
        self.id = "live-\(streamId)"
        self.streamId = streamId
        self.name = name
        self.streamIcon = streamIcon
        self.categoryId = categoryId
        self.added = added
        self.epgChannelId = epgChannelId
        self.sortOrder = sortOrder
        self.streamURL = streamURL
    }
}
