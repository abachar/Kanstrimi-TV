import Foundation

/// `POST /devices`
nonisolated struct PairingCode: Codable, Hashable, Sendable {
    let code: String
    let expiresAt: Date
    /// URL the phone opens after the scan.
    let url: URL
    /// The device token, given with the code: it works once the code is approved, and is kept only then.
    let token: String

    enum CodingKeys: String, CodingKey {
        case code, url, token
        case expiresAt = "expires_at"
    }
    /// "K7Q-4MZ"
    var display: String {
        guard code.count == 6 else { return code }
        return "\(code.prefix(3))-\(code.suffix(3))"
    }
}

/// `GET /devices/{code}`: `{ "status": "pending" }`, `{ "status": "approved", "device_name": "Salon" }`,
/// `{ "status": "expired" }`.
nonisolated enum PairingStatus: Codable, Hashable, Sendable {
    case pending
    case approved(deviceName: String)
    case expired

    private enum CodingKeys: String, CodingKey { case status, deviceName = "device_name" }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch try c.decode(String.self, forKey: .status) {
        case "approved": self = .approved(deviceName: try c.decode(String.self, forKey: .deviceName))
        case "expired": self = .expired
        default: self = .pending
        }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .pending: try c.encode("pending", forKey: .status)
        case .expired: try c.encode("expired", forKey: .status)
        case .approved(let name):
            try c.encode("approved", forKey: .status)
            try c.encode(name, forKey: .deviceName)
        }
    }
}

nonisolated struct CatalogCounts: Codable, Hashable, Sendable {
    let movies: Int
    let series: Int
    let channels: Int
}

/// `GET /info`
nonisolated struct ServerInfo: Codable, Hashable, Sendable {
    let serverVersion: String
    let counts: CatalogCounts
    let lastImport: Date?
    let tmdbRate: Double?
    let catalogLanguages: [Language]
    let defaultLanguageOrder: [Language]

    enum CodingKeys: String, CodingKey {
        case counts
        case serverVersion = "server_version"
        case lastImport = "last_import"
        case tmdbRate = "tmdb_rate"
        case catalogLanguages = "catalog_languages"
        case defaultLanguageOrder = "default_language_order"
    }
}

/// `GET /search`
nonisolated struct SearchResults: Codable, Hashable, Sendable {
    let query: String
    let best: ContentItem?
    let movies: [ContentItem]
    let series: [ContentItem]
    let live: [ContentItem]

    var isEmpty: Bool { movies.isEmpty && series.isEmpty && live.isEmpty }
    var total: Int { movies.count + series.count + live.count }
}
