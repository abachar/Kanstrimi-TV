import Foundation

/// Where a variant comes from: an Xtream account, a local share… Several are foreseen.
nonisolated struct Provider: Codable, Hashable, Sendable {
    let id: String
    let name: String
    /// "xtream", "local"…
    let kind: String
    /// The provider's place in the admin's order of preference, 1 first: it orders the variants of a same quality.
    let rank: Int
}

/// One stream of one provider, as the lists show it and the player plays it: a title has as many as its providers
/// list it. The server sends them in the order they are listed and tried (the profile's languages, the usual cut
/// before an edition, descending quality, the preferred provider first) and writes their texts.
nonisolated struct Variant: Codable, Hashable, Identifiable, Sendable {
    /// Opaque, never a `stream_id`.
    let id: String
    let language: Language
    let quality: Quality
    var dynamicRange: DynamicRange? = nil
    /// A cut other than the theatrical one ("Version longue", "Director's Cut"); nil for the usual cut.
    var edition: String? = nil
    /// "4K DV", "FHD".
    let badge: String
    /// "FR · 4K DV · Version longue": its language, its quality and its cut in one text.
    let label: String
    let provider: Provider
    /// The provider's own name of the stream and of its category: what tells five "FHD" apart.
    let name: String
    var category: String? = nil
    /// Container as the provider names it: "MKV", "MP4", "TS".
    let container: String
    /// The provider's own URL, played as is (its account is in the path); nil for a series' own variants, which name
    /// its streams and play nothing.
    let streamURL: URL?
    /// Live: its chip, "FHD", or "FHD/EN" when the channel mixes languages.
    var chip: String? = nil
    /// Live: this variant's own guide when it is not the channel's ("M6 4K"); `hasEPG` nil = the channel's applies.
    var hasEPG: Bool? = nil
    var now: Programme? = nil
    var next: Programme? = nil

    enum CodingKeys: String, CodingKey {
        case id, language, quality, edition, badge, label, provider, name, category, container, chip, now, next
        case dynamicRange = "dynamic_range"
        case streamURL = "stream_url"
        case hasEPG = "has_epg"
    }

    /// What makes two variants the same thing to watch: the automatic switch stays within it.
    var key: VariantKey { VariantKey(language: language, quality: quality, dynamicRange: dynamicRange, edition: edition) }
    /// How a list names it: its language too when the title comes in several.
    func title(withLanguage: Bool) -> String { withLanguage ? label : [badge, edition].compactMap(\.self).joined(separator: " · ") }
    /// Where it comes from, in one line: "iPTVisions · |FR| Matrix (4K)".
    var origin: String { "\(provider.name) · \(name)" }
}

/// Language × quality × dynamic range × cut: what a variant is, whichever provider serves it.
nonisolated struct VariantKey: Hashable, Sendable {
    let language: Language
    let quality: Quality
    let dynamicRange: DynamicRange?
    /// The cut, when it is an edition: the usual cut is nil.
    let edition: String?
}

/// The variant the profile chose for a title, as the server keeps it (`PUT /playback/{id}/variant`). `id` is that
/// variant among those served beside it: a movie or a channel starts on it, an episode on its own variant under the
/// stream chosen for the series. When it is not listed, the closest plays: the same `key`, else the same language.
/// `label` « FR · 4K DV ».
nonisolated struct RememberedVariant: Codable, Hashable, Sendable {
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
    /// What the app remembers of a variant it just chose, before the server says it back.
    init(_ v: Variant) {
        self.init(id: v.id, language: v.language, quality: v.quality, dynamicRange: v.dynamicRange, edition: v.edition, label: v.label)
    }

    var key: VariantKey { VariantKey(language: language, quality: quality, dynamicRange: dynamicRange, edition: edition) }
}

nonisolated extension Array where Element == Variant {
    /// In the server's order, the profile's: the first one is what plays by default.
    var languages: [Language] {
        var seen: [Language] = []
        for l in map(\.language) where !seen.contains(l) { seen.append(l) }
        return seen
    }
    var maxQuality: Quality? { map(\.quality).max() }
    var maxDynamicRange: DynamicRange? { compactMap(\.dynamicRange).max() }
    /// Those that play: all of a movie's, a channel's or an episode's, none of a series' own.
    var playable: [Variant] { filter { $0.streamURL != nil } }
}

nonisolated extension Variant {
    /// A variant made here (the demo client, previews, tests), its texts written the way the server writes them.
    init(id: String, language: Language, quality: Quality, dynamicRange: DynamicRange? = nil, edition: String? = nil,
         provider: Provider, name: String, category: String? = nil, container: String = "MKV", streamURL: URL?, chip: String? = nil) {
        let badge = [quality.rawValue, dynamicRange.flatMap { $0 == .sdr ? nil : $0.shortLabel }].compactMap(\.self).joined(separator: " ")
        self.init(id: id, language: language, quality: quality, dynamicRange: dynamicRange, edition: edition, badge: badge,
                  label: ["\(language.short) · \(badge)", edition].compactMap(\.self).joined(separator: " · "),
                  provider: provider, name: name, category: category, container: container, streamURL: streamURL, chip: chip)
    }
}
