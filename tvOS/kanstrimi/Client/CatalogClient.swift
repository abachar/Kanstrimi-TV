import Foundation

nonisolated enum CatalogError: Error, LocalizedError, Equatable {
    /// Network unreachable or timeout.
    case offline
    /// 401: the device token was revoked.
    case unauthorized
    case notFound
    case server(String)
    case decoding(String)

    var errorDescription: String? {
        switch self {
        case .offline: "Serveur injoignable"
        case .unauthorized: "Cet Apple TV a été dissocié"
        case .notFound: "Introuvable"
        case .server(let m): m
        case .decoding(let m): "Réponse illisible : \(m)"
        }
    }
}

nonisolated enum CatalogSort: String, CaseIterable, Codable, Sendable {
    case recent, title, year, rating, latestEpisodes = "latest_episodes"

    var label: String {
        switch self {
        case .recent: "Nouveautés"
        case .title: "Titre"
        case .year: "Année"
        case .rating: "Note"
        case .latestEpisodes: "Derniers épisodes"
        }
    }
    static func options(for kind: ContentKind) -> [CatalogSort] {
        kind == .series ? [.latestEpisodes, .recent, .title, .year, .rating] : [.recent, .title, .year, .rating]
    }
}

/// Query string of the paginated lists.
nonisolated struct ListQuery: Hashable, Sendable {
    var kind: ContentKind
    var sort: CatalogSort
    var genre: String?
    var language: Language?
    var minQuality: Quality?
    var dynamicRange: DynamicRange?
    var vfAvailable = false
    var completeSeasonVF = false
    var newEpisodes = false
    var cursor: String?

    init(kind: ContentKind) {
        self.kind = kind
        self.sort = kind == .series ? .latestEpisodes : .recent
    }

    var hasFilters: Bool {
        genre != nil || language != nil || minQuality != nil || dynamicRange != nil || vfAvailable || completeSeasonVF || newEpisodes
    }
    /// Same query without the cursor: identity of a list.
    var base: ListQuery { var q = self; q.cursor = nil; return q }
}

nonisolated enum SearchScope: String, CaseIterable, Sendable {
    case all, movies, series, live
    var label: String {
        switch self {
        case .all: "Tout"
        case .movies: "Films"
        case .series: "Séries"
        case .live: "En direct"
        }
    }
}

/// The future `/api/v1`. One implementation today: `MockCatalogClient`.
protocol CatalogClient: AnyObject {
    // Pairing and session
    func createPairingCode() async throws -> PairingCode
    func pollPairing(code: String) async throws -> PairingStatus
    func session() async throws -> Session
    func revokeDevice() async throws

    // Home
    func home() async throws -> HomeScreen

    // Lists
    func list(_ query: ListQuery) async throws -> Page<ContentCard>
    func genres(kind: ContentKind) async throws -> [Genre]

    // Sheets
    func detail(id: ContentID) async throws -> ContentDetail
    func season(seriesID: ContentID, number: Int) async throws -> [Episode]
    func playbackContext(id: ContentID) async throws -> PlaybackContext

    // Live
    func channels() async throws -> [ChannelGroup]
    func epg(channelID: ContentID) async throws -> EPGNow

    // Search
    func search(_ query: String, scope: SearchScope) async throws -> SearchResults

    // Writes
    func report(_ progress: ProgressReport) async throws
    func setFavorite(id: ContentID, _ favorite: Bool) async throws
}
