//
//  LiveTVView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI
import SwiftData

struct LiveTVView: View {
    // MARK: - SwiftData Queries
    @Query(sort: \Category.sortOrder) private var categories: [Category]

    // MARK: - Focus State

    // MARK: - Player State
    @State private var selectedChannel: LiveChannel?

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
                            LiveCategoryRow(
                                category: category,
                                selectedChannel: $selectedChannel
                            )
                        }
                    }
                    .padding(.top, 40)
                    .padding(.bottom, 60)
                }
            }
        }
        .ignoresSafeArea(.container, edges: [.horizontal])
        .fullScreenCover(item: $selectedChannel) { channel in
            UniversalPlayerView(content: .liveChannel(channel))
        }
    }
}

#Preview {
    LiveTVView()
        .modelContainer(for: [Category.self, LiveChannel.self], inMemory: true)
}
