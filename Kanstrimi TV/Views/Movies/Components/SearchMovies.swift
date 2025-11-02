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
///
/// ✅ Migration @Observable: Utilise MoviesStore au lieu de @Query
/// Résout le problème du predicate figé qui empêchait la recherche de fonctionner
struct SearchMovies: View {
    // MARK: - Environment
    @Environment(AppStore.self) private var appStore

    private var store: MoviesStore {
        appStore.moviesStore
    }

    // MARK: - Configuration
    private let minCharacters = 3

    // MARK: - Computed Properties
    private var isSearchActive: Bool {
        store.searchText.count >= minCharacters
    }

    // MARK: - Body
    var body: some View {
        ZStack {
            Color.appBackground
                .ignoresSafeArea()

            if !isSearchActive {
                initialStateView
            } else if store.filteredMovies.isEmpty {
                ContentUnavailableView {
                    Label("Aucun résultat", systemImage: "film.slash")
                } description: {
                    Text("pour \"\(store.searchText)\"")
                }
            } else {
                resultsGridView
            }
        }
        .searchable(
            text: Binding(
                get: { store.searchText },
                set: { store.updateSearchText($0) }
            ),
            prompt: "Rechercher un film..."
        )
        .task {
            // Charger tous les films si pas encore fait
            if store.moviesByCategory.isEmpty {
                await store.loadAll()
            }
        }
    }
    
    // MARK: - Subviews

    /// Vue affichée avant le début de la recherche
    private var initialStateView: some View {
        VStack {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 80))
                .padding(.vertical, 30)

            Text("Rechercher un film")
                .font(.title3)
                .foregroundColor(.primary)

            Text("Tapez au moins \(minCharacters) caractères pour rechercher")
                .foregroundColor(.secondary)
        }
        .padding(60)
    }

    /// Vue affichant la grille de résultats
    private var resultsGridView: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 30) {
                // Header avec nombre de résultats
                HStack {
                    Text(resultsCountText)
                        .font(.title2)
                        .foregroundColor(.secondary)
                    Spacer()
                }
                .padding(.horizontal, 60)

                // Grille de résultats
                LazyVGrid(
                    columns: Array(repeating: GridItem(.flexible(), spacing: 30), count: 5),
                    spacing: 30
                ) {
                    ForEach(store.filteredMovies) { movie in
                        Button {
                            Task {
                                await store.selectMovie(movie)
                            }
                        } label: {
                            MovieCard(movie: movie)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 60)
            }
            .padding(.top, 40)
            .padding(.bottom, 60)
        }
    }

    /// Texte du nombre de résultats avec pluralisation
    private var resultsCountText: String {
        let count = store.filteredMovies.count
        return "\(count) film\(count > 1 ? "s" : "") trouvé\(count > 1 ? "s" : "")"
    }
}

// MARK: - Previews

#Preview {
    let container = try! ModelContainer(
        for: Movie.self,
        configurations: ModelConfiguration(isStoredInMemoryOnly: true)
    )

    SearchMovies()
        .modelContainer(container)
}
