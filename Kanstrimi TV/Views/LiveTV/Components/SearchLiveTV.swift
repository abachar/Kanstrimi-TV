//
//  SearchLiveTV.swift
//  Kanstrimi TV
//
//  Created by Claude on 27/10/2025.
//

import SwiftUI
import SwiftData

/// Vue de recherche pour les chaînes TV en direct
///
/// Affichée en fullScreenCover via double tap Play/Pause dans LiveTVView
struct SearchLiveTV: View {
    // MARK: - State
    @State private var searchText = ""

    // MARK: - Environment
    @Environment(LiveTVNavigationViewModel.self) private var navigationViewModel

    // MARK: - Query
    @Query private var filteredChannels: [LiveChannel]
    
    // MARK: - Configuration
    private let minCharacters = 3
    
    // MARK: - Initializer
    init() {
        // Création du predicate dynamique
        let predicate: Predicate<LiveChannel>
        if searchText.count < minCharacters {
            // Aucun résultat si < 3 caractères
            predicate = #Predicate { _ in false }
        } else {
            // Filtrage avec localizedStandardContains (insensible casse + accents)
            predicate = #Predicate { channel in
                channel.name.localizedStandardContains(searchText)
            }
        }

        // Initialisation de @Query avec le predicate
        _filteredChannels = Query(
            filter: predicate,
            sort: [SortDescriptor(\LiveChannel.sortOrder)]
        )
    }
    
    // MARK: - Computed Properties
    private var isSearchActive: Bool {
        searchText.count >= minCharacters
    }

    // MARK: - Body
    var body: some View {
        ZStack {
            if !isSearchActive {
                initialStateView
            } else if filteredChannels.isEmpty {
                ContentUnavailableView {
                    Label("Aucun résultat", systemImage: "tv.slash")
                } description: {
                    Text("pour \"\(searchText)\"")
                }
            } else {
                resultsGridView
            }
        }
        .searchable(text: $searchText, prompt: "Rechercher une chaîne...")
    }
    
    // MARK: - Subviews

    /// Vue affichée avant le début de la recherche
    private var initialStateView: some View {
        VStack {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 80))
                .padding(.vertical, 30)

            Text("Rechercher une chaîne TV")
                .font(.title3)
                .foregroundColor(.primary)

            Text("Tapez au moins \(minCharacters) caractères pour rechercher")
                .foregroundColor(.secondary)
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
                    ForEach(filteredChannels) { channel in
                        ChannelCard(channel: channel)
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
        let count = filteredChannels.count
        return "\(count) chaîne\(count > 1 ? "s" : "") trouvée\(count > 1 ? "s" : "")"
    }
}

// MARK: - Previews
#Preview {
    let container = try! ModelContainer(
        for: LiveChannel.self,
        configurations: ModelConfiguration(isStoredInMemoryOnly: true)
    )

    return SearchLiveTV()
        .modelContainer(container)
        .environment(LiveTVNavigationViewModel())
}
