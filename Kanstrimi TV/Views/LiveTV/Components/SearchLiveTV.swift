//
//  SearchLiveTV.swift
//  Kanstrimi TV
//
//  Created by Claude on 27/10/2025.
//

import SwiftUI
import SwiftData

/// Vue de recherche pour les chaînes TV en direct
///
/// Affichée en fullScreenCover via double tap Play/Pause dans LiveTVView
struct SearchLiveTV: View {
    // MARK: - Environment
    @Environment(\.dismiss) private var dismiss
    @Environment(LiveTVViewModel.self) private var viewModel

    // MARK: - Queries
    @Query(sort: \LiveChannel.sortOrder) private var allChannels: [LiveChannel]

    // MARK: - Configuration
    private let configuration = SearchConfiguration(
        title: "Rechercher une chaîne TV",
        searchPrompt: "Rechercher une chaîne...",
        emptyIcon: "tv.slash"
    )

    // MARK: - Body
    var body: some View {
        GenericSearchView(
            allItems: allChannels,
            configuration: configuration
        ) { channel in
            ChannelCard(channel: channel)
        }
    }
}

// MARK: - Previews

#Preview("Empty State") {
    let container = try! ModelContainer(
        for: LiveChannel.self,
        configurations: ModelConfiguration(isStoredInMemoryOnly: true)
    )

    return SearchLiveTV()
        .modelContainer(container)
        .environment(LiveTVViewModel())
}

#Preview("With 5 Results") {
    let container = try! ModelContainer(
        for: LiveChannel.self,
        configurations: ModelConfiguration(isStoredInMemoryOnly: true)
    )

    let context = container.mainContext

    // Insérer 5 chaînes de preview
    for channel in Array(LiveChannel.previewChannels.prefix(5)) {
        context.insert(channel)
    }

    return SearchLiveTV()
        .modelContainer(container)
        .environment(LiveTVViewModel())
}
