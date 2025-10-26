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
    @FocusState.Binding var focusedChannelId: String?

    // MARK: - SwiftData Query
    @Query private var channels: [LiveChannel]

    // MARK: - Init
    init(category: Category, focusedChannelId: FocusState<String?>.Binding) {
        self.category = category
        self._focusedChannelId = focusedChannelId

        // Query filtrée par categoryId avec tri par sortOrder
        let categoryId = category.categoryId ?? ""
        _channels = Query(
            filter: #Predicate<LiveChannel> { channel in
                channel.categoryId == categoryId
            },
            sort: \.sortOrder
        )
    }

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

    LiveCategoryRow(category: sampleCategory, focusedChannelId: $focusedChannelId)
        .modelContainer(for: [LiveChannel.self], inMemory: true)
        .background(Color.kanBackground)
}
