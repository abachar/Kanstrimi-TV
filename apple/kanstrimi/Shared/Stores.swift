import Foundation
import Observation

/// The 8 most recently watched channels, most recent first. Local to the device.
@Observable
final class RecentChannelsStore {
    nonisolated struct Entry: Codable, Hashable, Sendable {
        let channelID: ContentID
        let watchedAt: Date
    }
    static let capacity = 8
    private let defaults: UserDefaults
    private let key = "live.recentChannels"
    private(set) var entries: [Entry]

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if let data = defaults.data(forKey: key), let saved = try? JSONDecoder().decode([Entry].self, from: data) {
            entries = saved
        } else {
            entries = []
        }
    }

    func record(_ id: ContentID, at date: Date = .now) {
        entries.removeAll { $0.channelID == id }
        entries.insert(Entry(channelID: id, watchedAt: date), at: 0)
        if entries.count > Self.capacity { entries.removeLast(entries.count - Self.capacity) }
        persist()
    }

    /// The channel watched just before the current one.
    func previous(excluding current: ContentID?) -> ContentID? {
        entries.first { $0.channelID != current }?.channelID
    }

    func clear() { entries = []; persist() }

    private func persist() {
        defaults.set(try? JSONEncoder().encode(entries), forKey: key)
    }
}

/// Sources that failed recently are skipped by the version chooser for 24 h. Memory only.
@Observable
final class FailedSourcesStore {
    static let ttl: TimeInterval = 24 * 3600
    private var failures: [String: Date] = [:]
    let now: () -> Date

    init(now: @escaping () -> Date = { .now }) { self.now = now }

    func markFailed(_ sourceID: String) { failures[sourceID] = now() }
    func isFailed(_ sourceID: String) -> Bool {
        guard let at = failures[sourceID] else { return false }
        if now().timeIntervalSince(at) > Self.ttl { failures.removeValue(forKey: sourceID); return false }
        return true
    }
    /// A successful start clears the mark: "la source A sera réessayée à la prochaine lecture".
    func clear(_ sourceID: String) { failures.removeValue(forKey: sourceID) }
    var count: Int { failures.count }
}

/// Durable queue of progress reports that could not reach the server. Replayed in order, last wins.
@Observable
final class ProgressQueue {
    private(set) var pending: [ProgressReport]
    private let fileURL: URL?
    private var isFlushing = false

    init(fileURL: URL? = ProgressQueue.defaultURL) {
        self.fileURL = fileURL
        if let fileURL, let data = try? Data(contentsOf: fileURL),
           let saved = try? JSONDecoder().decode([ProgressReport].self, from: data) {
            pending = saved
        } else {
            pending = []
        }
    }

    static var defaultURL: URL? {
        try? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appending(path: "progress-queue.json")
    }

    /// Keeps one entry per content, the newest, at the position of the newest.
    func enqueue(_ report: ProgressReport) {
        pending.removeAll { $0.contentID == report.contentID }
        pending.append(report)
        persist()
    }

    /// Forgets a content's pending report: removed or marked by hand, a late replay must not bring it back.
    func drop(_ id: ContentID) {
        pending.removeAll { $0.contentID == id }
        persist()
    }

    /// Replays everything in order. A title the server no longer knows is dropped; any other failure stops the
    /// replay and keeps the rest. One replay at a time: the player and the home both ask for one.
    func flush(using send: (ProgressReport) async throws -> Void) async {
        guard !isFlushing else { return }
        isFlushing = true
        defer { isFlushing = false }
        while let first = pending.first {
            do {
                try await send(first)
            } catch CatalogError.notFound {
                // Removed from the catalogue: kept, it would block every report behind it.
            } catch {
                return
            }
            // By identity: a newer report of the same title may have replaced it meanwhile.
            pending.removeAll { $0 == first }
            persist()
        }
    }

    var isEmpty: Bool { pending.isEmpty }

    private func persist() {
        guard let fileURL else { return }
        try? JSONEncoder().encode(pending).write(to: fileURL, options: .atomic)
    }
}

/// Last home screen received, as a JSON file, shown when the server is unreachable.
final class HomeCache {
    private let fileURL: URL?
    private let encoder: JSONEncoder = { let e = JSONEncoder(); e.dateEncodingStrategy = .iso8601; return e }()
    private let decoder: JSONDecoder = { let d = JSONDecoder(); d.dateDecodingStrategy = .iso8601; return d }()

    init(fileURL: URL? = HomeCache.defaultURL) { self.fileURL = fileURL }

    static var defaultURL: URL? {
        try? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appending(path: "home-cache.json")
    }

    func save(_ home: HomeScreen) {
        guard let fileURL else { return }
        try? encoder.encode(home).write(to: fileURL, options: .atomic)
    }
    func load() -> HomeScreen? {
        guard let fileURL, let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? decoder.decode(HomeScreen.self, from: data)
    }
    func clear() {
        guard let fileURL else { return }
        try? FileManager.default.removeItem(at: fileURL)
    }
}

/// `GET /channels/{id}` per channel, asked at focus, kept one minute (now / next).
@Observable
final class ChannelCache {
    private struct Entry { let value: Channel; let at: Date }
    private var entries: [ContentID: Entry] = [:]
    private var inflight: [ContentID: Task<Channel?, Never>] = [:]
    private let client: CatalogClient
    static let ttl: TimeInterval = 60

    init(client: CatalogClient) { self.client = client }

    func cached(_ id: ContentID) -> Channel? {
        guard let e = entries[id], Date.now.timeIntervalSince(e.at) < Self.ttl else { return nil }
        return e.value
    }

    /// The last detail received, however old: `nowPlaying` keeps its programme while it airs.
    func latest(_ id: ContentID) -> Channel? { entries[id]?.value }

    func channel(_ id: ContentID) async -> Channel? {
        if let c = cached(id) { return c }
        if let t = inflight[id] { return await t.value }
        let task = Task { [client] in try? await client.channel(id: id) }
        inflight[id] = task
        let value = await task.value
        inflight[id] = nil
        if let value { entries[id] = Entry(value: value, at: .now) }
        return value
    }

    func clear() { entries = [:] }
}
