//
//  AccountInfo.swift
//  Kanstrimi TV
//
//  Created on 2025-10-26.
//  Modèles de réponse API Xtream pour l'authentification et les informations du compte
//

import Foundation

// MARK: - Authentication Response

struct AccountInfoResponse: Codable {
    let userInfo: UserInfo?
    let serverInfo: ServerInfo

    enum CodingKeys: String, CodingKey {
        case userInfo = "user_info"
        case serverInfo = "server_info"
    }
}

struct UserInfo: Codable {
    let username: String?
    let password: String?
    let message: String?
    let auth: Int?
    let status: String?
    let exp_date: String?
    let is_trial: String?
    let active_cons: String?
    let created_at: String?
    let max_connections: String?
    let allowed_output_formats: [String]?
}

struct ServerInfo: Codable {
    let url: String?
    let port: String?
    let https_port: String?
    let server_protocol: String?
    let rtmp_port: String?
    let timezone: String?
    let timestamp_now: Int?
    let time_now: String?
}
