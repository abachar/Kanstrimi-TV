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

    /// NetworkService pour les requêtes
    private let networkService = NetworkService.shared

    /// Initialisation privée (singleton)
    private init() {
        // Chargement de l'API key depuis Info.plist
        guard let apiKey = Bundle.main.infoDictionary?["TMDB_API_KEY"] as? String,
              !apiKey.isEmpty,
              !apiKey.contains("YOUR_") else {
            fatalError("TMDB_API_KEY manquant dans Info.plist. Copiez Config.xcconfig.template vers Config.xcconfig et ajoutez votre clé API.")
        }
        self.apiKey = apiKey
    }

    // MARK: - Movie Credits

    /// Récupère les crédits (cast) d'un film via TMDB
    /// - Parameter tmdbId: ID TMDB du film
    /// - Returns: Réponse contenant le cast
    /// - Throws: TMDBError si la requête échoue
    func getMovieCredits(tmdbId: Int) async throws -> TMDBCreditsResponse {
        return try await fetchCredits(endpoint: "/movie/\(tmdbId)/credits")
    }

    // MARK: - Series Credits

    /// Récupère les crédits (cast) d'une série via TMDB
    /// - Parameter tmdbId: ID TMDB de la série
    /// - Returns: Réponse contenant le cast
    /// - Throws: TMDBError si la requête échoue
    func getSeriesCredits(tmdbId: Int) async throws -> TMDBCreditsResponse {
        return try await fetchCredits(endpoint: "/tv/\(tmdbId)/credits")
    }

    // MARK: - Generic Credits Fetch

    /// Méthode générique pour récupérer les crédits (utilisée par movies et séries)
    private func fetchCredits(endpoint: String) async throws -> TMDBCreditsResponse {
        // Construction de l'URL
        guard let url = URL(string: "\(baseURL)\(endpoint)") else {
            throw NetworkError.invalidURL
        }

        // Headers avec authentification Bearer
        let headers = [
            "Authorization": "Bearer \(apiKey)",
            "Accept": "application/json"
        ]

        // Utilisation de NetworkService
        return try await networkService.request(url: url, headers: headers)
    }
}
