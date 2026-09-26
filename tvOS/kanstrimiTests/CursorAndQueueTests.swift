import Foundation
import Testing
@testable import kanstrimi

@MainActor
struct PaginatorTests {
    @Test("La liste se charge page par page en suivant le curseur, puis s'arrête")
    func followsCursorToTheEnd() async throws {
        let scenario = MockScenario()
        scenario.latency = 0
        let client = MockCatalogClient(scenario: scenario)
        let paginator = Paginator(client: client, query: ListQuery(kind: .movie))
        await paginator.loadFirstPage()
        #expect(paginator.items.count == MockCatalogClient.pageSize)
        #expect(paginator.hasMore)
        await paginator.loadMoreIfNeeded(reaching: paginator.items.count - 1)
        await paginator.loadMoreIfNeeded(reaching: paginator.items.count - 1)
        #expect(!paginator.hasMore)
        #expect(paginator.items.count == 44)
        #expect(Set(paginator.items.map(\.id)).count == 44, "pas de doublon entre pages")
    }

    @Test("Le préchargement ne part que dans le dernier tiers")
    func prefetchThreshold() async {
        let scenario = MockScenario()
        scenario.latency = 0
        let paginator = Paginator(client: MockCatalogClient(scenario: scenario), query: ListQuery(kind: .movie))
        await paginator.loadFirstPage()
        await paginator.loadMoreIfNeeded(reaching: 2)
        #expect(paginator.items.count == MockCatalogClient.pageSize)
        await paginator.loadMoreIfNeeded(reaching: 13)
        #expect(paginator.items.count > MockCatalogClient.pageSize)
    }

    @Test("Une page en échec garde les cartes déjà chargées et expose Réessayer")
    func failedPageKeepsLoaded() async {
        let scenario = MockScenario()
        scenario.latency = 0
        scenario.failingSecondPage = true
        let paginator = Paginator(client: MockCatalogClient(scenario: scenario), query: ListQuery(kind: .movie))
        await paginator.loadFirstPage()
        await paginator.loadMoreIfNeeded(reaching: paginator.items.count - 1)
        #expect(paginator.items.count == MockCatalogClient.pageSize)
        #expect(paginator.pageError != nil)
        scenario.failingSecondPage = false
        await paginator.retry()
        #expect(paginator.pageError == nil)
        #expect(paginator.items.count > MockCatalogClient.pageSize)
    }

    @Test("Changer de filtre repart de zéro")
    func filterResets() async {
        let scenario = MockScenario()
        scenario.latency = 0
        let paginator = Paginator(client: MockCatalogClient(scenario: scenario), query: ListQuery(kind: .movie))
        await paginator.loadFirstPage()
        var q = paginator.query
        q.genre = "drame"
        await paginator.apply(q)
        #expect(paginator.items.allSatisfy { $0.genres.contains("Drame") })
        #expect(paginator.query.cursor == nil)
    }
}

@MainActor
struct ProgressQueueTests {
    @Test("Une seule entrée par contenu, la plus récente, en fin de file")
    func lastWins() {
        let queue = ProgressQueue(fileURL: nil)
        queue.enqueue(Fixtures.report("a", 10))
        queue.enqueue(Fixtures.report("b", 20))
        queue.enqueue(Fixtures.report("a", 30))
        #expect(queue.pending.map(\.contentID.rawValue) == ["b", "a"])
        #expect(queue.pending.last?.position == 30)
    }

    @Test("La file survit à un redémarrage")
    func persists() {
        let url = Fixtures.tempFile("queue")
        defer { try? FileManager.default.removeItem(at: url) }
        let queue = ProgressQueue(fileURL: url)
        queue.enqueue(Fixtures.report("a", 10))
        let reloaded = ProgressQueue(fileURL: url)
        #expect(reloaded.pending.count == 1)
        #expect(reloaded.pending.first?.contentID.rawValue == "a")
    }

    @Test("Le rejeu s'arrête au premier échec et garde le reste dans l'ordre")
    func flushStopsOnFailure() async {
        let queue = ProgressQueue(fileURL: nil)
        queue.enqueue(Fixtures.report("a", 10))
        queue.enqueue(Fixtures.report("b", 20))
        queue.enqueue(Fixtures.report("c", 30))
        var sent: [String] = []
        await queue.flush { r in
            if r.contentID.rawValue == "b" { throw CatalogError.offline }
            sent.append(r.contentID.rawValue)
        }
        #expect(sent == ["a"])
        #expect(queue.pending.map(\.contentID.rawValue) == ["b", "c"])
        await queue.flush { sent.append($0.contentID.rawValue) }
        #expect(sent == ["a", "b", "c"])
        #expect(queue.isEmpty)
    }
}

@MainActor
struct RecentChannelsTests {
    private func makeStore() -> RecentChannelsStore {
        let defaults = UserDefaults(suiteName: "tests-\(UUID().uuidString)")!
        return RecentChannelsStore(defaults: defaults)
    }

    @Test("La plus récente d'abord, sans doublon, huit au plus")
    func orderAndCap() {
        let store = makeStore()
        for i in 1...10 { store.record(ContentID("live:\(i)")) }
        store.record(ContentID("live:5"))
        #expect(store.entries.count == RecentChannelsStore.capacity)
        #expect(store.entries.first?.channelID.rawValue == "live:5")
        #expect(store.entries.map(\.channelID.rawValue) == ["live:5", "live:10", "live:9", "live:8", "live:7", "live:6", "live:4", "live:3"])
    }

    @Test("La chaîne précédente est la première qui n'est pas la courante")
    func previousChannel() {
        let store = makeStore()
        store.record(ContentID("live:a"))
        store.record(ContentID("live:b"))
        #expect(store.previous(excluding: ContentID("live:b"))?.rawValue == "live:a")
        #expect(store.previous(excluding: ContentID("live:z"))?.rawValue == "live:b")
        #expect(makeStore().previous(excluding: nil) == nil)
    }

    @Test("L'historique est persisté dans les réglages")
    func persisted() {
        let defaults = UserDefaults(suiteName: "tests-\(UUID().uuidString)")!
        RecentChannelsStore(defaults: defaults).record(ContentID("live:a"))
        #expect(RecentChannelsStore(defaults: defaults).entries.first?.channelID.rawValue == "live:a")
    }
}
