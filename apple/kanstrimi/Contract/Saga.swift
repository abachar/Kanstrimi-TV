import Foundation

/// A TMDB collection with at least two visible movies. `id` = `saga:<TMDB collection id>`.
nonisolated struct SagaRef: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let name: String
    let count: Int
}

/// A saga in `GET /movies/sagas`: its reference and its artwork.
nonisolated struct Saga: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let name: String
    let count: Int
    let poster: URL?
    let backdrop: URL?

    var ref: SagaRef { SagaRef(id: id, name: name, count: count) }
}

/// `GET /movies/sagas/{id}`: the saga and its visible movies, oldest release first.
nonisolated struct SagaSheet: Codable, Hashable, Sendable {
    let id: String
    let name: String
    let count: Int
    let poster: URL?
    let backdrop: URL?
    let movies: [Card]
}
