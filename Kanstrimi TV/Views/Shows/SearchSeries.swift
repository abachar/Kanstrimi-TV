//
//  ShowSearchView.swift
//  Kanstrimi TV
//
//  Created by Claude on 27/10/2025.
//

import SwiftUI
import SwiftData

/// Vue de recherche pour les séries
///
/// Affichée en fullScreenCover via double tap Play/Pause dans ShowListView
struct ShowSearchView: SearchView {
    typealias Item = Series

    var contentType: ContentType { .series }

    func cardBuilder(item: Series) -> some View {
        SeriesCard(series: item)
    }
}



// MARK: - Previews

#Preview {
    let container = try! ModelContainer(
        for: Series.self,
        configurations: ModelConfiguration(isStoredInMemoryOnly: true)
    )

    ShowSearchView()
        .modelContainer(container)
}
