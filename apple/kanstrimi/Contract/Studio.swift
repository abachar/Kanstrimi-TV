import Foundation

/// A studio hub (`GET /movies/studios`, `GET /series/studios`): a TMDB production company or a TV
/// network chosen in the admin. `id` (`company:3`, `network:49`) is the `studio` filter of the lists.
nonisolated struct Studio: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let name: String
    let logo: URL?
    let count: Int
    /// The backdrop of its latest visible title: the background of its screen.
    let backdrop: URL?

    init(id: String, name: String, logo: URL?, count: Int, backdrop: URL? = nil) {
        self.id = id; self.name = name; self.logo = logo; self.count = count; self.backdrop = backdrop
    }
}
