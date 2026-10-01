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
        case .unauthorized: "Cet appareil a été dissocié"
        case .notFound: "Introuvable"
        case .server(let m): m
        case .decoding(let m): "Réponse illisible : \(m)"
        }
    }
}

nonisolated enum CatalogSort: String, CaseIterable, Codable, Sendable {
    case release, recent, title, year, rating, latestEpisodes = "latest_episodes"

    var label: String {
        switch self {
        case .release: "Date de sortie"
        case .recent: "Nouveautés"
        case .title: "Titre"
        case .year: "Année"
        case .rating: "Note"
        case .latestEpisodes: "Derniers épisodes"
        }
    }
    static func options(for kind: ContentKind) -> [CatalogSort] {
        kind == .series ? [.release, .latestEpisodes, .title, .year, .rating] : [.release, .recent, .title, .year, .rating]
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
    /// `company:3`, `network:49`: the titles of one studio hub.
    var studio: String?
    var cursor: String?

    init(kind: ContentKind, genre: String? = nil) {
        self.kind = kind
        self.genre = genre
        self.sort = Self.defaultSort(kind: kind, genre: genre)
    }

    /// The server's order: « Nouveautés » / « Derniers épisodes » by arrival, every other row by release date.
    static func defaultSort(kind: ContentKind, genre: String?) -> CatalogSort {
        guard genre == "recent" else { return .release }
        return kind == .series ? .latestEpisodes : .recent
    }

    var hasFilters: Bool { language != nil || minQuality != nil || dynamicRange != nil || vfAvailable }
    /// The same list without the version filters, back on its default order.
    var cleared: ListQuery { var q = ListQuery(kind: kind, genre: genre); q.studio = studio; return q }
}

/// `/player`, one method per route. One implementation today: `MockCatalogClient`.
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
    /// `GET /movies/studios` · `GET /series/studios`: the studio hubs holding titles of that kind.
    func studios(kind: ContentKind) async throws -> [Studio]
    /// `GET /movies/sagas?cursor=`: the sagas with two visible movies or more, freshest first.
    func sagas(cursor: String?) async throws -> Page<Saga>
    /// `GET /movies/sagas/{id}`: one saga and its movies.
    func saga(id: String) async throws -> SagaSheet
    /// `GET /people/{id}`: an actor and their visible titles.
    func person(id: String) async throws -> PersonSheet

    // Live
    /// `GET /channels`: every category with its channels.
    func channels() async throws -> [ChannelGroup]
    /// `GET /channels/{id}`: one channel with `now` and `next`.
    func channel(id: ContentID) async throws -> Channel
    /// `GET /channels/{id}/programmes`: the programme on air, then the following ones until 6:00.
    /// In the guide of that version (each quality may have its own), the channel's without one.
    func programmes(channel id: ContentID, version: String?) async throws -> [Programme]

    // Playback
    /// `GET /playback/{id}`: movie, episode or channel.
    func playback(id: ContentID) async throws -> Playback
    /// `PUT /playback/{id}/progress`
    func report(_ progress: ProgressReport) async throws
    /// `POST /playback/{id}/watch-time`: seconds of a channel played since the last report (« Chaînes les plus regardées »).
    func reportWatchTime(id: ContentID, seconds: Int) async throws
    /// `DELETE /playback/{id}/progress`: out of « Reprendre », the resume point forgotten.
    func removeFromResume(id: ContentID) async throws
    /// `PUT /playback/{id}/watched`: a movie or an episode; on a series id with `season`, that whole season.
    func setWatched(id: ContentID, _ watched: Bool, season: Int?) async throws

    // Search and favourites
    /// `GET /search?q=`: films, series and channels at once.
    func search(_ query: String) async throws -> SearchResults
    /// `PUT` / `DELETE /favorites/{id}`
    func setFavorite(id: ContentID, _ favorite: Bool) async throws
}
