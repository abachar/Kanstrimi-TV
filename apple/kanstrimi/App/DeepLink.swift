import Foundation

/// `kanstrimi://open/<id>` (a sheet) and `kanstrimi://play/<id>` (a movie or an episode, resumed where it was left):
/// the links of the Apple TV Top Shelf.
nonisolated enum DeepLink: Equatable, Sendable {
    case open(ContentID)
    case play(ContentID)

    static let scheme = "kanstrimi"

    init?(url: URL) {
        guard url.scheme == Self.scheme, let host = url.host() else { return nil }
        let id = url.path(percentEncoded: false).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard Self.isContentID(id) else { return nil }
        switch host {
        case "open": self = .open(ContentID(id))
        case "play": self = .play(ContentID(id))
        default: return nil
        }
    }

    /// One of our ids (`tmdb:…`, `fallback:…`, `live:…`) and nothing that could walk the API's paths: any app may
    /// open a `kanstrimi://` link.
    static func isContentID(_ id: String) -> Bool {
        ["tmdb:", "fallback:", "live:"].contains { id.hasPrefix($0) } && !id.contains("/") && !id.contains("..")
            && id.count <= 300
    }

    var url: URL {
        switch self {
        case .open(let id): URL(string: "\(Self.scheme)://open/\(id.rawValue)")!
        case .play(let id): URL(string: "\(Self.scheme)://play/\(id.rawValue)")!
        }
    }
}
