import Foundation

/// Picks the version and source `Lecture` will play, without asking.
/// Order: choice remembered for this title › series language › preferences (language order,
/// max quality) › TV capabilities › server order. A recently failed source is skipped.
struct VersionChooser {
    struct Capabilities: Sendable {
        var maxQuality: Quality = .uhd
        var supportsHDR = true
        var supportsDolbyVision = true
        static let appleTV4K = Capabilities()
        /// The phone screen does not show 4K: decoding it would only cost bandwidth and battery.
        static let iPhone = Capabilities(maxQuality: .fhd)
        static var current: Capabilities { Platform.isTV ? .appleTV4K : .iPhone }
    }

    struct Choice: Equatable, Sendable {
        enum Reason: Equatable, Sendable {
            case remembered, seriesLanguage, preferences, fallbackLanguage, onlyOne
        }
        let version: Version
        let source: Source
        let reason: Reason

        /// "choisie selon vos préférences", "mémorisée pour ce titre"…
        var reasonLabel: String {
            switch reason {
            case .remembered: "mémorisée pour ce titre"
            case .seriesLanguage: "langue de la série"
            case .preferences: "choisie selon vos préférences"
            case .fallbackLanguage: "aucune version dans votre langue, première de l'ordre serveur"
            case .onlyOne: "seule version disponible"
            }
        }
    }

    var languageOrder: [Language]
    var maxQuality: Quality
    var capabilities: Capabilities = .appleTV4K
    var isSourceFailed: (String) -> Bool = { _ in false }

    /// - Parameters:
    ///   - remembered: version id remembered for this exact title.
    ///   - seriesChoice: language × quality remembered for the series this episode belongs to.
    func choose(from versions: [Version], remembered: String? = nil, seriesChoice: VersionChoiceKey? = nil) -> Choice? {
        guard !versions.isEmpty else { return nil }
        let playable = versions.filter { !$0.sources.isEmpty }
        guard !playable.isEmpty else { return nil }

        if let remembered, let v = playable.first(where: { $0.id == remembered }), let s = bestSource(of: v) {
            return Choice(version: v, source: s, reason: .remembered)
        }
        if let seriesChoice {
            // Exact match first, then same language at the best allowed quality.
            if let v = playable.first(where: { VersionChoiceKey($0) == seriesChoice }), let s = bestSource(of: v) {
                return Choice(version: v, source: s, reason: .seriesLanguage)
            }
            if let v = best(among: playable.filter { $0.language == seriesChoice.language }), let s = bestSource(of: v) {
                return Choice(version: v, source: s, reason: .seriesLanguage)
            }
        }
        if playable.count == 1, let s = bestSource(of: playable[0]) {
            return Choice(version: playable[0], source: s, reason: .onlyOne)
        }
        for language in languageOrder {
            if let v = best(among: playable.filter { $0.language == language }), let s = bestSource(of: v) {
                return Choice(version: v, source: s, reason: .preferences)
            }
        }
        // No preferred language: first of the server order, within capabilities if possible.
        let candidate = best(among: playable, respectingServerOrder: true) ?? playable[0]
        guard let s = bestSource(of: candidate) else { return nil }
        return Choice(version: candidate, source: s, reason: .fallbackLanguage)
    }

    /// Versions the engine would try after `current`, best first, for "Autre version".
    func alternatives(to current: Version, in versions: [Version]) -> [Version] {
        let others = versions.filter { $0.id != current.id && !$0.sources.isEmpty }
        return others.sorted { rank($0) < rank($1) }
    }

    // MARK: - Internals

    private func fits(_ v: Version) -> Bool {
        guard v.quality <= maxQuality, v.quality <= capabilities.maxQuality else { return false }
        switch v.dynamicRange {
        case .dolbyVision?: return capabilities.supportsDolbyVision
        case .hdr?: return capabilities.supportsHDR
        default: return true
        }
    }

    /// Highest quality that fits, dynamic range as a tiebreaker; falls back to the lowest if nothing fits.
    private func best(among candidates: [Version], respectingServerOrder: Bool = false) -> Version? {
        guard !candidates.isEmpty else { return nil }
        let fitting = candidates.filter(fits)
        if fitting.isEmpty { return candidates.min { $0.quality < $1.quality } }
        if respectingServerOrder { return fitting.first }
        return fitting.max { a, b in
            if a.quality != b.quality { return a.quality < b.quality }
            return (a.dynamicRange ?? .sdr) < (b.dynamicRange ?? .sdr)
        }
    }

    private func rank(_ v: Version) -> (Int, Int, Int) {
        let lang = languageOrder.firstIndex(of: v.language) ?? languageOrder.count
        let fit = fits(v) ? 0 : 1
        return (fit, lang, -(Quality.allCases.firstIndex(of: v.quality) ?? 0))
    }

    /// First source in server order that has not failed recently; else the first anyway.
    func bestSource(of version: Version) -> Source? {
        version.sources.first { !isSourceFailed($0.id) } ?? version.sources.first
    }

    /// Next equivalent source after `source`, for the automatic switch.
    func nextSource(after source: Source, in version: Version) -> Source? {
        guard let idx = version.sources.firstIndex(of: source) else { return nil }
        let after = version.sources[(idx + 1)...] + version.sources[..<idx]
        return after.first { !isSourceFailed($0.id) && $0.id != source.id }
    }
}
