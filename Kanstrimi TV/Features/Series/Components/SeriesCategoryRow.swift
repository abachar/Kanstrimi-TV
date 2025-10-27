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
    let category: SeriesCategory
    @FocusState.Binding var focusedSeriesId: String?
    @Binding var selectedSeries: Series?

    // MARK: - SwiftData Query
    @Query private var series: [Series]

    // MARK: - Init
    init(
        category: SeriesCategory,
        focusedSeriesId: FocusState<String?>.Binding,
        selectedSeries: Binding<Series?>
    ) {
        self.category = category
        self._focusedSeriesId = focusedSeriesId
        self._selectedSeries = selectedSeries

        // Query filtrée par categoryId avec tri par sortOrder
        let categoryId = category.categoryId ?? ""
        _series = Query(
            filter: #Predicate<Series> { series in
                series.categoryId == categoryId
            },
            sort: \.sortOrder
        )
    }

    // MARK: - Body
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header : Nom de la catégorie + Badge count
            HStack(spacing: 12) {
                Text(category.name)
                    .font(.system(size: 32, weight: .semibold))
                    .foregroundColor(.kanTextPrimary)

                Text("\(series.count)")
                    .font(.system(size: 20, weight: .medium))
                    .foregroundColor(.kanTextSecondary)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 6)
                    .background(
                        Capsule()
                            .fill(Color.kanCardBackground)
                    )
            }
            .padding(.leading, 60)

            // Liste horizontale de séries (LazyHStack)
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 24) {
                    ForEach(series) { series in
                        SeriesCard(
                            series: series,
                            focusedSeriesId: $focusedSeriesId,
                            selectedSeries: $selectedSeries
                        )
                    }
                }
                .padding(.horizontal, 60)
            }
        }
        .padding(.vertical, 20)
    }
}

// MARK: - Preview
#Preview {
    @Previewable @FocusState var focusedSeriesId: String?
    @Previewable @State var selectedSeries: Series?

    let sampleCategory = SeriesCategory(categoryId: "1", name: "Drama", sortOrder: 0)

    SeriesCategoryRow(category: sampleCategory, focusedSeriesId: $focusedSeriesId, selectedSeries: $selectedSeries)
        .modelContainer(for: [Series.self], inMemory: true)
        .background(Color.kanBackground)
}
