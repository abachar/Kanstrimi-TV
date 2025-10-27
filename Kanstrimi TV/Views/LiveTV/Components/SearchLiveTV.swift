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
    // MARK: - Environment
    @Environment(\.dismiss) private var dismiss

    // MARK: - Queries
    @Query(sort: \LiveChannel.sortOrder) private var allChannels: [LiveChannel]

    // MARK: - State
    @State private var searchText = ""
    @State private var viewModel = LiveTVViewModel()

    // MARK: - Computed Properties

    /// Termes de recherche (splitté sur espaces)
    private var searchTerms: [String] {
        searchText.split(separator: " ").map { String($0).lowercased() }
    }

    /// Chaînes filtrées selon les termes de recherche
    private var filteredChannels: [LiveChannel] {
        guard !searchTerms.isEmpty else { return [] }

        return allChannels.filter { channel in
            let name = channel.name.lowercased()
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

                    Text("Rechercher une chaîne TV")
                        .font(.system(size: 60, weight: .bold))
                        .foregroundColor(.primary)

                    Text("Tapez au moins 3 caractères pour rechercher")
                        .font(.title3)
                        .foregroundColor(.secondary)
                }
                .padding(60)
            } else if filteredChannels.isEmpty {
                // Aucun résultat
                VStack(spacing: 40) {
                    Image(systemName: "tv.slash")
                        .font(.system(size: 100))
                        .foregroundColor(.gray)

                    Text("Aucune chaîne trouvée")
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
                            Text("\(filteredChannels.count) chaîne\(filteredChannels.count > 1 ? "s" : "") trouvée\(filteredChannels.count > 1 ? "s" : "")")
                                .font(.title2)
                                .foregroundColor(.secondary)
                            Spacer()
                        }
                        .padding(.horizontal, 60)

                        // Grille de chaînes
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
        }
        .environment(viewModel)
        .searchable(text: $searchText, prompt: "Rechercher une chaîne...")
        .fullScreenCover(item: $viewModel.selectedChannel) { channel in
            MediaPlayerView(content: .liveChannel(channel))
        }
    }
}

// MARK: - Previews

#Preview {
    SearchLiveTV()
}
