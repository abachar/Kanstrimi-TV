//
//  SearchView.swift
//  Kanstrimi TV
//
//  Created on 2025-11-02.
//  Protocol et composant générique pour les vues de recherche
//

import SwiftUI
import SwiftData

// MARK: - SearchView Protocol

/// Protocol pour les vues de recherche de contenu
///
/// Fournit une implémentation par défaut du `body` avec logique de recherche complète
protocol SearchView: View {
    associatedtype Item: ShelfItem & Searchable
    associatedtype CardView: View

    /// Type de contenu (live, movies, series)
    var contentType: ContentType { get }

    /// Builder pour créer la carte d'un item
    @ViewBuilder
    func cardBuilder(item: Item) -> CardView
}

// MARK: - Default Implementation

extension SearchView {
    /// Implémentation par défaut du body
    var body: some View {
        SearchContainer<Item, CardView>(contentType: contentType) { item in
            cardBuilder(item: item)
        }
    }
}

// MARK: - SearchContainer

/// Composant interne générique pour la recherche avec @Query dynamique
struct SearchContainer<Item: ShelfItem & Searchable, CardView: View>: View {
    // MARK: - Properties

    let contentType: ContentType
    let cardBuilder: (Item) -> CardView

    // MARK: - State

    @State private var searchText = ""

    // MARK: - Query

    @Query private var filteredItems: [Item]

    // MARK: - Configuration

    private let minCharacters = 3

    // MARK: - Initializer

    init(
        contentType: ContentType,
        @ViewBuilder cardBuilder: @escaping (Item) -> CardView
    ) {
        self.contentType = contentType
        self.cardBuilder = cardBuilder

        // Création du predicate dynamique
        let predicate: Predicate<Item>
        if searchText.count < minCharacters {
            // Aucun résultat si < 3 caractères
            predicate = #Predicate { _ in false }
        } else {
            // Filtrage avec localizedStandardContains (insensible casse + accents) et actif
            predicate = #Predicate { item in
                item.name.localizedStandardContains(searchText) && item.active
            }
        }

        // Initialisation de @Query avec le predicate
        _filteredItems = Query(
            filter: predicate,
            sort: [SortDescriptor(\Item.sortOrder)]
        )
    }

    // MARK: - Computed Properties

    private var isSearchActive: Bool {
        searchText.count >= minCharacters
    }

    private var searchPrompt: String {
        switch contentType {
        case .live: return "Rechercher une chaîne..."
        case .movies: return "Rechercher un film..."
        case .series: return "Rechercher une série..."
        }
    }

    private var initialTitle: String {
        switch contentType {
        case .live: return "Rechercher une chaîne TV"
        case .movies: return "Rechercher un film"
        case .series: return "Rechercher une série"
        }
    }

    private var resultsCountText: String {
        let count = filteredItems.count
        let singular: String
        let plural: String

        switch contentType {
        case .live:
            singular = "chaîne trouvée"
            plural = "chaînes trouvées"
        case .movies:
            singular = "film trouvé"
            plural = "films trouvés"
        case .series:
            singular = "série trouvée"
            plural = "séries trouvées"
        }

        return "\(count) \(count > 1 ? plural : singular)"
    }

    // MARK: - Body

    var body: some View {
        ZStack {
            Color.appBackground
                .ignoresSafeArea()

            if !isSearchActive {
                initialStateView
            } else if filteredItems.isEmpty {
                emptyStateView
            } else {
                resultsGridView
            }
        }
        .searchable(text: $searchText, prompt: searchPrompt)
    }

    // MARK: - Subviews

    /// Vue affichée avant le début de la recherche
    private var initialStateView: some View {
        VStack {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 80))
                .padding(.vertical, 30)

            Text(initialTitle)
                .font(.title3)
                .foregroundColor(.primary)

            Text("Tapez au moins \(minCharacters) caractères pour rechercher")
                .foregroundColor(.secondary)
        }
        .padding(60)
    }

    /// Vue affichée quand aucun résultat n'est trouvé
    private var emptyStateView: some View {
        ContentUnavailableView {
            Label("Aucun résultat", systemImage: contentType.emptyIcon)
        } description: {
            Text("pour \"\(searchText)\"")
        }
    }

    /// Vue affichant la grille de résultats
    private var resultsGridView: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 30) {
                // Header avec nombre de résultats
                HStack {
                    Text(resultsCountText)
                        .font(.title2)
                        .foregroundColor(.secondary)
                    Spacer()
                }
                .padding(.horizontal, 60)

                // Grille de résultats
                LazyVGrid(
                    columns: Array(repeating: GridItem(.flexible(), spacing: 30), count: 5),
                    spacing: 30
                ) {
                    ForEach(filteredItems) { item in
                        cardBuilder(item)
                    }
                }
                .padding(.horizontal, 60)
            }
            .padding(.top, 40)
            .padding(.bottom, 60)
        }
    }
}
