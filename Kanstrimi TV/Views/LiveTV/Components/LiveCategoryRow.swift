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
    let liveCategory: LiveCategory

    // MARK: - SwiftData Query
    @Query private var channels: [LiveChannel]

    // MARK: - Init
    init(liveCategory: LiveCategory) {
        self.liveCategory = liveCategory

        // Query filtrée par categoryId avec tri par sortOrder
        let categoryId = liveCategory.categoryId ?? ""
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
                Text(liveCategory.name)
                    .font(.system(size: 32, weight: .semibold))
                    .foregroundColor(.primary)

                Text("\(channels.count)")
                    .font(.system(size: 20, weight: .medium))
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 6)
                    .background(
                        Capsule()
                            .fill(Color.gray.opacity(0.3))
                    )
            }
            .padding(.leading, 60)

            // Liste horizontale de chaînes (LazyHStack)
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 24) {
                    ForEach(channels) { channel in
                        ChannelCard(channel: channel)
                    }
                }
                .padding(.horizontal, 60)
            }
        }
        .padding(.vertical, 20)
    }
}
