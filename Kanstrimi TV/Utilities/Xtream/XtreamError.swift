//
//  XtreamError.swift
//  Kanstrimi TV
//
//  Created on 2025-10-26.
//  Gestion des erreurs du service Xtream Codes
//

import Foundation

/// Erreurs possibles lors des appels à l'API Xtream Codes
enum XtreamError: Error, LocalizedError {
    /// URL invalide ou mal formée
    case invalidURL

    /// Credentials invalides (401/403)
    case invalidCredentials

    /// Erreur réseau (timeout, connection lost, etc.)
    case networkError(Error)

    /// Erreur de décodage JSON
    case decodingError(Error)

    /// Erreur serveur HTTP (4xx/5xx autre que 401/403)
    case serverError(statusCode: Int)

    /// Réponse vide ou invalide du serveur
    case emptyResponse

    /// Description localisée pour l'affichage dans l'UI
    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "URL du serveur invalide"
        case .invalidCredentials:
            return "Identifiants incorrects"
        case .networkError(let error):
            return "Erreur réseau : \(error.localizedDescription)"
        case .decodingError:
            return "Erreur lors du traitement des données"
        case .serverError(let statusCode):
            return "Erreur serveur (code \(statusCode))"
        case .emptyResponse:
            return "Réponse vide du serveur"
        }
    }
}
