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
    let series: [Series]
    @FocusState.Binding var focusedSeriesId: String?

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
                        SeriesCard(series: series, focusedSeriesId: $focusedSeriesId)
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

    let sampleCategory = SeriesCategory(categoryId: "1", name: "Drama", sortOrder: 0)

    let sampleSeries = [
        Series(seriesId: 1, name: "Breaking Bad", sortOrder: 0, backdropPaths: nil, rating5based: 4.9, genre: "Drama"),
        Series(seriesId: 2, name: "The Wire", sortOrder: 1, backdropPaths: nil, rating5based: 4.8, genre: "Drama"),
        Series(seriesId: 3, name: "The Sopranos", sortOrder: 2, backdropPaths: nil, rating5based: 4.7, genre: "Drama"),
        Series(seriesId: 4, name: "Mad Men", sortOrder: 3, backdropPaths: nil, rating5based: 4.6, genre: "Drama"),
        Series(seriesId: 5, name: "Better Call Saul", sortOrder: 4, backdropPaths: nil, rating5based: 4.8, genre: "Drama"),
        Series(seriesId: 6, name: "The Crown", sortOrder: 5, backdropPaths: nil, rating5based: 4.5, genre: "Drama")
    ]

    SeriesCategoryRow(category: sampleCategory, series: sampleSeries, focusedSeriesId: $focusedSeriesId)
        .background(Color.kanBackground)
}
