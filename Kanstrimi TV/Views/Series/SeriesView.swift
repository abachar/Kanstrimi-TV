//
//  SeriesView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftData
import SwiftUI

struct SeriesView: View {
    // MARK: - SwiftData Queries
    @Query(sort: \SeriesCategory.sortOrder) private var categories: [SeriesCategory]

    // MARK: - Navigation ViewModel
    @State private var navigationViewModel = SeriesNavigationViewModel()

    // MARK: - Body
    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            if categories.isEmpty {
                // État vide
                ContentUnavailableView {
                    Label("Séries", systemImage: "tv.slash")
                } description: {
                    Text("Aucune série disponible")
                }
            } else {
                // Liste des catégories avec séries
                LazyVStack(spacing: 30) {
                    ForEach(categories) { category in
                        SeriesCategoryRow(category: category)
                    }
                }
                .padding(.top, 40)
                .padding(.bottom, 60)
            }
        }
        .ignoresSafeArea(.container, edges: [.horizontal])
        .environment(navigationViewModel)
        .onPlayPauseDoubleTap {
            navigationViewModel.navigateToSearch()
        }
        .fullScreenCover(item: Binding(
            get: {
                // Retourner l'état courant (nil = écran principal)
                navigationViewModel.currentState
            },
            set: { newValue in
                if newValue == nil {
                    navigationViewModel.goBack()
                }
            }
        )) { state in
            navigationDestination(for: state)
        }
    }

    // MARK: - Navigation Destination
    @ViewBuilder
    private func navigationDestination(for state: SeriesNavigationState) -> some View {
        switch state {
        case .search:
            SearchSeries()
                .environment(navigationViewModel)

        case .seriesDetail(let seriesId, _):
            SeriesDetailView(seriesId: seriesId)
                .environment(navigationViewModel)

        case .player(let content, _):
            MediaPlayerView(content: content)
        }
    }
}

#Preview {
    let container = try! ModelContainer(
        for: SeriesCategory.self, Series.self,
        configurations: ModelConfiguration(isStoredInMemoryOnly: true)
    )

    let context = container.mainContext

    // Insérer les catégories de preview
    for category in SeriesCategory.previewCategories {
        context.insert(category)
    }

    // Insérer les séries de preview
    for series in Series.previewSeries {
        context.insert(series)
    }

    // Créer le MockDomainService
    let mockDomainService = MockDomainService(container: container)

    return SeriesView()
        .modelContainer(container)
        .environment(\.domainService, mockDomainService)
}
