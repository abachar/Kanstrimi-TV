import Foundation

/// The only three URLs the app is allowed to reach until real pairing exists.
/// Every fixture source points at one of them (`demo://live`, `demo://movie`, `demo://series`
/// in the JSON, rewritten by `MockCatalogClient`).
///
/// TODO: replace the placeholders with the three real URLs provided for the demo.
enum DemoStreams {
    static let live = URL(string: "https://demo.invalid/live.ts")!
    static let movie = URL(string: "https://demo.invalid/movie.mkv")!
    static let series = URL(string: "https://demo.invalid/episode.mkv")!

    static func resolve(_ url: URL) -> URL {
        guard url.scheme == "demo" else { return url }
        switch url.host() {
        case "live": return live
        case "series": return series
        default: return movie
        }
    }
}
