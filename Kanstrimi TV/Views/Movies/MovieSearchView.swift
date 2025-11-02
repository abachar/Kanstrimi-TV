//
//  MovieSearchView.swift
//  Kanstrimi TV
//
//  Created by Claude on 27/10/2025.
//

import SwiftUI
import SwiftData

/// Vue de recherche pour les films
///
/// Affichée en fullScreenCover via double tap Play/Pause dans MovieListView
struct MovieSearchView: SearchView {
    typealias Item = Movie

    var contentType: ContentType { .movies }

    func cardBuilder(item: Movie) -> some View {
        MovieCard(movie: item)
    }
}

// MARK: - Previews

#Preview {
    let container = try! ModelContainer(
        for: Movie.self,
        configurations: ModelConfiguration(isStoredInMemoryOnly: true)
    )

    MovieSearchView()
        .modelContainer(container)
}
