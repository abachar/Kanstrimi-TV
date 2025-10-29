//
//  LiveTVView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftData
import SwiftUI

struct LiveTVView: View {
    // MARK: - SwiftData Queries
    @Query(sort: \LiveCategory.sortOrder) private var liveCategories: [LiveCategory]
    @Query private var channelDetails: [LiveChannelDetails]

    // MARK: - ViewModel
    @State private var viewModel = LiveTVViewModel()

    // MARK: - State
    @State private var showSearchView = false
    @State private var playingContent: PlaybackContent?

    // MARK: - Body
    var body: some View {
        ZStack {
            if liveCategories.isEmpty {
                // État vide
                VStack(spacing: 40) {
                    Text("TV en direct")
                        .font(.system(size: 60, weight: .bold))
                        .foregroundColor(.primary)

                    Text("Aucune chaîne disponible")
                        .font(.title3)
                        .foregroundColor(.secondary)
                }
                .padding(60)
            } else {
                // Liste des catégories avec chaînes
                ScrollView(.vertical, showsIndicators: false) {
                    LazyVStack(spacing: 30) {
                        ForEach(liveCategories) { liveCategory in
                            LiveCategoryRow(liveCategory: liveCategory)
                        }
                    }
                    .padding(.top, 40)
                    .padding(.bottom, 60)
                }
            }
        }
        .ignoresSafeArea(.container, edges: [.horizontal])
        .environment(viewModel)
        .onPlayPauseDoubleTap {
            showSearchView = true
        }
        .fullScreenCover(item: $playingContent) { content in
            MediaPlayerView(content: content)
        }
        .fullScreenCover(isPresented: $showSearchView) {
            SearchLiveTV()
                .environment(viewModel)
        }
        .onChange(of: viewModel.selectedChannel) { _, newChannel in
            if let channel = newChannel,
               let streamId = channel.extractedStreamId,
               let details = channelDetails.first(where: { $0.streamId == streamId }) {
                playingContent = .liveChannel(details)
                viewModel.selectedChannel = nil  // Reset selection
            }
        }
    }
}

#Preview {
    let container = try! ModelContainer(
        for: LiveCategory.self, LiveChannel.self,
        configurations: ModelConfiguration(isStoredInMemoryOnly: true)
    )

    let context = container.mainContext

    // Insérer les catégories de preview
    for category in LiveCategory.previewCategories {
        context.insert(category)
    }

    // Insérer les chaînes de preview
    for channel in LiveChannel.previewChannels {
        context.insert(channel)
    }

    return LiveTVView()
        .modelContainer(container)
}
