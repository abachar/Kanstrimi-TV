import Foundation
@testable import kanstrimi

enum Fixtures {
    static func source(_ id: String, origin: String = "Films 4K UHD") -> Source {
        Source(id: id, container: "MKV", streamURL: URL(string: "demo://movie")!, provider: nil, origin: origin)
    }
    static func version(_ id: String, _ lang: Language, _ q: Quality, dr: DynamicRange? = nil, sources: Int = 1, edition: String? = nil) -> Version {
        Version(id: id, language: lang, quality: q, dynamicRange: dr, sources: (0..<sources).map { source("\(id)-s\($0)") }, edition: edition)
    }
    /// The seven versions of the canvas sheet: VF ×3, VOSTFR ×2, VO ×1 (+ one duplicated source).
    static let sevenVersions: [Version] = [
        version("vf-4k-dv", .vf, .uhd, dr: .dolbyVision),
        version("vf-4k-hdr", .vf, .uhd, dr: .hdr, sources: 2),
        version("vf-fhd", .vf, .fhd),
        version("vostfr-4k-hdr", .vostfr, .uhd, dr: .hdr),
        version("vostfr-fhd", .vostfr, .fhd),
        version("vo-fhd", .vo, .fhd),
    ]
    static func report(_ id: String, _ pos: TimeInterval, at date: Date = .now) -> ProgressReport {
        ProgressReport(contentID: ContentID(id), position: pos, duration: 6000, sentAt: date)
    }
    static func tempFile(_ name: String) -> URL {
        FileManager.default.temporaryDirectory.appending(path: "kanstrimi-tests-\(name)-\(UUID().uuidString).json")
    }
}
