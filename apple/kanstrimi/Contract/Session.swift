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

/// `PUT /devices/me/push`: the phone's APNs token, and the gateway it belongs to (`sandbox` for a build from Xcode,
/// `production` for one from TestFlight).
nonisolated struct PushRegistration: Codable, Hashable, Sendable {
    let platform: String
    let token: String
    let environment: String
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
    /// The profile this answer, and every other, is for: the one sent in `X-Profile`, else the default one.
    let profile: Profile

    enum CodingKeys: String, CodingKey {
        case counts, profile
        case serverVersion = "server_version"
        case lastImport = "last_import"
        case tmdbRate = "tmdb_rate"
        case catalogLanguages = "catalog_languages"
    }
}

/// `GET /search`
/// `/search`: movies, series and channels in one list, the most relevant first.
nonisolated struct SearchResults: Codable, Hashable, Sendable {
    let query: String
    let items: [ContentItem]
}
