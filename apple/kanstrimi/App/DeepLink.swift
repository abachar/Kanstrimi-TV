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

    /// The id is opaque: only what could walk the API's paths is refused, since any app may open a `kanstrimi://` link.
    static func isContentID(_ id: String) -> Bool {
        !id.isEmpty && !id.contains("/") && !id.contains("..") && id.count <= 300
    }
}
