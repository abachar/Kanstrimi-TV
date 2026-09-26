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

/// Query string of `GET /movies?genre=…` and `GET /series?genre=…` ("Voir tout").
nonisolated struct ListQuery: Hashable, Sendable {
    var kind: ContentKind
    var genre: String?
    var sort: CatalogSort
    var language: Language?
    var minQuality: Quality?
    var dynamicRange: DynamicRange?
    var vfAvailable = false
    var cursor: String?

    init(kind: ContentKind, genre: String? = nil) {
        self.kind = kind
        self.genre = genre
        self.sort = kind == .series ? .latestEpisodes : .recent
    }

    var hasFilters: Bool { language != nil || minQuality != nil || dynamicRange != nil || vfAvailable }
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

/// `/api/v1`, one method per route. One implementation today: `MockCatalogClient`.
protocol CatalogClient: AnyObject {
    // Devices
    /// `POST /devices`
    func createDevice() async throws -> PairingCode
    /// `GET /devices/{code}`
    func pollDevice(code: String) async throws -> PairingStatus
    /// `DELETE /devices/{code}`
    func deleteDevice(code: String) async throws
    /// `GET /info`
    func info() async throws -> ServerInfo

    // Home
    /// `GET /home`
    func home() async throws -> HomeScreen

    // Movies and series
    /// `GET /movies` · `GET /series`: rows by genre, twenty cards each.
    func rows(kind: ContentKind) async throws -> [CatalogRow]
    /// `GET /movies?genre=&cursor=` · `GET /series?genre=&cursor=`: "Voir tout".
    func list(_ query: ListQuery) async throws -> Page<Card>
    /// `GET /movies/{id}` · `GET /series/{id}`: the full card, seasons and episodes included.
    func detail(id: ContentID) async throws -> Card

    // Live
    /// `GET /channels`: every category with its channels.
    func channels() async throws -> [ChannelGroup]
    /// `GET /channels/{id}`: one channel with `now` and `next`.
    func channel(id: ContentID) async throws -> Channel

    // Playback
    /// `GET /playback/{id}`: movie, episode or channel.
    func playback(id: ContentID) async throws -> Playback
    /// `PUT /playback/{id}/progress`
    func report(_ progress: ProgressReport) async throws

    // Search and favourites
    /// `GET /search?q=&scope=`
    func search(_ query: String, scope: SearchScope) async throws -> SearchResults
    /// `PUT` / `DELETE /favorites/{id}`
    func setFavorite(id: ContentID, _ favorite: Bool) async throws
}
