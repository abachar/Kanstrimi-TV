//
//  NetworkError.swift
//  Kanstrimi TV
//
//  Created on 2025-10-31.
//  Erreurs réseau unifiées pour XtreamService et TMDBService
//

import Foundation

/// Erreurs réseau unifiées utilisées par tous les services API
enum NetworkError: LocalizedError {
    case invalidURL
    case invalidResponse
    case httpError(statusCode: Int)
    case decodingError(Error)
    case networkError(Error)
    case invalidCredentials
    case emptyResponse
    case invalidAPIKey
    case notFound

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "URL invalide"
        case .invalidResponse:
            return "Réponse invalide du serveur"
        case .httpError(let statusCode):
            return "Erreur HTTP \(statusCode)"
        case .decodingError(let error):
            return "Erreur de décodage des données: \(error.localizedDescription)"
        case .networkError(let error):
            return "Erreur réseau: \(error.localizedDescription)"
        case .invalidCredentials:
            return "Identifiants invalides"
        case .emptyResponse:
            return "Réponse vide du serveur"
        case .invalidAPIKey:
            return "Clé API invalide"
        case .notFound:
            return "Ressource non trouvée"
        }
    }
}
