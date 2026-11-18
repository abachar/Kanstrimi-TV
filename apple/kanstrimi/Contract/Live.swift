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
    let variants: [Variant]
    /// The qualities it comes in, the best first, one chip each ("4K", "FHD"): what its row shows; a variant's `chip` says which one it is.
    let chips: [String]
    let now: Programme?
    let next: Programme?
    /// 1 = the most watched over the last 30 days (« Les plus regardées », 10 channels at most); nil otherwise.
    var watchedRank: Int?
    /// 1 = the channel this profile watched last (« Récentes », 20 at most); nil otherwise.
    var recentRank: Int?
    /// The variant this profile chose for the channel, as the server keeps it.
    var remembered: RememberedVariant?

    enum CodingKeys: String, CodingKey {
        case id, name, number, logo, variants, chips, now, next, remembered
        case maxQuality = "max_quality"
        case hasEPG = "has_epg"
        case isFavorite = "is_favorite"
        case watchedRank = "watched_rank"
        case recentRank = "recent_rank"
    }

    init(id: ContentID, name: String, number: Int? = nil, logo: URL? = nil, maxQuality: Quality? = nil, hasEPG: Bool? = nil,
         isFavorite: Bool? = nil, variants: [Variant] = [], chips: [String]? = nil, now: Programme? = nil, next: Programme? = nil,
         watchedRank: Int? = nil, recentRank: Int? = nil, remembered: RememberedVariant? = nil) {
        self.id = id; self.name = name; self.number = number; self.logo = logo; self.maxQuality = maxQuality ?? variants.maxQuality
        self.hasEPG = hasEPG; self.isFavorite = isFavorite; self.variants = variants; self.now = now; self.next = next
        self.chips = chips ?? Self.chips(of: variants)
        self.watchedRank = watchedRank; self.recentRank = recentRank; self.remembered = remembered
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(ContentID.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        number = try c.decodeIfPresent(Int.self, forKey: .number)
        logo = try c.decodeIfPresent(URL.self, forKey: .logo)
        variants = try c.decodeIfPresent([Variant].self, forKey: .variants) ?? []
        chips = try c.decodeIfPresent([String].self, forKey: .chips) ?? Self.chips(of: variants)
        maxQuality = try c.decodeIfPresent(Quality.self, forKey: .maxQuality) ?? variants.maxQuality
        hasEPG = try c.decodeIfPresent(Bool.self, forKey: .hasEPG)
        isFavorite = try c.decodeIfPresent(Bool.self, forKey: .isFavorite)
        now = try c.decodeIfPresent(Programme.self, forKey: .now)
        next = try c.decodeIfPresent(Programme.self, forKey: .next)
        watchedRank = try c.decodeIfPresent(Int.self, forKey: .watchedRank)
        recentRank = try c.decodeIfPresent(Int.self, forKey: .recentRank)
        remembered = try c.decodeIfPresent(RememberedVariant.self, forKey: .remembered)
    }
}

extension Channel {
    /// The chips of these variants, the best quality first: what the server sends, for a channel made here.
    nonisolated static func chips(of variants: [Variant]) -> [String] {
        var seen: [String] = []
        for chip in variants.sorted(by: { $0.quality > $1.quality }).map({ $0.chip ?? $0.quality.rawValue }) where !seen.contains(chip) { seen.append(chip) }
        return seen
    }

    /// What a channel shows now and next, and whether the guide knows it at all.
    struct Guide: Equatable {
        let now: Programme?
        let next: Programme?
        let hasEPG: Bool?
        static let empty = Guide(now: nil, next: nil, hasEPG: nil)
    }

    /// The guide of that variant: its own when the server sent one (each quality may have its own), else the channel's.
    func guide(for variant: Variant?) -> Guide {
        if let variant, variant.hasEPG != nil { return Guide(now: variant.now, next: variant.next, hasEPG: variant.hasEPG) }
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
