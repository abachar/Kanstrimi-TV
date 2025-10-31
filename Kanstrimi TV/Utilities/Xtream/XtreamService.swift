//
//  XtreamService.swift
//  Kanstrimi TV
//
//  Created on 2025-10-26.
//  Service singleton pour les appels API Xtream Codes
//

import Foundation

/// Service singleton gérant toutes les requêtes vers l'API Xtream Codes
final class XtreamService {
    /// Instance partagée (singleton)
    static let shared = XtreamService()

    /// NetworkService pour les requêtes
    private let networkService = NetworkService.shared

    /// Initialisation privée (singleton)
    private init() {}

    // MARK: - Generic Request Method

    /// Méthode générique pour effectuer une requête et décoder la réponse
    private func request<T: Decodable>(
        endpoint: XtreamEndpoint,
        account: Account
    ) async throws -> T {
        // Construction de l'URL
        guard let url = XtreamURLBuilder.buildURL(endpoint: endpoint, account: account) else {
            throw NetworkError.invalidURL
        }

        // Utilisation de NetworkService
        return try await networkService.request(url: url)
    }

    // MARK: - Account

    /// Récupère les informations du compte
    /// - Parameter account: Compte Xtream
    /// - Returns: Informations du compte et du serveur
    func getAccountInfo(account: Account) async throws -> AccountInfoResponse {
        return try await request(endpoint: .accountInfo, account: account)
    }

    // MARK: - Live TV

    /// Récupère la liste des catégories Live TV
    /// - Parameter account: Compte Xtream
    /// - Returns: Liste des catégories
    func getLiveCategories(account: Account) async throws -> [LiveCategoryResponse] {
        return try await request(endpoint: .liveCategories, account: account)
    }

    /// Récupère la liste des chaînes Live TV
    /// - Parameters:
    ///   - account: Compte Xtream
    ///   - categoryId: ID de catégorie (optionnel, nil pour toutes les chaînes)
    /// - Returns: Liste des chaînes
    func getLiveStreams(account: Account, categoryId: String? = nil) async throws -> [LiveChannelResponse] {
        return try await request(endpoint: .liveStreams(categoryId: categoryId), account: account)
    }

    /// Récupère les données simples d'un stream (EPG basique)
    /// - Parameters:
    ///   - account: Compte Xtream
    ///   - streamId: ID du stream
    /// - Returns: Données EPG
    func getSimpleDataTable(account: Account, streamId: Int) async throws -> EPGResponse {
        return try await request(endpoint: .simpleDataTable(streamId: streamId), account: account)
    }

    /// Récupère l'EPG court d'un stream
    /// - Parameters:
    ///   - account: Compte Xtream
    ///   - streamId: ID du stream
    ///   - limit: Nombre maximum de résultats (optionnel)
    /// - Returns: Données EPG
    func getShortEPG(account: Account, streamId: Int, limit: Int? = nil) async throws -> EPGResponse {
        return try await request(endpoint: .shortEPG(streamId: streamId, limit: limit), account: account)
    }

    // MARK: - VOD (Movies)

    /// Récupère la liste des catégories VOD
    /// - Parameter account: Compte Xtream
    /// - Returns: Liste des catégories
    func getVODCategories(account: Account) async throws -> [VODCategoryResponse] {
        return try await request(endpoint: .vodCategories, account: account)
    }

    /// Récupère la liste des films VOD
    /// - Parameters:
    ///   - account: Compte Xtream
    ///   - categoryId: ID de catégorie (optionnel, nil pour tous les films)
    /// - Returns: Liste des films
    func getVODStreams(account: Account, categoryId: String? = nil) async throws -> [MovieResponse] {
        return try await request(endpoint: .vodStreams(categoryId: categoryId), account: account)
    }

    /// Récupère les informations détaillées d'un film VOD
    /// - Parameters:
    ///   - account: Compte Xtream
    ///   - vodId: ID du film
    /// - Returns: Informations détaillées du film
    func getVODInfo(account: Account, vodId: Int) async throws -> MovieInfo {
        return try await request(endpoint: .vodInfo(vodId: vodId), account: account)
    }

    // MARK: - Series

    /// Récupère la liste des catégories de séries
    /// - Parameter account: Compte Xtream
    /// - Returns: Liste des catégories
    func getSeriesCategories(account: Account) async throws -> [SeriesCategoryResponse] {
        return try await request(endpoint: .seriesCategories, account: account)
    }

    /// Récupère la liste des séries
    /// - Parameters:
    ///   - account: Compte Xtream
    ///   - categoryId: ID de catégorie (optionnel, nil pour toutes les séries)
    /// - Returns: Liste des séries
    func getSeries(account: Account, categoryId: String? = nil) async throws -> [SeriesResponse] {
        return try await request(endpoint: .series(categoryId: categoryId), account: account)
    }

    /// Récupère les informations détaillées d'une série
    /// - Parameters:
    ///   - account: Compte Xtream
    ///   - seriesId: ID de la série
    /// - Returns: Informations détaillées de la série (saisons, épisodes)
    func getSeriesInfo(account: Account, seriesId: Int) async throws -> SeriesInfo {
        return try await request(endpoint: .seriesInfo(seriesId: seriesId), account: account)
    }
}
