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
    /// The tab on screen; `navigate` pushes onto its stack.
    var selectedTab: MainTab = .home
    /// One navigation stack per tab (iOS). Empty on tvOS, where details are covers.
    var paths: [MainTab: [Route]] = [:]
    /// tvOS: the detail shown full screen above the tabs, from any screen.
    var presentedDetail: ContentID?

    /// Opens a title's detail from anywhere: a cover on tvOS, a push on iOS.
    func open(_ id: ContentID) { navigate(.detail(id)) }

    func navigate(_ route: Route) {
        if Platform.isTV {
            // The genre grid is a cover owned by the catalogue screen on tvOS; only details come here.
            if case .detail(let id) = route { presentedDetail = id }
        } else {
            paths[selectedTab, default: []].append(route)
        }
    }

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

    /// Plays a channel from a card (search, home): its versions and the zapping order come with the channel list.
    func watchChannel(_ id: ContentID) async {
        guard let groups = try? await call({ try await client.channels() }) else { return }
        let all = groups.flatMap(\.channels)
        guard let channel = all.first(where: { $0.id == id }) else { return }
        player.play(channel: channel, in: all)
        recentChannels.record(channel.id)
    }

    /// Follows a Top Shelf link: the sheet, or the playback where it was left. Nothing before pairing.
    func handle(_ link: DeepLink) async {
        guard device.isPaired else { return }
        switch link {
        case .open(let id):
            if player.isPresented { player.stop() }
            open(id)
        case .play(let id):
            if let ctx = try? await playbackContext(for: id) { player.play(ctx) }
        }
    }

    /// A movie or an episode from its id alone (Top Shelf, debug hooks): its sheet gives the title and the episode.
    func playbackContext(for id: ContentID) async throws -> PlaybackContext? {
        let card = try await call { try await client.detail(id: id.seriesID ?? id) }
        guard id.seriesID != nil else { return try await playbackContext(for: card) }
        guard let episode = card.allEpisodes.first(where: { $0.id == id }) else { return nil }
        return try await playbackContext(for: episode, of: card)
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
