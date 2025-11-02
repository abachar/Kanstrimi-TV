//
//  ChannelListView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftData
import SwiftUI

struct ChannelListView: ContentListView {
    typealias Item = LiveChannel

    var contentType: ContentType { .live }

    func cardBuilder(item: LiveChannel) -> some View {
        ChannelCard(channel: item)
    }
}

#Preview {
    let container = try! ModelContainer(
        for: Category.self, LiveChannel.self,
        configurations: ModelConfiguration(isStoredInMemoryOnly: true)
    )

    let context = container.mainContext

    // Insérer les catégories de preview
    for category in Category.previewLiveCategories {
        context.insert(category)
    }

    // Insérer les chaînes de preview
    for channel in LiveChannel.previewChannels {
        context.insert(channel)
    }

    // Créer le MockDomainService
    let mockDomainService = MockDomainService(container: container)

    return ChannelListView()
        .modelContainer(container)
        .environment(\.domainService, mockDomainService)
}
