//
//  SearchMovies.swift
//  Kanstrimi TV
//
//  Created by Claude on 27/10/2025.
//

import SwiftUI
import SwiftData

/// Vue de recherche pour les films
///
/// Affichée en fullScreenCover via double tap Play/Pause dans MoviesView
struct SearchMovies: View {
    // MARK: - Environment
    @Environment(\.dismiss) private var dismiss
    @Environment(MoviesViewModel.self) private var viewModel

    // MARK: - Queries
    @Query(sort: \Movie.sortOrder) private var allMovies: [Movie]

    // MARK: - Configuration
    private let configuration = SearchConfiguration(
        title: "Rechercher un film",
        searchPrompt: "Rechercher un film...",
        emptyIcon: "film.slash"
    )

    // MARK: - Body
    var body: some View {
        GenericSearchView(
            allItems: allMovies,
            configuration: configuration
        ) { movie in
            MovieCard(movie: movie)
        }
    }
}

// MARK: - Previews

#Preview("Empty State") {
    let container = try! ModelContainer(
        for: Movie.self,
        configurations: ModelConfiguration(isStoredInMemoryOnly: true)
    )

    return SearchMovies()
        .modelContainer(container)
        .environment(MoviesViewModel())
}

#Preview("With 5 Results") {
    let container = try! ModelContainer(
        for: Movie.self,
        configurations: ModelConfiguration(isStoredInMemoryOnly: true)
    )

    let context = container.mainContext

    // Insérer 5 films de preview
    for movie in Array(Movie.previewMovies.prefix(5)) {
        context.insert(movie)
    }

    return SearchMovies()
        .modelContainer(container)
        .environment(MoviesViewModel())
}
