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
    @Query(sort: \MoviesCategory.sortOrder) private var categories: [MoviesCategory]

    // MARK: - ViewModel
    @State private var viewModel = MoviesViewModel()

    // MARK: - Search State
    @State private var showSearchView = false

    // MARK: - Body
    var body: some View {
        ZStack {
            Color.black
                .ignoresSafeArea()

            if categories.isEmpty {
                // État vide
                VStack(spacing: 40) {
                    Text("Films")
                        .font(.system(size: 60, weight: .bold))
                        .foregroundColor(.primary)

                    Text("Aucun film disponible")
                        .font(.title3)
                        .foregroundColor(.secondary)
                }
                .padding(60)
            } else {
                // Liste des catégories avec films
                ScrollView(.vertical, showsIndicators: false) {
                    LazyVStack(spacing: 30) {
                        ForEach(categories) { category in
                            MovieCategoryRow(category: category)
                        }
                    }
                    .padding(.top, 40)
                    .padding(.bottom, 60)
                }
            }
        }
        .ignoresSafeArea(.container, edges: [.horizontal])
        .environment(viewModel)
        .onPlayPauseDoubleTap {
            showSearchView = true
        }
        .fullScreenCover(isPresented: Binding(
            get: { viewModel.playingContent != nil || viewModel.selectedMovie != nil || showSearchView },
            set: { if !$0 {
                viewModel.playingContent = nil
                viewModel.selectedMovie = nil
                showSearchView = false
            }}
        )) {
            if let content = viewModel.playingContent {
                UniversalPlayerView(content: content)
            } else if let movie = viewModel.selectedMovie {
                MovieDetailView(movie: movie)
                    .environment(viewModel)
            } else if showSearchView {
                SearchMovies()
                    .environment(viewModel)
            }
        }
    }
}

#Preview {
    MoviesView()
        .modelContainer(for: [MoviesCategory.self, Movie.self], inMemory: true)
}
