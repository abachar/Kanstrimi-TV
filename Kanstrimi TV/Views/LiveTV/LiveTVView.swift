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

    // MARK: - ViewModel
    @State private var viewModel = LiveTVViewModel()

    // MARK: - Search State
    @State private var showSearchView = false

    // MARK: - Body
    var body: some View {
        ZStack {
            Color.black
                .ignoresSafeArea()

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
        .fullScreenCover(isPresented: Binding(
            get: { viewModel.selectedChannel != nil || showSearchView },
            set: { if !$0 {
                // Fermer seulement ce qui est ouvert (en priorité inverse)
                if viewModel.selectedChannel != nil {
                    viewModel.selectedChannel = nil
                } else if showSearchView {
                    showSearchView = false
                }
            }}
        )) {
            if let channel = viewModel.selectedChannel {
                MediaPlayerView(content: .liveChannel(channel))
            } else if showSearchView {
                SearchLiveTV()
                    .environment(viewModel)
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
