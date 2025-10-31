//
//  SeriesCategoryRow.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI
import SwiftData

/// Ligne de catégorie avec liste horizontale de séries (max 6 visibles)
struct SeriesCategoryRow: View {
    // MARK: - Properties
    let category: Category

    // MARK: - SwiftData Query
    @Query private var series: [Series]

    // MARK: - Init
    init(category: Category) {
        self.category = category

        // Query filtrée par categoryId avec tri par sortOrder
        let categoryId = category.categoryId
        _series = Query(
            filter: #Predicate<Series> { series in
                series.categoryId == categoryId
            },
            sort: \.sortOrder
        )
    }

    // MARK: - Body
    var body: some View {
        GenericCategoryRowContent(
            categoryName: category.name,
            items: series
        ) { series in
            SeriesCard(series: series, returnTo: .seriesList)
        }
    }
}
