//
//  SearchSeries.swift
//  Kanstrimi TV
//
//  Created by Claude on 27/10/2025.
//

import SwiftUI
import SwiftData

/// Vue de recherche pour les séries
///
/// Affichée en fullScreenCover via double tap Play/Pause dans SeriesView
struct SearchSeries: View {
    // MARK: - Environment
    @Environment(\.dismiss) private var dismiss

    // MARK: - Queries
    @Query(sort: \Series.sortOrder) private var allSeries: [Series]

    // MARK: - State
    @State private var searchText = ""
    @State private var viewModel = SeriesViewModel()

    // MARK: - Computed Properties

    /// Termes de recherche (splitté sur espaces)
    private var searchTerms: [String] {
        searchText.split(separator: " ").map { String($0).lowercased() }
    }

    /// Séries filtrées selon les termes de recherche
    private var filteredSeries: [Series] {
        guard !searchTerms.isEmpty else { return [] }

        return allSeries.filter { series in
            let name = series.name.lowercased()
            // Toutes les termes doivent matcher (AND)
            return searchTerms.allSatisfy { term in
                name.contains(term)
            }
        }
    }

    /// La recherche est active si >= 3 caractères
    private var isSearchActive: Bool {
        searchText.count >= 3
    }

    // MARK: - Body
    var body: some View {
        ZStack {
            Color.black
                .ignoresSafeArea()

            if !isSearchActive {
                // Message initial
                VStack(spacing: 40) {
                    Image(systemName: "magnifyingglass.circle.fill")
                        .font(.system(size: 100))
                        .foregroundColor(.blue)

                    Text("Rechercher une série")
                        .font(.system(size: 60, weight: .bold))
                        .foregroundColor(.primary)

                    Text("Tapez au moins 3 caractères pour rechercher")
                        .font(.title3)
                        .foregroundColor(.secondary)
                }
                .padding(60)
            } else if filteredSeries.isEmpty {
                // Aucun résultat
                VStack(spacing: 40) {
                    Image(systemName: "tv.and.mediabox.slash")
                        .font(.system(size: 100))
                        .foregroundColor(.gray)

                    Text("Aucune série trouvée")
                        .font(.system(size: 48, weight: .bold))
                        .foregroundColor(.primary)

                    Text("pour \"\(searchText)\"")
                        .font(.title2)
                        .foregroundColor(.secondary)
                }
                .padding(60)
            } else {
                // Grille de résultats
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 30) {
                        // Header avec nombre de résultats
                        HStack {
                            Text("\(filteredSeries.count) série\(filteredSeries.count > 1 ? "s" : "") trouvée\(filteredSeries.count > 1 ? "s" : "")")
                                .font(.title2)
                                .foregroundColor(.secondary)
                            Spacer()
                        }
                        .padding(.horizontal, 60)

                        // Grille de séries
                        LazyVGrid(
                            columns: Array(repeating: GridItem(.flexible(), spacing: 30), count: 5),
                            spacing: 30
                        ) {
                            ForEach(filteredSeries) { series in
                                SeriesCard(series: series)
                            }
                        }
                        .padding(.horizontal, 60)
                    }
                    .padding(.top, 40)
                    .padding(.bottom, 60)
                }
            }
        }
        .environment(viewModel)
        .searchable(text: $searchText, prompt: "Rechercher une série...")
        .fullScreenCover(item: $viewModel.selectedSeries) { series in
            SeriesDetailView(series: series)
        }
        .fullScreenCover(item: $viewModel.playingContent) { content in
            UniversalPlayerView(content: content)
        }
    }
}

// MARK: - Previews

#Preview {
    SearchSeries()
        .modelContainer(for: [Series.self], inMemory: true)
}
