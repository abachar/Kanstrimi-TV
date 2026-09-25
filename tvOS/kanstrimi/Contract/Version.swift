import Foundation

/// A playable stream at the provider. Opaque identifier, never a `stream_id`.
nonisolated struct Source: Codable, Hashable, Identifiable, Sendable {
    let id: String
    /// Container as the provider names it: "MKV", "MP4", "TS".
    let container: String
    /// Ready-to-play URL on the Kanstrimi server (it answers 302 to the provider).
    let streamURL: URL
    /// Provider category, the only thing that tells two sources apart for a human.
    let origin: String

    enum CodingKeys: String, CodingKey {
        case id, container, origin
        case streamURL = "stream_url"
    }
}

/// One language × one quality. Sources are ordered by the server; the first is the default.
nonisolated struct Version: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let language: Language
    let quality: Quality
    let dynamicRange: DynamicRange?
    let sources: [Source]

    enum CodingKeys: String, CodingKey {
        case id, language, quality, sources
        case dynamicRange = "dynamic_range"
    }

    /// "4K Dolby Vision", "HD".
    var qualityLabel: String {
        guard let dynamicRange, dynamicRange != .sdr else { return quality.label }
        return "\(quality.label) \(dynamicRange.label)"
    }
    /// "4K DV", "HD".
    var shortQualityLabel: String {
        guard let dynamicRange, dynamicRange != .sdr else { return quality.rawValue }
        return "\(quality.rawValue) \(dynamicRange.shortLabel)"
    }
    /// "4K Dolby Vision · VF".
    var label: String { "\(qualityLabel) · \(language.rawValue)" }
    /// "4K Dolby Vision · Français · MKV".
    var longLabel: String {
        var parts = [qualityLabel, language.label]
        if let c = sources.first?.container { parts.append(c) }
        return parts.joined(separator: " · ")
    }
}

nonisolated extension Array where Element == Version {
    var languages: [Language] { Set(map(\.language)).sorted() }
    var maxQuality: Quality? { map(\.quality).max() }
    var maxDynamicRange: DynamicRange? { compactMap(\.dynamicRange).max() }
    var sourceCount: Int { reduce(0) { $0 + $1.sources.count } }
    var qualities: [Quality] { Set(map(\.quality)).sorted(by: >) }
    func version(language: Language, quality: Quality, dynamicRange: DynamicRange?) -> Version? {
        first { $0.language == language && $0.quality == quality && ($0.dynamicRange ?? .sdr) == (dynamicRange ?? .sdr) }
    }
    /// Distinct quality rows for the matrix, best first.
    var qualityRows: [QualityRow] {
        var seen = Set<String>()
        return sorted { a, b in
            if a.quality != b.quality { return a.quality > b.quality }
            return (a.dynamicRange ?? .sdr) > (b.dynamicRange ?? .sdr)
        }.compactMap { v in
            let key = "\(v.quality.rawValue)/\(v.dynamicRange?.rawValue ?? "")"
            guard seen.insert(key).inserted else { return nil }
            return QualityRow(quality: v.quality, dynamicRange: v.dynamicRange)
        }
    }
}

nonisolated struct QualityRow: Hashable, Sendable {
    let quality: Quality
    let dynamicRange: DynamicRange?
    var key: String { "\(quality.rawValue)/\(dynamicRange?.rawValue ?? "")" }
}
