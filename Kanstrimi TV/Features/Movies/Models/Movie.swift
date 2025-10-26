//
//  Movie.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import Foundation
import SwiftData
import os

/// Modèle représentant un film VOD
@Model
final class Movie {
    /// Identifiant unique du film
    var id: String

    /// Identifiant du flux (stream_id)
    var streamId: Int

    /// Nom du film
    var name: String

    /// Extension du conteneur (mp4, mkv, etc.)
    var containerExtension: String?

    /// ID de la catégorie
    var categoryId: String?

    /// URL du poster
    var streamIcon: String?

    /// Note du film
    var rating: String?

    /// Note sur 5 étoiles
    var rating5based: Double?

    /// Ajouté à la date
    var added: String?
    
    /// Ordre d'affichage (préservé depuis l'API Xtream)
    var sortOrder: Int
    
    /// URL de lecture de la chaîne
    var streamURL: String

    /// Initialisation d'un film
    init(
        streamId: Int,
        name: String,
        streamURL: String,
        sortOrder: Int,
        containerExtension: String? = nil,
        categoryId: String? = nil,
        streamIcon: String? = nil,
        rating: String? = nil,
        rating5based: Double? = nil,
        added: String? = nil
    ) {
        self.id = "movie-\(streamId)"
        self.streamId = streamId
        self.name = name
        self.containerExtension = containerExtension
        self.categoryId = categoryId
        self.streamIcon = streamIcon
        self.rating = rating
        self.rating5based = rating5based
        self.added = added
        self.sortOrder = sortOrder
        self.streamURL = streamURL
    }
}
