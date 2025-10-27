//
//  TMDBError.swift
//  Kanstrimi TV
//
//  Created on 2025-10-27.
//  Erreurs liées à l'API TMDB
//

import Foundation

/// Erreurs possibles lors des appels à l'API TMDB
enum TMDBError: Error, LocalizedError {
    case invalidAPIKey
    case networkError(Error)
    case decodingError(Error)
    case movieNotFound
    case serverError(statusCode: Int)
    case invalidURL

    var errorDescription: String? {
        switch self {
        case .invalidAPIKey:
            return "Clé API TMDB invalide"
        case .networkError(let error):
            return "Erreur réseau TMDB: \(error.localizedDescription)"
        case .decodingError(let error):
            return "Erreur de décodage TMDB: \(error.localizedDescription)"
        case .movieNotFound:
            return "Film non trouvé sur TMDB"
        case .serverError(let statusCode):
            return "Erreur serveur TMDB (code \(statusCode))"
        case .invalidURL:
            return "URL TMDB invalide"
        }
    }
}
