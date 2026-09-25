import Foundation

nonisolated struct Programme: Codable, Hashable, Sendable {
    let title: String
    let start: Date
    let end: Date
    let overview: String?

    func fraction(at date: Date = .now) -> Double {
        let total = end.timeIntervalSince(start)
        guard total > 0 else { return 0 }
        return min(1, max(0, date.timeIntervalSince(start) / total))
    }
}

nonisolated struct EPGNow: Codable, Hashable, Sendable {
    let now: Programme?
    let next: Programme?
    static let empty = EPGNow(now: nil, next: nil)
}

nonisolated struct Channel: Codable, Hashable, Identifiable, Sendable {
    let id: ContentID
    let name: String
    let number: Int?
    let logo: URL?
    let category: String
    let versions: [Version]

    var maxQuality: Quality? { versions.maxQuality }
}

nonisolated struct ChannelGroup: Codable, Hashable, Identifiable, Sendable {
    let category: String
    let channels: [Channel]
    var id: String { category }
}
