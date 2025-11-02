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
    @Query private var categories: [Category]

    // MARK: - Environment
    @Environment(\.navigationPath) private var navigationPath

    init() {
        let predicate = #Predicate<Category> { category in
            category.contentType == "series" && category.active
        }
        let descriptor = FetchDescriptor<Category>(
            predicate: predicate,
            sortBy: [SortDescriptor(\.sortOrder)]
        )
        _categories = Query(descriptor)
    }

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
        .onPlayPauseDoubleTap {
            navigationPath.wrappedValue.append(NavigationDestination.searchSeries)
        }
    }
}

/*
#Preview {
    let container = try! ModelContainer(
        for: Category.self, Series.self,
        configurations: ModelConfiguration(isStoredInMemoryOnly: true)
    )

    let context = container.mainContext

    // Insérer les catégories de preview
    for category in Category.previewSeriesCategories {
        context.insert(category)
    }

    // Insérer les séries de preview
    for series in Series.previewSeries {
        context.insert(series)
    }

    // Créer le MockDomainService
    let mockDomainService = MockDomainService(container: container)

    SeriesView()
        .modelContainer(container)
        .environment(\.domainService, mockDomainService)
}
*/
