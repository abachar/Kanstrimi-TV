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
    @Query(sort: \Movie.sortOrder) private var allMovies: [Movie]

    // MARK: - Focus State
    @FocusState private var focusedMovieId: String?

    // MARK: - Body
    var body: some View {
        ZStack {
            Color.kanBackground
                .ignoresSafeArea()

            if categories.isEmpty {
                // État vide
                VStack(spacing: 40) {
                    Text("Films")
                        .font(.system(size: 60, weight: .bold))
                        .foregroundColor(.kanTextPrimary)

                    Text("Aucun film disponible")
                        .font(.title3)
                        .foregroundColor(.kanTextSecondary)
                }
                .padding(60)
            } else {
                // Liste des catégories avec films
                ScrollView(.vertical, showsIndicators: false) {
                    LazyVStack(spacing: 30) {
                        ForEach(categories) { category in
                            let movies = allMovies.filter { $0.categoryId == category.categoryId }
                            if !movies.isEmpty {
                                MovieCategoryRow(
                                    category: category,
                                    movies: movies,
                                    focusedMovieId: $focusedMovieId
                                )
                            }
                        }
                    }
                    .padding(.top, 40)
                    .padding(.bottom, 60)
                }
            }
        }
    }
}

#Preview {
    MoviesView()
        .modelContainer(for: [MoviesCategory.self, Movie.self], inMemory: true)
}
