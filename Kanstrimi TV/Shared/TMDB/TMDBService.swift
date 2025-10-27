//
//  TMDBService.swift
//  Kanstrimi TV
//
//  Created on 2025-10-27.
//  Service singleton pour les appels API TMDB
//

import Foundation

/// Service singleton gérant toutes les requêtes vers l'API TMDB
final class TMDBService {
    /// Instance partagée (singleton)
    static let shared = TMDBService()

    /// Clé API TMDB (Bearer token) - chargée depuis Info.plist
    private let apiKey: String

    /// Base URL de l'API TMDB
    private let baseURL = "https://api.themoviedb.org/3"

    /// Session URL configurée
    private let session: URLSession

    /// Décodeur JSON
    private let decoder: JSONDecoder

    /// Initialisation privée (singleton)
    private init() {
        // Chargement de l'API key depuis Info.plist
        guard let apiKey = Bundle.main.infoDictionary?["TMDB_API_KEY"] as? String,
              !apiKey.isEmpty,
              !apiKey.contains("YOUR_") else {
            fatalError("TMDB_API_KEY manquant dans Info.plist. Copiez Config.xcconfig.template vers Config.xcconfig et ajoutez votre clé API.")
        }
        self.apiKey = apiKey

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60
        self.session = URLSession(configuration: config)
        self.decoder = JSONDecoder()
    }

    // MARK: - Movie Credits

    /// Récupère les crédits (cast) d'un film via TMDB
    /// - Parameter tmdbId: ID TMDB du film
    /// - Returns: Réponse contenant le cast
    /// - Throws: TMDBError si la requête échoue
    func getMovieCredits(tmdbId: Int) async throws -> TMDBCreditsResponse {
        // Construction de l'URL
        guard let url = URL(string: "\(baseURL)/movie/\(tmdbId)/credits") else {
            throw TMDBError.invalidURL
        }

        // Création de la requête avec authentification Bearer
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.addValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.addValue("application/json", forHTTPHeaderField: "Accept")

        // Exécution de la requête
        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw TMDBError.networkError(error)
        }

        // Vérification du code HTTP
        guard let httpResponse = response as? HTTPURLResponse else {
            throw TMDBError.serverError(statusCode: 0)
        }

        switch httpResponse.statusCode {
        case 200...299:
            break // Succès
        case 401:
            throw TMDBError.invalidAPIKey
        case 404:
            throw TMDBError.movieNotFound
        default:
            throw TMDBError.serverError(statusCode: httpResponse.statusCode)
        }

        // Décodage de la réponse
        do {
            let decoded = try decoder.decode(TMDBCreditsResponse.self, from: data)
            return decoded
        } catch {
            throw TMDBError.decodingError(error)
        }
    }
}
