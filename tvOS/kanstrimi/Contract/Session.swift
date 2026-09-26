import Foundation

nonisolated struct PairingCode: Codable, Hashable, Sendable {
    let code: String
    let expiresAt: Date
    /// URL the phone opens after the scan.
    let url: URL

    enum CodingKeys: String, CodingKey {
        case code, url
        case expiresAt = "expires_at"
    }
    /// "K7Q-4MZ"
    var display: String {
        guard code.count == 6 else { return code }
        return "\(code.prefix(3))-\(code.suffix(3))"
    }
}

/// Wire form: `{ "status": "pending" }`, `{ "status": "approved", "token": "…", "device_name": "Salon" }`,
/// `{ "status": "expired" }`.
nonisolated enum PairingStatus: Codable, Hashable, Sendable {
    case pending
    case approved(token: String, deviceName: String)
    case expired

    private enum CodingKeys: String, CodingKey { case status, token, deviceName = "device_name" }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch try c.decode(String.self, forKey: .status) {
        case "approved": self = .approved(token: try c.decode(String.self, forKey: .token), deviceName: try c.decode(String.self, forKey: .deviceName))
        case "expired": self = .expired
        default: self = .pending
        }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .pending: try c.encode("pending", forKey: .status)
        case .expired: try c.encode("expired", forKey: .status)
        case .approved(let token, let name):
            try c.encode("approved", forKey: .status)
            try c.encode(token, forKey: .token)
            try c.encode(name, forKey: .deviceName)
        }
    }
}

nonisolated struct CatalogCounts: Codable, Hashable, Sendable {
    let movies: Int
    let series: Int
    let channels: Int
}

nonisolated struct Session: Codable, Hashable, Sendable {
    let deviceName: String
    let serverVersion: String
    let serverHost: String
    let tmdbLanguage: String
    let catalogLanguages: [Language]
    let defaultLanguageOrder: [Language]
    let counts: CatalogCounts
    let lastImport: Date?
    let tmdbRate: Double?

    enum CodingKeys: String, CodingKey {
        case counts
        case deviceName = "device_name"
        case serverVersion = "server_version"
        case serverHost = "server_host"
        case tmdbLanguage = "tmdb_language"
        case catalogLanguages = "catalog_languages"
        case defaultLanguageOrder = "default_language_order"
        case lastImport = "last_import"
        case tmdbRate = "tmdb_rate"
    }
}

nonisolated struct SearchResults: Codable, Hashable, Sendable {
    let query: String
    let best: ContentCard?
    let movies: [ContentCard]
    let series: [ContentCard]
    let live: [ContentCard]

    var isEmpty: Bool { movies.isEmpty && series.isEmpty && live.isEmpty }
    var total: Int { movies.count + series.count + live.count }
}
