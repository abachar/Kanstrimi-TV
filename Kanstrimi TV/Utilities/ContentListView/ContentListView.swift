//
//  ContentListView.swift
//  Kanstrimi TV
//
//  Created on 2025-11-02.
//  Protocol et composant générique pour afficher une liste de contenu par catégories
//

import SwiftUI
import SwiftData

// MARK: - ContentListView Protocol

/// Protocol pour les vues qui affichent une liste de contenu par catégories
///
/// Fournit une implémentation par défaut du `body` qui utilise ContentListContainer + ContentShelfView
protocol ContentListView: View {
    associatedtype Item: ShelfItem
    associatedtype CardView: View

    /// Type de contenu (live, movies, series)
    var contentType: ContentType { get }

    /// Builder pour créer la carte d'un item
    @ViewBuilder
    func cardBuilder(item: Item) -> CardView
}

// MARK: - Default Implementation

extension ContentListView {
    /// Implémentation par défaut du body
    var body: some View {
        ContentListContainer(contentType: contentType) { category in
            ContentShelfView(category: category) { (item: Item) in
                cardBuilder(item: item)
            }
        }
    }
}

// MARK: - ContentListContainer

/// Composant interne générique pour afficher une liste verticale de catégories
///
/// Utilise @Query pour charger automatiquement les catégories filtrées par type de contenu
struct ContentListContainer<ShelfView: View>: View {
    // MARK: - Properties

    let contentType: ContentType
    let shelfBuilder: (Category) -> ShelfView

    // MARK: - SwiftData Query

    @Query private var categories: [Category]

    // MARK: - Environment

    @Environment(\.navigationPath) private var navigationPath

    // MARK: - Init

    init(
        contentType: ContentType,
        @ViewBuilder shelfBuilder: @escaping (Category) -> ShelfView
    ) {
        self.contentType = contentType
        self.shelfBuilder = shelfBuilder

        // @Query avec filtrage par contentType
        let typeString = contentType.rawValue
        _categories = Query(
            filter: #Predicate<Category> { category in
                category.contentType == typeString && category.active
            },
            sort: [SortDescriptor(\.sortOrder)]
        )
    }

    // MARK: - Body

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            if categories.isEmpty {
                // État vide
                ContentUnavailableView {
                    Label(contentType.emptyLabel, systemImage: contentType.emptyIcon)
                } description: {
                    Text(contentType.emptyDescription)
                }
            } else {
                // Liste des catégories
                LazyVStack(spacing: 30) {
                    ForEach(categories) { category in
                        shelfBuilder(category)
                    }
                }
                .padding(.top, 40)
                .padding(.bottom, 60)
            }
        }
        .ignoresSafeArea(.container, edges: [.horizontal])
        .onPlayPauseDoubleTap {
            navigationPath.wrappedValue.append(contentType.searchDestination)
        }
    }
}
