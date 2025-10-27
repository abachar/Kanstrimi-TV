//
//  SearchMovies.swift
//  Kanstrimi TV
//
//  Created by Claude on 27/10/2025.
//

import SwiftUI
import SwiftData

/// Vue de recherche pour les films
///
/// Affichée en fullScreenCover via double tap Play/Pause dans MoviesView
struct SearchMovies: View {
    // MARK: - Environment
    @Environment(\.dismiss) private var dismiss
    @Environment(MoviesViewModel.self) private var viewModel

    // MARK: - Queries
    @Query(sort: \Movie.sortOrder) private var allMovies: [Movie]

    // MARK: - State
    @State private var searchText = ""

    // MARK: - Computed Properties

    /// Termes de recherche (splitté sur espaces)
    private var searchTerms: [String] {
        searchText.split(separator: " ").map { String($0).lowercased() }
    }

    /// Films filtrés selon les termes de recherche
    private var filteredMovies: [Movie] {
        guard !searchTerms.isEmpty else { return [] }

        return allMovies.filter { movie in
            let name = movie.name.lowercased()
            // Toutes les termes doivent matcher (AND)
            return searchTerms.allSatisfy { term in
                name.contains(term)
            }
        }
    }

    /// La recherche est active si >= 3 caractères
    private var isSearchActive: Bool {
        searchText.count >= 3
    }

    // MARK: - Body
    var body: some View {
        ZStack {
            Color.black
                .ignoresSafeArea()

            if !isSearchActive {
                // Message initial
                VStack(spacing: 40) {
                    Image(systemName: "magnifyingglass.circle.fill")
                        .font(.system(size: 100))
                        .foregroundColor(.blue)

                    Text("Rechercher un film")
                        .font(.system(size: 60, weight: .bold))
                        .foregroundColor(.primary)

                    Text("Tapez au moins 3 caractères pour rechercher")
                        .font(.title3)
                        .foregroundColor(.secondary)
                }
                .padding(60)
            } else if filteredMovies.isEmpty {
                // Aucun résultat
                VStack(spacing: 40) {
                    Image(systemName: "film.slash")
                        .font(.system(size: 100))
                        .foregroundColor(.gray)

                    Text("Aucun film trouvé")
                        .font(.system(size: 48, weight: .bold))
                        .foregroundColor(.primary)

                    Text("pour \"\(searchText)\"")
                        .font(.title2)
                        .foregroundColor(.secondary)
                }
                .padding(60)
            } else {
                // Grille de résultats
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 30) {
                        // Header avec nombre de résultats
                        HStack {
                            Text("\(filteredMovies.count) film\(filteredMovies.count > 1 ? "s" : "") trouvé\(filteredMovies.count > 1 ? "s" : "")")
                                .font(.title2)
                                .foregroundColor(.secondary)
                            Spacer()
                        }
                        .padding(.horizontal, 60)

                        // Grille de films
                        LazyVGrid(
                            columns: Array(repeating: GridItem(.flexible(), spacing: 30), count: 5),
                            spacing: 30
                        ) {
                            ForEach(filteredMovies) { movie in
                                MovieCard(movie: movie)
                            }
                        }
                        .padding(.horizontal, 60)
                    }
                    .padding(.top, 40)
                    .padding(.bottom, 60)
                }
            }
        }
        .searchable(text: $searchText, prompt: "Rechercher un film...")
    }
}

// MARK: - Previews

#Preview {
    SearchMovies()
        .modelContainer(for: [Movie.self], inMemory: true)
        .environment(MoviesViewModel())
}
