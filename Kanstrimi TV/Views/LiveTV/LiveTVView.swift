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
    @Query(sort: \Category.sortOrder) private var categories: [Category]

    // MARK: - ViewModel
    @State private var viewModel = LiveTVViewModel()

    // MARK: - Search State
    @State private var showSearchView = false

    // MARK: - Body
    var body: some View {
        ZStack {
            Color.black
                .ignoresSafeArea()

            if categories.isEmpty {
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
                        ForEach(categories) { category in
                            LiveCategoryRow(category: category)
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
        .fullScreenCover(item: $viewModel.selectedChannel) { channel in
            UniversalPlayerView(content: .liveChannel(channel))
        }
        .fullScreenCover(isPresented: $showSearchView) {
            SearchLiveTV()
        }
    }
}

#Preview {
    LiveTVView()
        .modelContainer(for: [Category.self, LiveChannel.self], inMemory: true)
}
