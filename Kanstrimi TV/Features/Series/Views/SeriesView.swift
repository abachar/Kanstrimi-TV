//
//  SeriesView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI
import SwiftData

struct SeriesView: View {
    // MARK: - SwiftData Queries
    @Query(sort: \SeriesCategory.sortOrder) private var categories: [SeriesCategory]

    // MARK: - Focus State
    @FocusState private var focusedSeriesId: String?

    // MARK: - Navigation State
    @State private var navigationPath = NavigationPath()

    // MARK: - Body
    var body: some View {
        NavigationStack(path: $navigationPath) {
            ZStack {
                Color.kanBackground
                    .ignoresSafeArea()

                if categories.isEmpty {
                    // État vide
                    VStack(spacing: 40) {
                        Text("Séries")
                            .font(.system(size: 60, weight: .bold))
                            .foregroundColor(.kanTextPrimary)

                        Text("Aucune série disponible")
                            .font(.title3)
                            .foregroundColor(.kanTextSecondary)
                    }
                    .padding(60)
                } else {
                    // Liste des catégories avec séries
                    ScrollView(.vertical, showsIndicators: false) {
                        LazyVStack(spacing: 30) {
                            ForEach(categories) { category in
                                SeriesCategoryRow(
                                    category: category,
                                    onSeriesTap: { series in
                                        navigationPath.append(series)
                                    },
                                    focusedSeriesId: $focusedSeriesId
                                )
                            }
                        }
                        .padding(.top, 40)
                        .padding(.bottom, 60)
                    }
                }
            }
            .navigationDestination(for: Series.self) { series in
                SeriesDetailView(series: series)
            }
        }
    }
}

#Preview {
    SeriesView()
        .modelContainer(for: [SeriesCategory.self, Series.self], inMemory: true)
}
