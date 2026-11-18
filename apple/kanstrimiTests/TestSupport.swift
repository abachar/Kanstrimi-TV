import Foundation
@testable import kanstrimi

enum Fixtures {
    static let provider = Provider(id: "xtream-1", name: "Premier", kind: "xtream", rank: 1)
    static let backup = Provider(id: "xtream-2", name: "Secours", kind: "xtream", rank: 2)
    /// `playable` false: a series' own variant, which names a stream and plays nothing.
    static func variant(_ id: String, _ lang: Language, _ q: Quality, dr: DynamicRange? = nil, edition: String? = nil,
                        by provider: Provider = provider, playable: Bool = true) -> Variant {
        Variant(id: id, language: lang, quality: q, dynamicRange: dr, edition: edition, provider: provider, name: id, category: "Films",
                streamURL: playable ? URL(string: "demo://movie/\(id)") : nil)
    }
    /// The canvas sheet, in the server's order: seven variants (VF ×4, VOSTFR ×2, VO ×1), the VF 4K HDR at two providers.
    static let canvasVariants: [Variant] = [
        variant("vf-4k-dv", .vf, .uhd, dr: .dolbyVision),
        variant("vf-4k-hdr", .vf, .uhd, dr: .hdr),
        variant("vf-4k-hdr-b", .vf, .uhd, dr: .hdr, by: backup),
        variant("vf-fhd", .vf, .fhd),
        variant("vostfr-4k-hdr", .vostfr, .uhd, dr: .hdr),
        variant("vostfr-fhd", .vostfr, .fhd),
        variant("vo-fhd", .vo, .fhd),
    ]
    static func report(_ id: String, _ pos: TimeInterval, at date: Date = .now) -> ProgressReport {
        ProgressReport(contentID: ContentID(id), position: pos, duration: 6000, sentAt: date)
    }
    static func tempFile(_ name: String) -> URL {
        FileManager.default.temporaryDirectory.appending(path: "kanstrimi-tests-\(name)-\(UUID().uuidString).json")
    }
}
