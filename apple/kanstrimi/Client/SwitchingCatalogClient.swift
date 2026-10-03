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

    /// A 401 on any authenticated call, whoever made it (a screen, the player, a cache): the device was revoked.
    var onUnauthorized: () -> Void = { }

    private func authenticated<T>(_ work: (CatalogClient) async throws -> T) async throws -> T {
        do { return try await work(active) }
        catch CatalogError.unauthorized { onUnauthorized(); throw CatalogError.unauthorized }
    }

    func createDevice() async throws -> PairingCode { try await active.createDevice() }
    func pollDevice(code: String) async throws -> PairingStatus { try await active.pollDevice(code: code) }
    func deleteDevice(code: String) async throws { try await authenticated { try await $0.deleteDevice(code: code) } }
    func info() async throws -> ServerInfo { try await authenticated { try await $0.info() } }
    func home() async throws -> HomeScreen { try await authenticated { try await $0.home() } }
    func rows(kind: ContentKind) async throws -> [CatalogRow] { try await authenticated { try await $0.rows(kind: kind) } }
    func list(_ query: ListQuery) async throws -> Page<ContentItem> { try await authenticated { try await $0.list(query) } }
    func detail(id: ContentID) async throws -> Card { try await authenticated { try await $0.detail(id: id) } }
    func studios(kind: ContentKind) async throws -> [Studio] { try await authenticated { try await $0.studios(kind: kind) } }
    func sagas(cursor: String?) async throws -> Page<ContentItem> { try await authenticated { try await $0.sagas(cursor: cursor) } }
    func saga(id: String) async throws -> SagaSheet { try await authenticated { try await $0.saga(id: id) } }
    func person(id: String) async throws -> PersonSheet { try await authenticated { try await $0.person(id: id) } }
    func channels() async throws -> [ChannelGroup] { try await authenticated { try await $0.channels() } }
    func channel(id: ContentID) async throws -> Channel { try await authenticated { try await $0.channel(id: id) } }
    func programmes(channel id: ContentID, version: String?) async throws -> [Programme] { try await authenticated { try await $0.programmes(channel: id, version: version) } }
    func playback(id: ContentID) async throws -> Playback { try await authenticated { try await $0.playback(id: id) } }
    func suggestions(id: ContentID) async throws -> Suggestions { try await authenticated { try await $0.suggestions(id: id) } }
    func report(_ progress: ProgressReport) async throws { try await authenticated { try await $0.report(progress) } }
    func reportWatchTime(id: ContentID, seconds: Int) async throws { try await authenticated { try await $0.reportWatchTime(id: id, seconds: seconds) } }
    func removeFromResume(id: ContentID) async throws { try await authenticated { try await $0.removeFromResume(id: id) } }
    func setWatched(id: ContentID, _ watched: Bool, season: Int?) async throws { try await authenticated { try await $0.setWatched(id: id, watched, season: season) } }
    func search(_ query: String) async throws -> SearchResults { try await authenticated { try await $0.search(query) } }
    func setFavorite(id: ContentID, _ favorite: Bool) async throws { try await authenticated { try await $0.setFavorite(id: id, favorite) } }
}
