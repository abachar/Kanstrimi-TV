import Foundation
import Observation

/// Everything the screens share. Built once at launch, injected in the SwiftUI environment.
@Observable
final class AppEnvironment {
    let scenario: MockScenario
    /// Mock or HTTP, switched from Réglages without a relaunch.
    let client: SwitchingCatalogClient
    let mock: MockCatalogClient
    let http: HTTPCatalogClient
    let preferences: Preferences
    let device: DeviceStore
    let recentChannels: RecentChannelsStore
    let failedSources: FailedSourcesStore
    let progressQueue: ProgressQueue
    let homeCache: HomeCache
    let channelCache: ChannelCache
    let player: PlayerService
    /// `GET /info`, fetched after pairing and at launch; nil while loading or offline.
    var info: ServerInfo?
    /// The sheet shown full screen above the tabs, from any screen.
    var presentedDetail: ContentID?

    func open(_ id: ContentID) { presentedDetail = id }

    /// - Parameter forceMock: previews and the demo scenarios never touch the network.
    init(forceMock: Bool = false) {
        let scenario = MockScenario()
        let mock = MockCatalogClient(scenario: scenario)
        let preferences = Preferences()
        if forceMock { preferences.useMockClient = true }
        let device = DeviceStore()
        let http = HTTPCatalogClient(baseURL: URL(string: preferences.serverURL) ?? URL(string: Preferences.compiledServerURL)!, device: device)
        let client = SwitchingCatalogClient(mock: mock, http: http, preferences: preferences)
        let failed = FailedSourcesStore()
        self.scenario = scenario
        self.mock = mock
        self.http = http
        self.client = client
        self.preferences = preferences
        self.device = device
        self.recentChannels = RecentChannelsStore()
        self.failedSources = failed
        self.progressQueue = ProgressQueue()
        self.homeCache = HomeCache()
        self.channelCache = ChannelCache(client: client)
        self.player = PlayerService(client: client, preferences: preferences, failedSources: failed, progressQueue: progressQueue)
    }

    /// A 401 anywhere: token gone, cache gone, back to the QR code.
    func handleUnauthorized() {
        homeCache.clear()
        device.forget(reason: "L'appareil « \(preferences.deviceName.isEmpty ? "Salon" : preferences.deviceName) » a été retiré depuis l'admin du serveur. Vos favoris et vos reprises sont conservés côté serveur ; il suffit de l'ajouter à nouveau.")
        info = nil
    }

    /// Wraps a client call: converts a 401 into the unpairing flow, rethrows the rest.
    func call<T>(_ work: () async throws -> T) async throws -> T {
        do { return try await work() }
        catch CatalogError.unauthorized { handleUnauthorized(); throw CatalogError.unauthorized }
    }

    func loadInfo() async {
        info = try? await call { try await client.info() }
    }

    /// `GET /playback/{id}` wrapped with what the player needs to know about the content.
    func playbackContext(for card: Card) async throws -> PlaybackContext {
        let playback = try await call { try await client.playback(id: card.id) }
        let content = PlaybackContent(id: card.id, kind: card.kind, title: card.episode?.title ?? card.title,
                                      subtitle: card.episode != nil ? card.title : nil, episode: card.episode, backdrop: card.backdrop)
        return PlaybackContext(content: content, playback: playback)
    }
    func playbackContext(for episode: Episode, of series: Card) async throws -> PlaybackContext {
        let playback = try await call { try await client.playback(id: episode.id) }
        let content = PlaybackContent(id: episode.id, kind: .episode, title: episode.title, subtitle: series.title, episode: episode.ref, backdrop: series.backdrop)
        return PlaybackContext(content: content, playback: playback)
    }
    func playbackContext(for next: NextEpisode, seriesTitle: String) async throws -> PlaybackContext {
        let playback = try await call { try await client.playback(id: next.id) }
        let content = PlaybackContent(id: next.id, kind: .episode, title: next.title ?? "", subtitle: seriesTitle, episode: next.ref, backdrop: nil)
        return PlaybackContext(content: content, playback: playback)
    }
}
