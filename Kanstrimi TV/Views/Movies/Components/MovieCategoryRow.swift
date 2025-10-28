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
        GenericCategoryRowContent(
            categoryName: category.name,
            items: movies
        ) { movie in
            MovieCard(movie: movie)
        }
    }
}
