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
        GenericCategoryRowContent(
            categoryName: liveCategory.name,
            items: channels
        ) { channel in
            ChannelCard(channel: channel)
        }
    }
}
