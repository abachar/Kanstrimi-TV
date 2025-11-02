//
//  ShowListView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftData
import SwiftUI

struct ShowListView: ContentListView {
    typealias Item = Series

    var contentType: ContentType { .series }

    func cardBuilder(item: Series) -> some View {
        SeriesCard(series: item)
    }
}

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

    return ShowListView()
        .modelContainer(container)
        .environment(\.domainService, mockDomainService)
}
