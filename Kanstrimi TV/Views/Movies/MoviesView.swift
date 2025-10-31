//
//  MoviesView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI
import SwiftData

struct MoviesView: View {
    // MARK: - SwiftData Queries
    @Query private var categories: [Category]

    // MARK: - Navigation ViewModel
    @State private var navigationViewModel = MovieNavigationViewModel()

    init() {
        let moviesType = Category.ContentType.movies
        let predicate = #Predicate<Category> { category in
            category.contentType == moviesType
        }
        let descriptor = FetchDescriptor<Category>(
            predicate: predicate,
            sortBy: [SortDescriptor(\.sortOrder)]
        )
        _categories = Query(descriptor)
    }

    // MARK: - Body
    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            if categories.isEmpty {
                // État vide
                ContentUnavailableView {
                    Label("Films", systemImage: "film.slash")
                } description: {
                    Text("Aucun film disponible")
                }
            } else {
                // Liste des catégories avec films
                LazyVStack(spacing: 30) {
                    ForEach(categories) { category in
                        MovieCategoryRow(category: category)
                    }
                }
                .padding(.top, 40)
                .padding(.bottom, 60)
            }
        }
        .ignoresSafeArea(.container, edges: [.horizontal])
        .environment(navigationViewModel)
        .onPlayPauseDoubleTap {
            navigationViewModel.navigateToSearch()
        }
        .fullScreenCover(item: Binding(
            get: {
                // Retourner l'état courant (nil = écran principal)
                navigationViewModel.currentState
            },
            set: { newValue in
                if newValue == nil {
                    navigationViewModel.goBack()
                }
            }
        )) { state in
            navigationDestination(for: state)
        }
    }

    // MARK: - Navigation Destination
    @ViewBuilder
    private func navigationDestination(for state: MovieNavigationState) -> some View {
        switch state {
        case .search:
            SearchMovies()
                .environment(navigationViewModel)

        case .movieDetail(let streamId, _):
            MovieDetailView(streamId: streamId)
                .environment(navigationViewModel)

        case .player(let content, _):
            MediaPlayerView(content: content)
        }
    }
}

/*
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

    MoviesView()
        .modelContainer(container)
        .environment(\.domainService, mockDomainService)
}
*/
