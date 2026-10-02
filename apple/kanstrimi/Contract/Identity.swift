import Foundation

/// Stable content identity, derived from TMDB on the server ("tmdb:movie:603",
/// "tmdb:tv:1396:s01e05", "live:tf1"). Opaque for the app.
nonisolated struct ContentID: RawRepresentable, Hashable, Codable, Sendable, CustomStringConvertible, Identifiable {
    let rawValue: String
    init(rawValue: String) { self.rawValue = rawValue }
    init(_ raw: String) { self.rawValue = raw }
    var description: String { rawValue }
    var id: String { rawValue }

    /// `tmdb:tv:1396:s01e05` → `tmdb:tv:1396`; nil when this is not an episode id.
    var seriesID: ContentID? {
        guard let range = rawValue.range(of: #":s\d{2}e\d{2}$"#, options: .regularExpression) else { return nil }
        return ContentID(String(rawValue[..<range.lowerBound]))
    }

    init(from decoder: Decoder) throws {
        rawValue = try decoder.singleValueContainer().decode(String.self)
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(rawValue)
    }
}

nonisolated enum ContentKind: String, Codable, Sendable, CaseIterable {
    case movie, series, episode, live

    /// A kind this app does not know yet reads as a movie: one card must not fail a whole screen.
    init(from decoder: Decoder) throws {
        self = ContentKind(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .movie
    }

    var label: String {
        switch self {
        case .movie: "Film"
        case .series: "Série"
        case .episode: "Épisode"
        case .live: "Direct"
        }
    }
}

/// Audio language of a version: VF, VOSTFR, VO or a raw language code.
nonisolated struct Language: RawRepresentable, Hashable, Codable, Sendable, Comparable {
    let rawValue: String
    init(rawValue: String) { self.rawValue = rawValue.uppercased() }
    init(_ raw: String) { self.init(rawValue: raw) }

    static let vf = Language("VF")
    static let vostfr = Language("VOSTFR")
    static let vo = Language("VO")

    var label: String {
        switch self {
        case .vf: "Français"
        case .vostfr: "VOSTFR"
        case .vo: "Version originale"
        default: rawValue
        }
    }

    /// Default display order: VF, VOSTFR, VO, then alphabetical codes.
    private var rank: Int {
        switch self {
        case .vf: 0
        case .vostfr: 1
        case .vo: 2
        default: 3
        }
    }
    static func < (lhs: Language, rhs: Language) -> Bool {
        lhs.rank != rhs.rank ? lhs.rank < rhs.rank : lhs.rawValue < rhs.rawValue
    }

    init(from decoder: Decoder) throws {
        self.init(rawValue: try decoder.singleValueContainer().decode(String.self))
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(rawValue)
    }
}

nonisolated enum Quality: String, Codable, Sendable, Comparable, CaseIterable {
    case sd = "SD", hd = "HD", fhd = "FHD", uhd = "4K"

    /// Unknown to this app (a later « 8K »): read as HD rather than failing the screen that shows it.
    init(from decoder: Decoder) throws {
        self = Quality(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .hd
    }

    private var rank: Int { Quality.allCases.firstIndex(of: self)! }
    static func < (lhs: Quality, rhs: Quality) -> Bool { lhs.rank < rhs.rank }

    var label: String {
        switch self {
        case .sd: "SD"
        case .hd: "HD"
        case .fhd: "HD 1080p"
        case .uhd: "4K"
        }
    }
}

nonisolated enum DynamicRange: String, Codable, Sendable, Comparable, CaseIterable {
    case sdr = "SDR", hdr = "HDR", dolbyVision = "DV"

    /// Unknown to this app: no badge rather than a failed screen.
    init(from decoder: Decoder) throws {
        self = DynamicRange(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .sdr
    }

    private var rank: Int { DynamicRange.allCases.firstIndex(of: self)! }
    static func < (lhs: DynamicRange, rhs: DynamicRange) -> Bool { lhs.rank < rhs.rank }

    var label: String {
        switch self {
        case .sdr: ""
        case .hdr: "HDR"
        case .dolbyVision: "Dolby Vision"
        }
    }
    var shortLabel: String {
        switch self {
        case .sdr: ""
        case .hdr: "HDR"
        case .dolbyVision: "DV"
        }
    }
}
