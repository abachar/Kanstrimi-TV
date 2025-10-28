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

    // MARK: - ViewModel
    @State private var viewModel = SeriesViewModel()

    // MARK: - Search State
    @State private var showSearchView = false

    // MARK: - Body
    var body: some View {
        ZStack {
            if categories.isEmpty {
                // État vide
                VStack(spacing: 40) {
                    Text("Séries")
                        .font(.system(size: 60, weight: .bold))
                        .foregroundColor(.primary)

                    Text("Aucune série disponible")
                        .font(.title3)
                        .foregroundColor(.secondary)
                }
                .padding(60)
            } else {
                // Liste des catégories avec séries
                ScrollView(.vertical, showsIndicators: false) {
                    LazyVStack(spacing: 30) {
                        ForEach(categories) { category in
                            SeriesCategoryRow(category: category)
                        }
                    }
                    .padding(.top, 40)
                    .padding(.bottom, 60)
                }
            }
        }
        .ignoresSafeArea(.container, edges: [.horizontal])
        .environment(viewModel)
        .onPlayPauseDoubleTap {
            showSearchView = true
        }
        .fullScreenCover(isPresented: Binding(
            get: { viewModel.playingContent != nil || viewModel.selectedSeries != nil || showSearchView },
            set: { if !$0 {
                // Fermer seulement ce qui est ouvert (en priorité inverse)
                if viewModel.playingContent != nil {
                    viewModel.playingContent = nil
                } else if viewModel.selectedSeries != nil {
                    viewModel.selectedSeries = nil
                } else if showSearchView {
                    showSearchView = false
                }
            }}
        )) {
            if let content = viewModel.playingContent {
                MediaPlayerView(content: content)
            } else if let series = viewModel.selectedSeries {
                SeriesDetailView(series: series)
                    .environment(viewModel)
            } else if showSearchView {
                SearchSeries()
                    .environment(viewModel)
            }
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

    return SeriesView()
        .modelContainer(container)
}
