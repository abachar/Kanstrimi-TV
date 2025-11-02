//
//  MovieCategoryRow.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI
import SwiftData

/// Ligne de catégorie avec liste horizontale de films (max 6 visibles)
///
/// ✅ Migration @Observable: Utilise MoviesStore au lieu de @Query
struct MovieCategoryRow: View {
    // MARK: - Properties
    let category: Category

    // MARK: - Environment
    @Environment(AppStore.self) private var appStore

    private var store: MoviesStore {
        appStore.moviesStore
    }

    // ✅ Récupération des films depuis le store
    private var movies: [Movie] {
        store.movies(for: category.categoryId)
    }

    // MARK: - Body
    var body: some View {
        GenericCategoryRowContent(
            categoryName: category.name,
            items: movies
        ) { movie in
            MovieCard(movie: movie)
        }
        .task {
            // Charger les films de cette catégorie si pas encore fait
            if store.moviesByCategory[category.categoryId] == nil {
                await store.loadMovies(for: category.categoryId)
            }
        }
    }
}
