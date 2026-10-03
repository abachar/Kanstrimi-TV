import Foundation

/// A TMDB collection with at least two visible movies. `id` = `saga:<TMDB collection id>`.
nonisolated struct SagaRef: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let name: String
    let count: Int
}

/// `GET /movies/sagas/{id}`: the saga and its visible movies, latest release first.
nonisolated struct SagaSheet: Codable, Hashable, Sendable {
    let id: String
    let name: String
    let count: Int
    let poster: URL?
    let backdrop: URL?
    let movies: [ContentItem]
}
