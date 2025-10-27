//
//  TMDBResponses.swift
//  Kanstrimi TV
//
//  Created on 2025-10-27.
//  Modèles de réponse API TMDB
//

import Foundation

// MARK: - Movie Credits Response

/// Réponse de l'API TMDB pour les crédits d'un film
struct TMDBCreditsResponse: Codable {
    let id: Int
    let cast: [TMDBCastMember]
}

/// Membre du cast (acteur)
struct TMDBCastMember: Codable {
    let id: Int
    let name: String
    let character: String?
    let profilePath: String?
    let order: Int?

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case character
        case profilePath = "profile_path"
        case order
    }

    /// URL complète de l'image de profil (taille w185)
    var profileImageURL: String? {
        guard let profilePath = profilePath else { return nil }
        return "https://image.tmdb.org/t/p/w185\(profilePath)"
    }
}
