//
//  GenericSearchView.swift
//  Kanstrimi TV
//
//  Created on 2025-10-28.
//  Composant de recherche générique réutilisable
//

import SwiftData
import SwiftUI

/// Vue de recherche générique pour tout type de contenu `Searchable`
///
/// Remplace SearchMovies, SearchSeries et SearchLiveTV pour éliminer la duplication de code
struct GenericSearchView<T: Searchable & Identifiable, CardView: View>: View {
    // MARK: - Properties

    /// Tous les items disponibles pour la recherche
    let allItems: [T]

    /// Configuration de la recherche (titres, icônes, etc.)
    let configuration: SearchConfiguration

    /// Builder pour créer la card de chaque item
    let cardBuilder: (T) -> CardView

    /// Nombre de colonnes dans la grille
    let gridColumns: Int

    // MARK: - State
    @State private var searchText = ""

    // MARK: - Computed Properties

    /// Termes de recherche (splitté sur espaces)
    private var searchTerms: [String] {
        searchText.split(separator: " ").map { String($0).lowercased() }
    }

    /// Items filtrés selon les termes de recherche
    private var filteredItems: [T] {
        guard !searchTerms.isEmpty else { return [] }

        return allItems.filter { item in
            let name = item.name.lowercased()
            // Tous les termes doivent matcher (AND)
            return searchTerms.allSatisfy { term in
                name.contains(term)
            }
        }
    }

    /// La recherche est active si >= minCharacters caractères
    private var isSearchActive: Bool {
        searchText.count >= configuration.minCharacters
    }

    // MARK: - Initializer

    init(
        allItems: [T],
        configuration: SearchConfiguration,
        gridColumns: Int = 5,
        @ViewBuilder cardBuilder: @escaping (T) -> CardView
    ) {
        self.allItems = allItems
        self.configuration = configuration
        self.gridColumns = gridColumns
        self.cardBuilder = cardBuilder
    }

    // MARK: - Body
    var body: some View {
        ZStack {
            Color.black
                .ignoresSafeArea()

            if !isSearchActive {
                // Message initial
                initialStateView
            } else if filteredItems.isEmpty {
                // Aucun résultat
                emptyResultsView
            } else {
                // Grille de résultats
                resultsGridView
            }
        }
        .searchable(text: $searchText, prompt: configuration.searchPrompt)
    }

    // MARK: - Subviews

    /// Vue affichée avant le début de la recherche
    private var initialStateView: some View {
        VStack(spacing: 40) {
            Image(systemName: "magnifyingglass.circle.fill")
                .font(.system(size: 100))
                .foregroundColor(.blue)

            Text(configuration.title)
                .font(.system(size: 60, weight: .bold))
                .foregroundColor(.primary)

            Text("Tapez au moins \(configuration.minCharacters) caractères pour rechercher")
                .font(.title3)
                .foregroundColor(.secondary)
        }
        .padding(60)
    }

    /// Vue affichée quand aucun résultat n'est trouvé
    private var emptyResultsView: some View {
        VStack(spacing: 40) {
            Image(systemName: configuration.emptyIcon)
                .font(.system(size: 100))
                .foregroundColor(.gray)

            Text("Aucun résultat")
                .font(.system(size: 48, weight: .bold))
                .foregroundColor(.primary)

            Text("pour \"\(searchText)\"")
                .font(.title2)
                .foregroundColor(.secondary)
        }
        .padding(60)
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
                    columns: Array(
                        repeating: GridItem(.flexible(), spacing: 30), count: gridColumns),
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

    /// Texte du nombre de résultats avec pluralisation
    private var resultsCountText: String {
        let count = filteredItems.count

        // Déterminer le type de contenu à partir du titre de configuration
        if configuration.title.contains("film") {
            return "\(count) film\(count > 1 ? "s" : "") trouvé\(count > 1 ? "s" : "")"
        } else if configuration.title.contains("série") {
            return "\(count) série\(count > 1 ? "s" : "") trouvée\(count > 1 ? "s" : "")"
        } else if configuration.title.contains("chaîne") {
            return "\(count) chaîne\(count > 1 ? "s" : "") trouvée\(count > 1 ? "s" : "")"
        } else {
            return "\(count) résultat\(count > 1 ? "s" : "")"
        }
    }
}
