import Foundation

/// Where a source comes from: an Xtream account, a local share… Several are foreseen.
nonisolated struct Provider: Codable, Hashable, Sendable {
    let id: String
    let name: String
    /// "xtream", "local"…
    let kind: String
    /// The provider's place in the admin's order of preference, 1 first: the menus group the sources by it.
    let rank: Int
}

/// A playable stream. Opaque identifier, never a `stream_id`.
nonisolated struct Source: Codable, Hashable, Identifiable, Sendable {
    let id: String
    /// Container as the provider names it: "MKV", "MP4", "TS".
    let container: String
    /// The provider's own URL, played as is (its account is in the path).
    let streamURL: URL
    let provider: Provider?
    /// Provider category, for the admin.
    let origin: String?
    /// What tells this copy from the provider's other copies of the version ("LIGHT", "A"); nil for a lone copy.
    let distinction: String?
    /// What the app shows for the source, written by the server: "iPTVisions", "iPTVisions · LIGHT".
    let label: String

    enum CodingKeys: String, CodingKey {
        case id, container, origin, provider, distinction, label
        case streamURL = "stream_url"
    }
}

/// One language × one quality. Sources are ordered by the server; the first is the default.
nonisolated struct Version: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let language: Language
    let quality: Quality
    /// Live: the version's chip, written by the server: "FHD", or "FHD/EN" when the channel mixes languages.
    var chip: String? = nil
    let dynamicRange: DynamicRange?
    let sources: [Source]
    /// A cut other than the theatrical one ("Version longue", "Director's Cut"); nil for the usual cut.
    var edition: String? = nil
    /// Live: this quality's own guide when it is not the channel's ("M6 4K"); `hasEPG` nil = the channel's applies.
    var hasEPG: Bool? = nil
    var now: Programme? = nil
    var next: Programme? = nil

    enum CodingKeys: String, CodingKey {
        case id, language, quality, chip, sources, edition, now, next
        case dynamicRange = "dynamic_range"
        case hasEPG = "has_epg"
    }

    /// "4K Dolby Vision", "HD".
    var qualityLabel: String {
        guard let dynamicRange, dynamicRange != .sdr else { return quality.label }
        return "\(quality.label) \(dynamicRange.label)"
    }
    /// "FR · 4K Dolby Vision", "FR · HD · Version longue".
    var label: String { ["\(language.short) · \(qualityLabel)", edition].compactMap(\.self).joined(separator: " · ") }
    /// The line of one copy under its provider: the version, then what tells the copy from the provider's others
    /// ("FR · 4K · LIGHT"); the version alone for a series, whose versions carry no sources.
    func line(_ source: Source?) -> String { [label, source?.distinction].compactMap(\.self).joined(separator: " · ") }
}

/// A copy of a version at one provider, as the menus list them: by provider in the order of preference, then by
/// the version (descending quality, the profile's languages, the usual cut first) and what tells the copies apart.
nonisolated struct SourceLine: Identifiable, Hashable, Sendable {
    let version: Version
    /// Nil for a series: its versions name no source, one line per version then.
    let source: Source?
    var id: String { "\(version.id)|\(source?.id ?? "")" }
    var providerName: String? { source?.provider?.name }
    var text: String { version.line(source) }

    /// The lines of these versions, grouped by provider: `[(provider name or nil, lines)]` in the order of preference.
    static func grouped(_ versions: [Version]) -> [(provider: String?, lines: [SourceLine])] {
        let order = versions.languages
        let lines = versions.flatMap { v -> [SourceLine] in
            v.sources.isEmpty ? [SourceLine(version: v, source: nil)] : v.sources.map { SourceLine(version: v, source: $0) }
        }
        .sorted { a, b in
            let ra = a.source?.provider?.rank ?? .max, rb = b.source?.provider?.rank ?? .max
            if ra != rb { return ra < rb }
            if a.version.quality != b.version.quality { return a.version.quality > b.version.quality }
            if (a.version.dynamicRange ?? .sdr) != (b.version.dynamicRange ?? .sdr) { return (a.version.dynamicRange ?? .sdr) > (b.version.dynamicRange ?? .sdr) }
            let la = order.firstIndex(of: a.version.language) ?? 0, lb = order.firstIndex(of: b.version.language) ?? 0
            if la != lb { return la < lb }
            if (a.version.edition == nil) != (b.version.edition == nil) { return a.version.edition == nil }
            return (a.source?.distinction ?? "") < (b.source?.distinction ?? "")
        }
        var groups: [(provider: String?, lines: [SourceLine])] = []
        for line in lines {
            if let last = groups.indices.last, groups[last].provider == line.providerName { groups[last].lines.append(line) } else {
                groups.append((line.providerName, [line]))
            }
        }
        return groups
    }
}

/// The version the profile chose for a title, as the server keeps it (`PUT /playback/{id}/version`): a movie or a
/// channel starts on `id` when it is still listed; a series' choice (made on any episode) is the language × quality ×
/// dynamic range × edition applied to every episode, falling back to the same language. `label` « FR · 4K DV ».
nonisolated struct RememberedVersion: Codable, Hashable, Sendable {
    let id: String
    let language: Language
    let quality: Quality
    var dynamicRange: DynamicRange? = nil
    var edition: String? = nil
    let label: String

    enum CodingKeys: String, CodingKey {
        case id, language, quality, edition, label
        case dynamicRange = "dynamic_range"
    }

    init(id: String, language: Language, quality: Quality, dynamicRange: DynamicRange? = nil, edition: String? = nil, label: String) {
        self.id = id; self.language = language; self.quality = quality; self.dynamicRange = dynamicRange; self.edition = edition; self.label = label
    }
    /// What the app remembers of a version it just chose, before the server says it back.
    init(_ v: Version) {
        self.init(id: v.id, language: v.language, quality: v.quality, dynamicRange: v.dynamicRange, edition: v.edition, label: VersionChoiceKey(v).label)
    }

    var key: VersionChoiceKey { VersionChoiceKey(language: language, quality: quality, dynamicRange: dynamicRange, edition: edition) }
}

/// A language × quality choice that applies across the episodes of a series ("FR · 4K HDR").
nonisolated struct VersionChoiceKey: Hashable, Sendable {
    let language: Language
    let quality: Quality
    let dynamicRange: DynamicRange?
    /// The cut, when the choice is an edition: the usual cut is nil.
    let edition: String?

    init(language: Language, quality: Quality, dynamicRange: DynamicRange?, edition: String? = nil) {
        self.language = language; self.quality = quality; self.dynamicRange = dynamicRange; self.edition = edition
    }
    init(_ version: Version) {
        self.init(language: version.language, quality: version.quality, dynamicRange: version.dynamicRange, edition: version.edition)
    }

    var label: String {
        let dr = dynamicRange.flatMap { $0 == .sdr ? nil : " \($0.shortLabel)" } ?? ""
        return ["\(language.short) · \(quality.label)\(dr)", edition].compactMap(\.self).joined(separator: " · ")
    }
}

nonisolated extension Array where Element == Version {
    /// In the server's order, the profile's: the first one is what plays by default.
    var languages: [Language] {
        var seen: [Language] = []
        for l in map(\.language) where !seen.contains(l) { seen.append(l) }
        return seen
    }
    var maxQuality: Quality? { map(\.quality).max() }
    var maxDynamicRange: DynamicRange? { compactMap(\.dynamicRange).max() }
}
