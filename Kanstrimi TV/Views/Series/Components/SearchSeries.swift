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
    // MARK: - State
    @State private var searchText = ""

    // MARK: - Query
    @Query private var filteredSeries: [Series]

    // MARK: - Configuration
    private let minCharacters = 3

    // MARK: - Initializer
    init() {
        // Création du predicate dynamique
        let predicate: Predicate<Series>
        if searchText.count < minCharacters {
            // Aucun résultat si < 3 caractères
            predicate = #Predicate { _ in false }
        } else {
            // Filtrage avec localizedStandardContains (insensible casse + accents) et actif
            predicate = #Predicate { series in
                series.name.localizedStandardContains(searchText) && series.active
            }
        }

        // Initialisation de @Query avec le predicate
        _filteredSeries = Query(
            filter: predicate,
            sort: [SortDescriptor(\Series.sortOrder)]
        )
    }

    // MARK: - Computed Properties
    private var isSearchActive: Bool {
        searchText.count >= minCharacters
    }

    // MARK: - Body
    var body: some View {
        ZStack {
            Color.appBackground
                .ignoresSafeArea()

            if !isSearchActive {
                initialStateView
            } else if filteredSeries.isEmpty {
                ContentUnavailableView.search
            } else {
                resultsGridView
            }
        }
        .searchable(text: $searchText, prompt: "Rechercher une série...")
    }
    
    // MARK: - Subviews
/// Vue affichée avant le début de la recherche
    private var initialStateView: some View {
        VStack {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 80))
                .padding(.vertical, 30)

            Text("Rechercher une série")
                .font(.title3)
                .foregroundColor(.primary)

            Text("Tapez au moins \(minCharacters) caractères pour rechercher")
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

    /// Texte du nombre de résultats avec pluralisation
    private var resultsCountText: String {
        let count = filteredSeries.count
        return "\(count) série\(count > 1 ? "s" : "") trouvée\(count > 1 ? "s" : "")"
    }
}



// MARK: - Previews

#Preview {
    let container = try! ModelContainer(
        for: Series.self,
        configurations: ModelConfiguration(isStoredInMemoryOnly: true)
    )

    SearchSeries()
        .modelContainer(container)
}
