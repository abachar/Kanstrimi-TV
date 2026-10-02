import Foundation
import Testing
@testable import kanstrimi

/// In the HTTP client's suite: the stub protocol is process-global and that suite runs serialised.
extension HTTPCatalogClientTests {
    private func reporter(_ queue: ProgressQueue, status: @escaping (URLRequest) -> Int) -> PlaybackReporter {
        StubProtocol.handler = { (status($0), Data()) }
        return PlaybackReporter(client: client, queue: queue)
    }

    @Test("Une position envoyée efface l'ancienne du même titre restée en file : la reprise ne recule pas")
    func reportedPositionDropsOlderQueuedOne() async throws {
        let queue = ProgressQueue(fileURL: nil)
        queue.enqueue(Fixtures.report("tmdb:movie:1", 600))
        await reporter(queue) { _ in 204 }.report(Fixtures.report("tmdb:movie:1", 2400))
        #expect(queue.isEmpty)
        let positions = StubProtocol.bodies.compactMap { try? JSONDecoder().decode([String: Double].self, from: $0)["position"] }
        #expect(positions == [2400])
    }

    @Test("Hors ligne, la position attend en file ; un titre retiré n'y entre pas")
    func failuresQueueOnlyWhatCanBeReplayed() async throws {
        let queue = ProgressQueue(fileURL: nil)
        await reporter(queue) { _ in 500 }.report(Fixtures.report("tmdb:movie:1", 100))
        #expect(queue.pending.map(\.contentID.rawValue) == ["tmdb:movie:1"])
        await reporter(queue) { _ in 404 }.report(Fixtures.report("tmdb:movie:2", 100))
        #expect(queue.pending.map(\.contentID.rawValue) == ["tmdb:movie:1"])
    }
}
