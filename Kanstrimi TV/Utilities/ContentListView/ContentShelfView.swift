//
//  ContentShelfView.swift
//  Kanstrimi TV
//
//  Created on 2025-11-02.
//  Composant générique pour afficher une ligne de contenu (shelf/étagère)
//

import SwiftUI
import SwiftData

/// Composant générique pour afficher une ligne de contenu horizontale avec scrolling
///
/// Utilise @Query pour charger automatiquement les items filtrés par catégorie
struct ContentShelfView<Item: ShelfItem, CardView: View>: View {
    // MARK: - Properties

    let category: Category
    let cardBuilder: (Item) -> CardView

    // MARK: - SwiftData Query

    @Query private var items: [Item]

    // MARK: - Init

    init(
        category: Category,
        @ViewBuilder cardBuilder: @escaping (Item) -> CardView
    ) {
        self.category = category
        self.cardBuilder = cardBuilder

        // @Query avec filtrage par categoryId et active
        let categoryId = category.categoryId
        _items = Query(
            filter: #Predicate<Item> { item in
                item.categoryId == categoryId && item.active
            },
            sort: \.sortOrder
        )
    }

    // MARK: - Body

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            // Header : Nom de la catégorie + Badge count
            headerView

            // Liste horizontale scrollable
            scrollableContent
        }
        .padding(.bottom, 20)
    }

    // MARK: - Subviews

    private var headerView: some View {
        HStack(spacing: 12) {
            Text(category.name)
                .font(.system(size: 32, weight: .semibold))
                .foregroundColor(.primary)

            Text("\(items.count)")
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
    }

    private var scrollableContent: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: 40) {
                ForEach(items) { item in
                    cardBuilder(item)
                }
            }
            .padding(.vertical, 20)
            .padding(.horizontal, 60)
        }
        .scrollClipDisabled()
    }
}
