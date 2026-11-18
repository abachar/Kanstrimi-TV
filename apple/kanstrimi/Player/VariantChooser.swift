import Foundation

/// Picks the variant `Lecture` will play, without asking.
/// Order: the choice remembered for this title (a series': for its episodes) › the profile's language order (the
/// server lists the variants in it; `languageOrder` empty means that order) and the max quality › TV capabilities ›
/// server order, which puts the preferred provider first. A variant that failed recently is skipped. An edition
/// ("Version longue") is never the automatic choice while the usual cut exists: it plays when picked.
struct VariantChooser {
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
            /// The remembered variant itself; `closest`: what it was, by another stream.
            case remembered, closest, preferences, fallbackLanguage, onlyOne
        }
        let variant: Variant
        let reason: Reason
    }

    var languageOrder: [Language]
    var maxQuality: Quality
    var capabilities: Capabilities = .appleTV4K
    var isFailed: (String) -> Bool = { _ in false }

    /// The variant a title starts in, wherever it starts (Lecture, a channel, the Direct preview, the guide shown for
    /// it). `remembered`: what the profile chose for it (the server keeps it, nothing when its setting is off), played
    /// again as is when still listed, else the closest: the same language × quality × dynamic range × cut, else the
    /// same language at the best quality (an episode the chosen stream does not have).
    func choose(from variants: [Variant], remembered: RememberedVariant? = nil) -> Choice? {
        let playable = variants.playable
        guard !playable.isEmpty else { return nil }

        if let remembered {
            if let v = playable.first(where: { $0.id == remembered.id }) {
                // Failed a moment ago: the same thing by another stream, when there is one.
                return isFailed(v.id) ? Choice(variant: working(equivalents(of: v, in: playable)) ?? v, reason: .closest)
                                      : Choice(variant: v, reason: .remembered)
            }
            if let v = working(playable.filter { $0.key == remembered.key }) { return Choice(variant: v, reason: .closest) }
            let sameLanguage = playable.filter { $0.language == remembered.language }
            if let v = best(among: sameLanguage.filter { $0.edition == remembered.edition }) ?? best(among: sameLanguage) {
                return Choice(variant: v, reason: .closest)
            }
        }
        if playable.count == 1 { return Choice(variant: playable[0], reason: .onlyOne) }
        for language in languageOrder.isEmpty ? playable.languages : languageOrder {
            if let v = best(among: playable.filter { $0.language == language }) { return Choice(variant: v, reason: .preferences) }
        }
        // No preferred language among them: the first of the server order, within capabilities if possible.
        return Choice(variant: working(playable.filter(fits)) ?? playable[0], reason: .fallbackLanguage)
    }

    /// The variants that are the same thing to watch as `variant`, itself included, in the server's order.
    func equivalents(of variant: Variant, in variants: [Variant]) -> [Variant] {
        variants.playable.filter { $0.key == variant.key }
    }

    /// The next equivalent after `variant` that has not failed, for the automatic switch.
    func next(after variant: Variant, in variants: [Variant]) -> Variant? {
        let same = equivalents(of: variant, in: variants)
        guard let idx = same.firstIndex(where: { $0.id == variant.id }) else { return same.first { !isFailed($0.id) } }
        let after = same[(idx + 1)...] + same[..<idx]
        return after.first { !isFailed($0.id) && $0.id != variant.id }
    }

    /// « Réessayer »: the same thing again, by a stream that has not just failed when there is one.
    func retry(of variant: Variant, in variants: [Variant]) -> Variant? {
        let same = equivalents(of: variant, in: variants)
        let itself = same.first { $0.id == variant.id }
        if let itself, !isFailed(itself.id) { return itself }
        return same.first { !isFailed($0.id) } ?? itself ?? same.first
    }

    /// Every other variant, in the server's order: what the failure dialog offers.
    func alternatives(to current: Variant, in variants: [Variant]) -> [Variant] {
        variants.playable.filter { $0.id != current.id }
    }

    /// The one warning for an episode missing in the language in use: the sheet and the "À suivre" card say it
    /// the same way. The return is announced only when a later episode in that language is known.
    static func languageWarning(episode: Int, alternative: Language, current: Language, returnsAt: Int?, quality: Quality? = nil) -> String {
        let detail = quality.map { " \($0.rawValue)" } ?? ""
        let back = returnsAt.map { ", retour en \(current.short) à l'épisode \($0)" } ?? "."
        return "É\(episode) n'existe qu'en \(alternative.short)\(detail) : lecture en \(alternative.short)\(back)"
    }

    // MARK: - Internals

    private func fits(_ v: Variant) -> Bool {
        guard v.quality <= maxQuality, v.quality <= capabilities.maxQuality else { return false }
        switch v.dynamicRange {
        case .dolbyVision?: return capabilities.supportsDolbyVision
        case .hdr?: return capabilities.supportsHDR
        default: return true
        }
    }

    /// The first, in the server's order, that has not failed recently; else the first anyway.
    private func working(_ variants: [Variant]) -> Variant? {
        variants.first { !isFailed($0.id) } ?? variants.first
    }

    /// The highest quality that fits, dynamic range as a tiebreaker, by the first provider that has not just failed;
    /// the lowest quality when nothing fits. The usual cut only, when there is one.
    private func best(among all: [Variant]) -> Variant? {
        let usual = all.filter { $0.edition == nil }
        let candidates = usual.isEmpty ? all : usual
        let fitting = candidates.filter(fits)
        let top = fitting.isEmpty
            ? candidates.min { $0.quality < $1.quality }
            : fitting.max { a, b in a.quality != b.quality ? a.quality < b.quality : (a.dynamicRange ?? .sdr) < (b.dynamicRange ?? .sdr) }
        guard let top else { return nil }
        return working(candidates.filter { $0.quality == top.quality && ($0.dynamicRange ?? .sdr) == (top.dynamicRange ?? .sdr) })
    }
}
