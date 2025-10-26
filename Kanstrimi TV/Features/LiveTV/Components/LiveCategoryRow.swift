//
//  LiveCategoryRow.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI
import SwiftData

/// Ligne de catégorie avec liste horizontale de chaînes (max 5 visibles)
struct LiveCategoryRow: View {
    // MARK: - Properties
    let category: Category
    let channels: [LiveChannel]
    @FocusState.Binding var focusedChannelId: String?

    // MARK: - Body
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header : Nom de la catégorie + Badge count
            HStack(spacing: 12) {
                Text(category.name)
                    .font(.system(size: 32, weight: .semibold))
                    .foregroundColor(.kanTextPrimary)

                Text("\(channels.count)")
                    .font(.system(size: 20, weight: .medium))
                    .foregroundColor(.kanTextSecondary)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 6)
                    .background(
                        Capsule()
                            .fill(Color.kanCardBackground)
                    )
            }
            .padding(.leading, 60)

            // Liste horizontale de chaînes (LazyHStack)
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 24) {
                    ForEach(channels) { channel in
                        ChannelCard(channel: channel, focusedChannelId: $focusedChannelId)
                    }
                }
                .padding(.horizontal, 60)
            }
        }
        .padding(.vertical, 20)
    }
}

// MARK: - Preview
#Preview {
    @Previewable @FocusState var focusedChannelId: String?

    let sampleCategory = Category(categoryId: "1", name: "Sport", sortOrder: 0)

    let sampleChannels = [
        LiveChannel(streamId: 1, name: "BeIN Sports 1", streamURL: "http://example.com/1", categoryId: "1", sortOrder: 0),
        LiveChannel(streamId: 2, name: "Eurosport 1", streamURL: "http://example.com/2", categoryId: "1", sortOrder: 1),
        LiveChannel(streamId: 3, name: "L'Équipe", streamURL: "http://example.com/3", categoryId: "1", sortOrder: 2),
        LiveChannel(streamId: 4, name: "RMC Sport 1", streamURL: "http://example.com/4", categoryId: "1", sortOrder: 3),
        LiveChannel(streamId: 5, name: "Canal+ Sport", streamURL: "http://example.com/5", categoryId: "1", sortOrder: 4)
    ]

    LiveCategoryRow(category: sampleCategory, channels: sampleChannels, focusedChannelId: $focusedChannelId)
        .background(Color.kanBackground)
}
