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

    // MARK: - SwiftData Query
    @Query private var movies: [Movie]

    // MARK: - Init
    init(category: MoviesCategory) {
        self.category = category

        // Query filtrée par categoryId avec tri par sortOrder
        let categoryId = category.categoryId ?? ""
        _movies = Query(
            filter: #Predicate<Movie> { movie in
                movie.categoryId == categoryId
            },
            sort: \.sortOrder
        )
    }

    // MARK: - Body
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header : Nom de la catégorie + Badge count
            HStack(spacing: 12) {
                Text(category.name)
                    .font(.system(size: 32, weight: .semibold))
                    .foregroundColor(.primary)

                Text("\(movies.count)")
                    .font(.system(size: 20, weight: .medium))
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 6)
                    .background(
                        Capsule()
                            .fill(Color.gray.opacity(0.3))
                    )
            }
            .padding(.leading, 60)

            // Liste horizontale de films (LazyHStack)
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 24) {
                    ForEach(movies) { movie in
                        MovieCard(movie: movie)
                    }
                }
                .padding(.horizontal, 60)
            }
        }
        .padding(.vertical, 20)
    }
}
