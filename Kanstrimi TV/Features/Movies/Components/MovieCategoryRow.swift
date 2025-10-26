//
//  MovieCategoryRow.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI
import SwiftData

/// Ligne de catégorie avec liste horizontale de films (max 6 visibles)
struct MovieCategoryRow: View {
    // MARK: - Properties
    let category: MoviesCategory
    let movies: [Movie]
    @FocusState.Binding var focusedMovieId: String?

    // MARK: - Body
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header : Nom de la catégorie + Badge count
            HStack(spacing: 12) {
                Text(category.name)
                    .font(.system(size: 32, weight: .semibold))
                    .foregroundColor(.kanTextPrimary)

                Text("\(movies.count)")
                    .font(.system(size: 20, weight: .medium))
                    .foregroundColor(.kanTextSecondary)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 6)
                    .background(
                        Capsule()
                            .fill(Color.kanCardBackground)
                    )
            }
            .padding(.leading, 60)

            // Liste horizontale de films (LazyHStack)
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 24) {
                    ForEach(movies) { movie in
                        MovieCard(movie: movie, focusedMovieId: $focusedMovieId)
                    }
                }
                .padding(.horizontal, 60)
            }
        }
        .padding(.vertical, 20)
    }
}

// MARK: - Preview
#Preview {
    @Previewable @FocusState var focusedMovieId: String?

    let sampleCategory = MoviesCategory(categoryId: "1", name: "Action", sortOrder: 0)

    let sampleMovies = [
        Movie(streamId: 1, name: "Mission Impossible", streamURL: "http://example.com/1", sortOrder: 0, rating5based: 4.5),
        Movie(streamId: 2, name: "John Wick", streamURL: "http://example.com/2", sortOrder: 1, rating5based: 4.8),
        Movie(streamId: 3, name: "Mad Max", streamURL: "http://example.com/3", sortOrder: 2, rating5based: 4.6),
        Movie(streamId: 4, name: "The Matrix", streamURL: "http://example.com/4", sortOrder: 3, rating5based: 4.9),
        Movie(streamId: 5, name: "Inception", streamURL: "http://example.com/5", sortOrder: 4, rating5based: 4.7),
        Movie(streamId: 6, name: "Tenet", streamURL: "http://example.com/6", sortOrder: 5, rating5based: 4.3)
    ]

    MovieCategoryRow(category: sampleCategory, movies: sampleMovies, focusedMovieId: $focusedMovieId)
        .background(Color.kanBackground)
}
