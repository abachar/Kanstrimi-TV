//
//  SearchResultsGrid.swift
//  Kanstrimi TV
//
//  Created by Claude on 26/10/2025.
//

import SwiftUI

/// Grille de résultats de recherche générique
///
/// Affiche:
/// - EmptySearchView si aucun résultat
/// - Grille des résultats (max 20)
/// - ResultLimitIndicator si > 20 résultats
struct SearchResultsGrid<Content: View>: View {

    let searchText: String
    let contentType: String // "chaînes", "films", "séries"
    let totalCount: Int
    let displayedCount: Int
    let content: Content

    init(
        searchText: String,
        contentType: String,
        totalCount: Int,
        displayedCount: Int,
        @ViewBuilder content: () -> Content
    ) {
        self.searchText = searchText
        self.contentType = contentType
        self.totalCount = totalCount
        self.displayedCount = displayedCount
        self.content = content()
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                if totalCount == 0 {
                    // Aucun résultat pour ce tab
                    EmptySearchView(searchText: searchText, contentType: contentType)
                        .frame(minHeight: 400)
                } else {
                    // Grille de résultats
                    LazyVGrid(
                        columns: columns,
                        spacing: 40
                    ) {
                        content
                    }
                    .padding(.horizontal, 60)
                    .padding(.top, 40)

                    // Indicateur si plus de 20 résultats
                    if totalCount > 20 {
                        ResultLimitIndicator(
                            displayedCount: displayedCount,
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
        Array(repeating: GridItem(.flexible(), spacing: 40), count: 5)
    }
}

// MARK: - Previews

#Preview("Avec résultats") {
    SearchResultsGrid(
        searchText: "test",
        contentType: "films",
        totalCount: 42,
        displayedCount: 20
    ) {
        ForEach(0..<20, id: \.self) { index in
            RoundedRectangle(cornerRadius: 12)
                // .fill(Color.gray.opacity(0.3))
                .frame(width: 180, height: 270)
                .overlay(Text("Film \(index + 1)"))
        }
    }
    .background(Color.black)
}

#Preview("Aucun résultat") {
    SearchResultsGrid(
        searchText: "xyzabc",
        contentType: "séries",
        totalCount: 0,
        displayedCount: 0
    ) {
        EmptyView()
    }
    .background(Color.black)
}
