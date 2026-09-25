import Foundation
import Observation

/// Everything the screens share. Built once at launch, injected in the SwiftUI environment.
@Observable
final class AppEnvironment {
    let scenario: MockScenario
    let client: CatalogClient
    let mock: MockCatalogClient
    let preferences: Preferences
    let device: DeviceStore
    let recentChannels: RecentChannelsStore
    let failedSources: FailedSourcesStore
    let progressQueue: ProgressQueue
    let homeCache: HomeCache
    let player: PlayerService
    /// Session fetched after pairing; nil while loading or offline.
    var session: Session?

    init() {
        let scenario = MockScenario()
        let mock = MockCatalogClient(scenario: scenario)
        let preferences = Preferences()
        let failed = FailedSourcesStore()
        self.scenario = scenario
        self.mock = mock
        self.client = mock
        self.preferences = preferences
        self.device = DeviceStore()
        self.recentChannels = RecentChannelsStore()
        self.failedSources = failed
        self.progressQueue = ProgressQueue()
        self.homeCache = HomeCache()
        self.player = PlayerService(client: mock, preferences: preferences, failedSources: failed, progressQueue: progressQueue)
    }

    /// A 401 anywhere: token gone, cache gone, back to the QR code.
    func handleUnauthorized() {
        homeCache.clear()
        device.forget(reason: "L'appareil « \(session?.deviceName ?? preferences.deviceName) » a été retiré depuis l'admin du serveur. Vos favoris et vos reprises sont conservés côté serveur ; il suffit de l'ajouter à nouveau.")
        session = nil
    }

    /// Wraps a client call: converts a 401 into the unpairing flow, rethrows the rest.
    func call<T>(_ work: () async throws -> T) async throws -> T {
        do { return try await work() }
        catch CatalogError.unauthorized { handleUnauthorized(); throw CatalogError.unauthorized }
    }

    func loadSession() async {
        session = try? await call { try await client.session() }
        if let name = session?.deviceName, preferences.deviceName.isEmpty { preferences.deviceName = name }
    }
}
