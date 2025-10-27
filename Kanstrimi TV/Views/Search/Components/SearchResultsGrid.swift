//
//  SearchResultsGrid.swift
//  Kanstrimi TV
//
//  Created by Claude on 26/10/2025.
//

import SwiftUI

/// Grille de résultats de recherche unifiée
///
/// Affiche:
/// - EmptySearchView si aucun résultat
/// - Grille des résultats avec UnifiedContentCard (max 30)
/// - ResultLimitIndicator si > 30 résultats
struct SearchResultsGrid: View {

    let searchText: String
    let results: [SearchResult]
    let totalCount: Int
    let onSelect: (SearchResult) -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                if results.isEmpty {
                    // Aucun résultat
                    EmptySearchView(searchText: searchText, contentType: "contenu")
                        .frame(minHeight: 400)
                } else {
                    // Grille de résultats unifiés
                    LazyVGrid(
                        columns: columns,
                        spacing: 30
                    ) {
                        ForEach(results) { result in
                            UnifiedContentCard(result: result, onSelect: onSelect)
                        }
                    }
                    .padding(.horizontal, 60)
                    .padding(.top, 40)

                    // Indicateur si plus de 30 résultats
                    if totalCount > 30 {
                        ResultLimitIndicator(
                            displayedCount: results.count,
                            totalCount: totalCount
                        )
                        .padding(.bottom, 40)
                    }
                }
            }
        }
    }

    // MARK: - Computed Properties

    private var columns: [GridItem] {
        Array(repeating: GridItem(.flexible(), spacing: 30), count: 5)
    }
}
