//
//  NetworkService.swift
//  Kanstrimi TV
//
//  Created on 2025-10-31.
//  Service réseau centralisé pour mutualiser la logique HTTP
//

import Foundation

/// Service réseau centralisé utilisé par XtreamService et TMDBService
final class NetworkService {
    /// Instance partagée (singleton)
    static let shared = NetworkService()

    /// Session URL configurée pour tvOS
    private let session: URLSession

    /// Décodeur JSON
    private let decoder: JSONDecoder

    /// Initialisation privée (singleton)
    private init() {
        // Configuration URLSession adaptée à tvOS
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30  // 30s pour les requêtes
        config.timeoutIntervalForResource = 60 // 60s pour le téléchargement complet
        config.requestCachePolicy = .reloadIgnoringLocalCacheData // Toujours fetch les données fraîches
        self.session = URLSession(configuration: config)

        self.decoder = JSONDecoder()
    }

    // MARK: - Generic Request Method

    /// Méthode générique pour effectuer une requête GET et décoder la réponse
    /// - Parameters:
    ///   - url: URL de la requête
    ///   - headers: Headers HTTP optionnels (ex: Authorization)
    /// - Returns: Objet décodé de type T
    /// - Throws: NetworkError si la requête échoue
    func request<T: Decodable>(
        url: URL,
        headers: [String: String] = [:]
    ) async throws -> T {
        // Création de la requête
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        headers.forEach { key, value in
            request.addValue(value, forHTTPHeaderField: key)
        }

        // Exécution de la requête
        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw NetworkError.networkError(error)
        }

        // Vérification du code HTTP
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }

        // Gestion des codes de statut HTTP
        switch httpResponse.statusCode {
        case 200...299:
            break // Succès
        case 401, 403:
            throw NetworkError.invalidCredentials
        case 404:
            throw NetworkError.notFound
        default:
            throw NetworkError.httpError(statusCode: httpResponse.statusCode)
        }

        // Décodage de la réponse
        do {
            let decoded = try decoder.decode(T.self, from: data)
            return decoded
        } catch {
            throw NetworkError.decodingError(error)
        }
    }
}
