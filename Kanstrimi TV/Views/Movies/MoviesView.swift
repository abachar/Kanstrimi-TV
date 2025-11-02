//
//  MoviesView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI
import SwiftData

/// Vue principale affichant les catégories de films
///
/// ✅ Migration @Observable: Utilise MoviesStore au lieu de @Query
struct MoviesView: View {
    // MARK: - Environment
    @Environment(AppStore.self) private var appStore
    @Environment(\.navigationPath) private var navigationPath

    private var store: MoviesStore {
        appStore.moviesStore
    }

    // MARK: - Body
    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            if store.isLoadingCategories {
                ProgressView("Chargement des catégories...")
                    .padding(60)
            } else if store.activeCategories.isEmpty {
                // État vide
                ContentUnavailableView {
                    Label("Films", systemImage: "film.slash")
                } description: {
                    Text("Aucun film disponible")
                }
            } else {
                // Liste des catégories avec films
                LazyVStack(spacing: 30) {
                    ForEach(store.activeCategories) { category in
                        MovieCategoryRow(category: category)
                    }
                }
                .padding(.top, 40)
                .padding(.bottom, 60)
            }
        }
        .ignoresSafeArea(.container, edges: [.horizontal])
        .onPlayPauseDoubleTap {
            navigationPath.wrappedValue.append(NavigationDestination.searchMovies)
        }
        .refreshable {
            // ✅ Pull-to-refresh
            await store.refresh()
        }
        .task {
            // Charger au premier affichage
            if store.categories.isEmpty {
                await store.loadAll()
            }
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
