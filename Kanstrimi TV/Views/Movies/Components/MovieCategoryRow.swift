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
    let category: Category

    // MARK: - SwiftData Query
    @Query private var movies: [Movie]

    // MARK: - Init
    init(category: Category) {
        self.category = category

        // Query filtrée par categoryId avec tri par sortOrder et filtrage actif
        let categoryId = category.categoryId
        _movies = Query(
            filter: #Predicate<Movie> { movie in
                movie.categoryId == categoryId && movie.active
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
            MovieCard(movie: movie, returnTo: .moviesList)
        }
    }
}
