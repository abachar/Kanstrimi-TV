import Foundation
import Observation

/// A query paged by an opaque cursor: `ListQuery` for titles, `SagaQuery` for sagas.
protocol PageQuery: Hashable, Sendable {
    var cursor: String? { get set }
}

/// Holds the loaded pages of a list, the cursor, and preloads when the focus enters the last third.
@Observable
final class Paginator<Item: Codable & Hashable & Identifiable & Sendable, Query: PageQuery> {
    private(set) var items: [Item] = []
    private(set) var query: Query
    private(set) var nextCursor: String?
    private(set) var isLoading = false
    /// Set when the first page failed: the whole grid shows a state panel.
    private(set) var firstPageError: CatalogError?
    /// Set when a later page failed: a Retry card takes its place, loaded cards stay.
    private(set) var pageError: CatalogError?
    private(set) var loadedOnce = false
    private let fetch: (Query) async throws -> Page<Item>
    private var generation = 0

    init(query: Query, fetch: @escaping (Query) async throws -> Page<Item>) {
        self.query = query
        self.fetch = fetch
    }

    var hasMore: Bool { nextCursor != nil }
    var isEmpty: Bool { loadedOnce && items.isEmpty && firstPageError == nil }

    func loadFirstPage() async {
        generation += 1
        let gen = generation
        items = []
        nextCursor = nil
        firstPageError = nil
        pageError = nil
        loadedOnce = false
        isLoading = true
        defer { if gen == generation { isLoading = false } }
        do {
            var q = query; q.cursor = nil
            let page = try await fetch(q)
            guard gen == generation else { return }
            items = page.items
            nextCursor = page.nextCursor
            loadedOnce = true
        } catch {
            guard gen == generation else { return }
            firstPageError = (error as? CatalogError) ?? .server(error.localizedDescription)
            loadedOnce = true
        }
    }

    /// Call when the focus reaches `index`; loads the next page once in the last third.
    func loadMoreIfNeeded(reaching index: Int) async {
        guard let cursor = nextCursor, !isLoading, pageError == nil, !items.isEmpty else { return }
        guard index >= items.count - max(1, items.count / 3) else { return }
        await loadPage(cursor: cursor)
    }

    func retry() async {
        if firstPageError != nil { await loadFirstPage(); return }
        pageError = nil
        if let cursor = nextCursor { await loadPage(cursor: cursor) }
    }

    /// New filters or sort: forget everything and start again.
    func apply(_ newQuery: Query) async {
        query = newQuery
        query.cursor = nil
        await loadFirstPage()
    }

    private func loadPage(cursor: String) async {
        let gen = generation
        isLoading = true
        defer { if gen == generation { isLoading = false } }
        do {
            var q = query; q.cursor = cursor
            let page = try await fetch(q)
            guard gen == generation else { return }
            let known = Set(items.map(\.id))
            items += page.items.filter { !known.contains($0.id) }
            nextCursor = page.nextCursor
        } catch {
            guard gen == generation else { return }
            pageError = (error as? CatalogError) ?? .server(error.localizedDescription)
        }
    }
}

extension Paginator where Item == Card, Query == ListQuery {
    /// « Voir tout » of a genre, a studio or « Nouveautés ».
    convenience init(client: CatalogClient, query: ListQuery) {
        self.init(query: query) { try await client.list($0) }
    }
}

extension ListQuery: PageQuery {}

/// `GET /movies/sagas`: nothing but the cursor.
nonisolated struct SagaQuery: PageQuery {
    var cursor: String?
}
