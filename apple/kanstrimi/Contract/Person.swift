import Foundation

/// What the navigation carries to an actor's screen. `id` = `person:<TMDB id>`.
nonisolated struct PersonRef: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let name: String
    let photo: URL?
}

/// `GET /people/{id}`: an actor and their visible titles, latest release first.
nonisolated struct PersonSheet: Codable, Hashable, Sendable {
    let id: String
    let name: String
    let photo: URL?
    let movies: [ContentItem]
    let series: [ContentItem]
}
