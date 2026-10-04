import Foundation

/// Where a source comes from: an Xtream account, a local share… Several are foreseen.
nonisolated struct Provider: Codable, Hashable, Sendable {
    let id: String
    let name: String
    /// "xtream", "local"…
    let kind: String
}

/// A playable stream. Opaque identifier, never a `stream_id`.
nonisolated struct Source: Codable, Hashable, Identifiable, Sendable {
    let id: String
    /// Container as the provider names it: "MKV", "MP4", "TS".
    let container: String
    /// The provider's own URL, played as is (its account is in the path).
    let streamURL: URL
    let provider: Provider?
    /// Provider category, what tells two sources of the same provider apart for a human.
    let origin: String?

    enum CodingKeys: String, CodingKey {
        case id, container, origin, provider
        case streamURL = "stream_url"
    }

    /// "Fournisseur A · Films 4K UHD"
    var label: String { [provider?.name, origin].compactMap { $0 }.joined(separator: " · ") }
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
    /// "4K Dolby Vision · FR", "HD · FR · Version longue".
    var label: String { ["\(qualityLabel) · \(language.short)", edition].compactMap(\.self).joined(separator: " · ") }
    /// "Source A", "Source B": the sources of a version by their place.
    static func sourceName(_ index: Int) -> String { "Source \(Character(UnicodeScalar(65 + index)!))" }
}

nonisolated extension Array where Element == Version {
    var languages: [Language] { Set(map(\.language)).sorted() }
    var maxQuality: Quality? { map(\.quality).max() }
    var maxDynamicRange: DynamicRange? { compactMap(\.dynamicRange).max() }
}
