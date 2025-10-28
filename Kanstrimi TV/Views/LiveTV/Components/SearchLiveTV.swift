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

#Preview {
    SearchLiveTV()
        .environment(LiveTVViewModel())
}
