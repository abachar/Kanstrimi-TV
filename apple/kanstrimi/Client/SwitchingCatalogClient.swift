import Foundation

/// Mock or HTTP, decided at each call by Réglages › « Client de démonstration ». The screens,
/// the player and the caches hold this one object, so flipping the switch needs no relaunch.
final class SwitchingCatalogClient: CatalogClient {
    let mock: MockCatalogClient
    let http: HTTPCatalogClient
    private let preferences: Preferences

    init(mock: MockCatalogClient, http: HTTPCatalogClient, preferences: Preferences) {
        self.mock = mock; self.http = http; self.preferences = preferences
    }

    var isMock: Bool { preferences.useMockClient }
    private var active: CatalogClient { isMock ? mock : http }

    func createDevice() async throws -> PairingCode { try await active.createDevice() }
    func pollDevice(code: String) async throws -> PairingStatus { try await active.pollDevice(code: code) }
    func deleteDevice(code: String) async throws { try await active.deleteDevice(code: code) }
    func info() async throws -> ServerInfo { try await active.info() }
    func home() async throws -> HomeScreen { try await active.home() }
    func rows(kind: ContentKind) async throws -> [CatalogRow] { try await active.rows(kind: kind) }
    func list(_ query: ListQuery) async throws -> Page<Card> { try await active.list(query) }
    func detail(id: ContentID) async throws -> Card { try await active.detail(id: id) }
    func studios(kind: ContentKind) async throws -> [Studio] { try await active.studios(kind: kind) }
    func sagas(cursor: String?) async throws -> Page<Saga> { try await active.sagas(cursor: cursor) }
    func saga(id: String) async throws -> SagaSheet { try await active.saga(id: id) }
    func person(id: String) async throws -> PersonSheet { try await active.person(id: id) }
    func channels() async throws -> [ChannelGroup] { try await active.channels() }
    func channel(id: ContentID) async throws -> Channel { try await active.channel(id: id) }
    func programmes(channel id: ContentID, version: String?) async throws -> [Programme] { try await active.programmes(channel: id, version: version) }
    func playback(id: ContentID) async throws -> Playback { try await active.playback(id: id) }
    func suggestions(id: ContentID) async throws -> Suggestions { try await active.suggestions(id: id) }
    func report(_ progress: ProgressReport) async throws { try await active.report(progress) }
    func reportWatchTime(id: ContentID, seconds: Int) async throws { try await active.reportWatchTime(id: id, seconds: seconds) }
    func removeFromResume(id: ContentID) async throws { try await active.removeFromResume(id: id) }
    func setWatched(id: ContentID, _ watched: Bool, season: Int?) async throws { try await active.setWatched(id: id, watched, season: season) }
    func search(_ query: String) async throws -> SearchResults { try await active.search(query) }
    func setFavorite(id: ContentID, _ favorite: Bool) async throws { try await active.setFavorite(id: id, favorite) }
}
