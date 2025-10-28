//
//  SearchSeries.swift
//  Kanstrimi TV
//
//  Created by Claude on 27/10/2025.
//

import SwiftUI
import SwiftData

/// Vue de recherche pour les séries
///
/// Affichée en fullScreenCover via double tap Play/Pause dans SeriesView
struct SearchSeries: View {
    // MARK: - Environment
    @Environment(\.dismiss) private var dismiss
    @Environment(SeriesViewModel.self) private var viewModel

    // MARK: - Queries
    @Query(sort: \Series.sortOrder) private var allSeries: [Series]

    // MARK: - Configuration
    private let configuration = SearchConfiguration(
        title: "Rechercher une série",
        searchPrompt: "Rechercher une série...",
        emptyIcon: "tv.and.mediabox.slash"
    )

    // MARK: - Body
    var body: some View {
        GenericSearchView(
            allItems: allSeries,
            configuration: configuration
        ) { series in
            SeriesCard(series: series)
        }
    }
}

// MARK: - Previews

#Preview {
    SearchSeries()
        .modelContainer(for: [Series.self], inMemory: true)
        .environment(SeriesViewModel())
}
