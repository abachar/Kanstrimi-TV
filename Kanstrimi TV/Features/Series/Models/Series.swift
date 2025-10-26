//
//  Series.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import Foundation
import SwiftData

/// Modèle représentant une série TV
@Model
#Index<Series>([\.categoryId])
final class Series {
    /// Identifiant unique de la série
    var id: String

    /// Identifiant de la série (series_id)
    var seriesId: Int

    /// Nom de la série
    var name: String

    /// ID de la catégorie
    var categoryId: String?

    /// URL du poster
    var cover: String?
    
    /// Synopsis/Description
    var plot: String?

    /// Réalisateur
    var director: String?

    /// Acteurs
    var cast: String?
    
    /// Genre
    var genre: String?

    /// Date de sortie
    var releaseDate: String?
    
    /// Date de la dernière diffusion
    var lastModified: String?
    
    /// Note de la série
    var rating: String?

    /// Note sur 5 étoiles
    var rating5based: Double?
    
    var backdropPaths: [String]?
    
    /// URL de la bande-annonce YouTube
    var youtubeTrailer: String?

    /// Ordre d'affichage (préservé depuis l'API Xtream)
    var sortOrder: Int
    
    /// Nombre total d'épisodes
    var episodeRunTime: String?

    init(
        seriesId: Int,
        name: String,
        sortOrder: Int,
        categoryId: String? = nil,
        cover: String? = nil,
        backdropPaths: [String]?,
        rating: String? = nil,
        rating5based: Double? = nil,
        plot: String? = nil,
        director: String? = nil,
        cast: String? = nil,
        genre: String? = nil,
        releaseDate: String? = nil,
        lastModified: String? = nil,
        youtubeTrailer: String? = nil,
        episodeRunTime: String? = nil,

    ) {
        self.id = "series-\(seriesId)"
        self.seriesId = seriesId
        self.name = name
        self.categoryId = categoryId
        self.cover = cover
        self.plot = plot
        self.director = director
        self.cast = cast
        self.genre = genre
        self.releaseDate = releaseDate
        self.lastModified = lastModified
        self.rating = rating
        self.rating5based = rating5based
        self.backdropPaths = backdropPaths
        self.youtubeTrailer = youtubeTrailer
        self.episodeRunTime = episodeRunTime
        self.sortOrder = sortOrder
    }
}

