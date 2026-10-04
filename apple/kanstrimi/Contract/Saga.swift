import Foundation

/// A TMDB collection with at least two visible movies. `id` = `saga:<TMDB collection id>`.
nonisolated struct SagaRef: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let name: String
    let count: Int
    /// « Trilogie - Saga · 3 films ».
    let label: String
}

/// `GET /movies/sagas/{id}`: the saga, its header (« SAGA », « 3 films ») and its visible movies, latest release first.
nonisolated struct SagaSheet: Codable, Hashable, Sendable {
    let id: String
    let name: String
    let count: Int
    let poster: URL?
    let backdrop: URL?
    let heading: String
    let facts: String
    let movies: [ContentItem]
}
