//
//  XtreamURLBuilder.swift
//  Kanstrimi TV
//
//  Created on 2025-10-26.
//  Construction type-safe des URLs de l'API Xtream Codes
//

import Foundation

/// Types d'endpoints de l'API Xtream Codes
enum XtreamEndpoint {
    case accountInfo
    case liveCategories
    case liveStreams(categoryId: String?)
    case simpleDataTable(streamId: Int)
    case shortEPG(streamId: Int, limit: Int?)
    case vodCategories
    case vodStreams(categoryId: String?)
    case vodInfo(vodId: Int)
    case seriesCategories
    case series(categoryId: String?)
    case seriesInfo(seriesId: Int)

    /// Action correspondante dans l'API Xtream
    var action: String? {
        switch self {
        case .accountInfo:
            return nil // Endpoint racine sans action
        case .liveCategories:
            return "get_live_categories"
        case .liveStreams:
            return "get_live_streams"
        case .simpleDataTable:
            return "get_simple_data_table"
        case .shortEPG:
            return "get_short_epg"
        case .vodCategories:
            return "get_vod_categories"
        case .vodStreams:
            return "get_vod_streams"
        case .vodInfo:
            return "get_vod_info"
        case .seriesCategories:
            return "get_series_categories"
        case .series:
            return "get_series"
        case .seriesInfo:
            return "get_series_info"
        }
    }

    /// Paramètres supplémentaires spécifiques à l'endpoint
    var additionalParameters: [String: String] {
        switch self {
        case .liveStreams(let categoryId):
            if let categoryId = categoryId {
                return ["category_id": categoryId]
            }
            return [:]

        case .simpleDataTable(let streamId):
            return ["stream_id": String(streamId)]

        case .shortEPG(let streamId, let limit):
            var params = ["stream_id": String(streamId)]
            if let limit = limit {
                params["limit"] = String(limit)
            }
            return params

        case .vodStreams(let categoryId):
            if let categoryId = categoryId {
                return ["category_id": categoryId]
            }
            return [:]

        case .vodInfo(let vodId):
            return ["vod_id": String(vodId)]

        case .series(let categoryId):
            if let categoryId = categoryId {
                return ["category_id": categoryId]
            }
            return [:]

        case .seriesInfo(let seriesId):
            return ["series_id": String(seriesId)]

        default:
            return [:]
        }
    }
}

/// Builder pour construire les URLs de l'API Xtream Codes
struct XtreamURLBuilder {
    /// Construit l'URL de lecture d'une chaîne Live TV
    /// - Parameters:
    ///   - account: Compte contenant les credentials et l'URL du serveur
    ///   - streamId: ID du stream
    ///   - ext: Extension du flux (par défaut "ts")
    /// - Returns: URL complète de lecture
    static func buildLiveStreamURL(account: Account, streamId: Int, ext: String = "ts") -> String {
        let serverURL = account.serverURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return "\(serverURL)/live/\(account.username)/\(account.password)/\(streamId).\(ext)"
    }

    /// Construit une URL complète pour un endpoint Xtream
    /// - Parameters:
    ///   - endpoint: Type d'endpoint
    ///   - account: Compte contenant les credentials et l'URL du serveur
    /// - Returns: URL complète ou nil si invalide
    static func buildURL(endpoint: XtreamEndpoint, account: Account) -> URL? {
        // Nettoyage de l'URL du serveur (suppression du trailing slash)
        let serverURL = account.serverURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))

        // Construction de l'URL de base
        var urlString = "\(serverURL)/player_api.php"

        // Ajout des credentials
        var queryItems: [String: String] = [
            "username": account.username,
            "password": account.password
        ]

        // Ajout de l'action si nécessaire
        if let action = endpoint.action {
            queryItems["action"] = action
        }

        // Ajout des paramètres supplémentaires
        for (key, value) in endpoint.additionalParameters {
            queryItems[key] = value
        }

        // Construction de la query string
        let queryString = queryItems
            .map { "\($0.key)=\($0.value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? $0.value)" }
            .joined(separator: "&")

        urlString += "?\(queryString)"

        return URL(string: urlString)
    }
}
