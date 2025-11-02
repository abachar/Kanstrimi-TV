//
//  ChannelSearchView.swift
//  Kanstrimi TV
//
//  Created by Claude on 27/10/2025.
//

import SwiftUI
import SwiftData

/// Vue de recherche pour les chaînes TV en direct
///
/// Affichée en fullScreenCover via double tap Play/Pause dans LiveTVView
struct ChannelSearchView: SearchView {
    typealias Item = LiveChannel

    var contentType: ContentType { .live }

    func cardBuilder(item: LiveChannel) -> some View {
        ChannelCard(channel: item)
    }
}

// MARK: - Previews
#Preview {
    let container = try! ModelContainer(
        for: LiveChannel.self,
        configurations: ModelConfiguration(isStoredInMemoryOnly: true)
    )

    ChannelSearchView()
        .modelContainer(container)
}
