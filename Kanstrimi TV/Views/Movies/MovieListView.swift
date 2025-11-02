//
//  MovieListView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI
import SwiftData

struct MovieListView: ContentListView {
    typealias Item = Movie

    var contentType: ContentType { .movies }

    func cardBuilder(item: Movie) -> some View {
        MovieCard(movie: item)
    }
}

#Preview {
    let container = try! ModelContainer(
        for: Category.self, Movie.self,
        configurations: ModelConfiguration(isStoredInMemoryOnly: true)
    )

    let context = container.mainContext

    // Insérer les catégories de preview
    for category in Category.previewMoviesCategories {
        context.insert(category)
    }

    // Insérer les films de preview
    for movie in Movie.previewMovies {
        context.insert(movie)
    }

    // Créer le MockDomainService
    let mockDomainService = MockDomainService(container: container)

    return MovieListView()
        .modelContainer(container)
        .environment(\.domainService, mockDomainService)
}
