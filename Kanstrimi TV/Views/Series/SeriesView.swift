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
    @Query(sort: \SeriesCategory.sortOrder) private var categories:
        [SeriesCategory]

    // MARK: - Focus State

    // MARK: - State
    @State private var selectedSeries: Series?

    // MARK: - Body
    var body: some View {
        ZStack {
            Color.black
                .ignoresSafeArea()

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
                            SeriesCategoryRow(
                                category: category,
                                selectedSeries: $selectedSeries
                            )
                        }
                    }
                    .padding(.top, 40)
                    .padding(.bottom, 60)
                }
            }
        }
        .ignoresSafeArea(.container, edges: [.horizontal])
        .fullScreenCover(item: $selectedSeries) { series in
            SeriesDetailView(series: series)
        }
    }
}

#Preview {
    SeriesView()
        .modelContainer(
            for: [SeriesCategory.self, Series.self],
            inMemory: true
        )
}
