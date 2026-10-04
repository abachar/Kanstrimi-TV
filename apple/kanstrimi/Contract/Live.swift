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

/// A channel. Lists carry the base; `GET /channels/{id}` adds `now` and `next`.
nonisolated struct Channel: Codable, Hashable, Identifiable, Sendable {
    let id: ContentID
    let name: String
    let number: Int?
    let logo: URL?
    let maxQuality: Quality?
    let hasEPG: Bool?
    var isFavorite: Bool?
    let versions: [Version]
    let now: Programme?
    let next: Programme?
    /// 1 = the most watched over the last 30 days (« Les plus regardées », 10 channels at most); nil otherwise.
    var watchedRank: Int?

    enum CodingKeys: String, CodingKey {
        case id, name, number, logo, versions, now, next
        case maxQuality = "max_quality"
        case hasEPG = "has_epg"
        case isFavorite = "is_favorite"
        case watchedRank = "watched_rank"
    }

    init(id: ContentID, name: String, number: Int? = nil, logo: URL? = nil, maxQuality: Quality? = nil, hasEPG: Bool? = nil,
         isFavorite: Bool? = nil, versions: [Version] = [], now: Programme? = nil, next: Programme? = nil, watchedRank: Int? = nil) {
        self.id = id; self.name = name; self.number = number; self.logo = logo; self.maxQuality = maxQuality ?? versions.maxQuality
        self.hasEPG = hasEPG; self.isFavorite = isFavorite; self.versions = versions; self.now = now; self.next = next
        self.watchedRank = watchedRank
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(ContentID.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        number = try c.decodeIfPresent(Int.self, forKey: .number)
        logo = try c.decodeIfPresent(URL.self, forKey: .logo)
        versions = try c.decodeIfPresent([Version].self, forKey: .versions) ?? []
        maxQuality = try c.decodeIfPresent(Quality.self, forKey: .maxQuality) ?? versions.maxQuality
        hasEPG = try c.decodeIfPresent(Bool.self, forKey: .hasEPG)
        isFavorite = try c.decodeIfPresent(Bool.self, forKey: .isFavorite)
        now = try c.decodeIfPresent(Programme.self, forKey: .now)
        next = try c.decodeIfPresent(Programme.self, forKey: .next)
        watchedRank = try c.decodeIfPresent(Int.self, forKey: .watchedRank)
    }
}

extension Channel {
    /// What a channel shows now and next, and whether the guide knows it at all.
    struct Guide: Equatable {
        let now: Programme?
        let next: Programme?
        let hasEPG: Bool?
        static let empty = Guide(now: nil, next: nil, hasEPG: nil)
    }

    /// The guide of that version: its own when the server sent one (each quality may have its own), else the channel's.
    func guide(for version: Version?) -> Guide {
        if let version, version.hasEPG != nil { return Guide(now: version.now, next: version.next, hasEPG: version.hasEPG) }
        return Guide(now: now, next: next, hasEPG: hasEPG)
    }
}

/// One entry of `GET /channels`: a country and a theme (« Maroc · Sport ») with its channels.
nonisolated struct ChannelGroup: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let name: String
    /// « Maroc » and « Sport », as the server splits `name`.
    let section: String
    let theme: String
    let channels: [Channel]
}
