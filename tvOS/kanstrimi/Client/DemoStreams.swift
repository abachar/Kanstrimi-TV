import Foundation

/// The only three URLs the app is allowed to reach until real pairing exists.
/// Every fixture source points at one of them (`demo://live`, `demo://movie`, `demo://series`
/// in the JSON, rewritten by `MockCatalogClient`).
///
/// The real URLs carry provider credentials, so they live in `Client/DemoStreams.local.json`
/// (git-ignored, copied into the bundle by the synchronized folder), not in this file.
enum DemoStreams {
    private static let local: [String: URL] = {
        guard let url = Bundle.main.url(forResource: "DemoStreams.local", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let dict = try? JSONDecoder().decode([String: String].self, from: data) else { return [:] }
        return dict.compactMapValues(URL.init(string:))
    }()

    static let live = local["live"] ?? URL(string: "https://demo.invalid/live.ts")!
    static let movie = local["movie"] ?? URL(string: "https://demo.invalid/movie.mkv")!
    static let series = local["series"] ?? URL(string: "https://demo.invalid/episode.mkv")!

    static func resolve(_ url: URL) -> URL {
        guard url.scheme == "demo" else { return url }
        switch url.host() {
        case "live": return live
        case "series": return series
        default: return movie
        }
    }
}
