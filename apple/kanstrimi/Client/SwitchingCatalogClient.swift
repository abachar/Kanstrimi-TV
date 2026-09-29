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
    func sagas(cursor: String?) async throws -> Page<Saga> { try await active.sagas(cursor: cursor) }
    func saga(id: String) async throws -> SagaSheet { try await active.saga(id: id) }
    func channels() async throws -> [ChannelGroup] { try await active.channels() }
    func channel(id: ContentID) async throws -> Channel { try await active.channel(id: id) }
    func playback(id: ContentID) async throws -> Playback { try await active.playback(id: id) }
    func report(_ progress: ProgressReport) async throws { try await active.report(progress) }
    func search(_ query: String, scope: SearchScope) async throws -> SearchResults { try await active.search(query, scope: scope) }
    func setFavorite(id: ContentID, _ favorite: Bool) async throws { try await active.setFavorite(id: id, favorite) }
}
