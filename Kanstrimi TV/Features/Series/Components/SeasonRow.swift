//
//  SeasonRow.swift
//  Kanstrimi TV
//
//  Created on 2025-10-27.
//

import SwiftUI
import SwiftData

/// Affiche une saison avec ses épisodes en scroll horizontal
struct SeasonRow: View {
    // MARK: - Properties
    let season: SeriesSeason
    let onEpisodeTap: (Episode) -> Void
    @FocusState.Binding var focusedEpisodeId: String?

    // MARK: - Environment
    @Environment(\.modelContext) private var modelContext

    // MARK: - State pour les épisodes (chargement manuel)
    @State private var episodes: [Episode] = []

    // MARK: - Initializer
    init(
        season: SeriesSeason,
        onEpisodeTap: @escaping (Episode) -> Void,
        focusedEpisodeId: FocusState<String?>.Binding
    ) {
        self.season = season
        self.onEpisodeTap = onEpisodeTap
        self._focusedEpisodeId = focusedEpisodeId
    }

    // MARK: - Body
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Titre de la saison
            HStack(spacing: 12) {
                Text(season.name ?? "Saison \(season.seasonNumber)")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundColor(.kanTextPrimary)

                if let episodeCount = season.episodeCount {
                    Text("• \(episodeCount) épisode\(episodeCount > 1 ? "s" : "")")
                        .font(.system(size: 20))
                        .foregroundColor(.kanTextSecondary)
                }
            }
            .padding(.horizontal, 60)

            // Liste des épisodes en scroll horizontal
            if episodes.isEmpty {
                Text("Aucun épisode disponible")
                    .font(.system(size: 18))
                    .foregroundColor(.kanTextSecondary)
                    .padding(.horizontal, 60)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 30) {
                        ForEach(episodes) { episode in
                            EpisodeCard(
                                episode: episode,
                                onTap: { onEpisodeTap(episode) },
                                focusedEpisodeId: $focusedEpisodeId
                            )
                        }
                    }
                    .padding(.horizontal, 60)
                }
            }
        }
        .onAppear {
            loadEpisodes()
        }
    }

    // MARK: - Helper Methods

    /// Charge les épisodes de cette saison depuis le ModelContext
    private func loadEpisodes() {
        let seriesId = season.seriesId
        let seasonNumber = season.seasonNumber

        let descriptor = FetchDescriptor<Episode>(
            predicate: #Predicate<Episode> {
                $0.seriesId == seriesId && $0.seasonNumber == seasonNumber
            },
            sortBy: [SortDescriptor(\Episode.episodeNum, order: .forward)]
        )

        do {
            episodes = try modelContext.fetch(descriptor)
            print("📺 [SeasonRow] Épisodes chargés: \(episodes.count) épisodes pour S\(seasonNumber) (seriesId: \(seriesId))")

            // Log des épisodes chargés
            for episode in episodes.prefix(3) {
                print("   - E\(episode.episodeNum): \(episode.title ?? "Sans titre")")
            }
            if episodes.count > 3 {
                print("   ... et \(episodes.count - 3) autres épisodes")
            }
        } catch {
            print("⚠️ [SeasonRow] Erreur lors du chargement des épisodes: \(error)")
            episodes = []
        }
    }
}

// MARK: - Preview
#Preview {
    @Previewable @FocusState var focusedEpisodeId: String?

    let container = try! ModelContainer(
        for: SeriesSeason.self, Episode.self,
        configurations: ModelConfiguration(isStoredInMemoryOnly: true)
    )

    let season = SeriesSeason(
        seriesId: 1,
        seasonNumber: 1,
        name: "Saison 1",
        episodeCount: 7
    )

    let episode1 = Episode(
        seriesId: 1,
        seasonNumber: 1,
        episodeNum: 1,
        episodeId: "1",
        title: "Pilot",
        duration: "58min",
        streamURL: "http://example.com/ep1",
        isWatched: true
    )

    let episode2 = Episode(
        seriesId: 1,
        seasonNumber: 1,
        episodeNum: 2,
        episodeId: "2",
        title: "Cat's in the Bag...",
        duration: "48min",
        streamURL: "http://example.com/ep2",
        isWatched: false
    )

    container.mainContext.insert(season)
    container.mainContext.insert(episode1)
    container.mainContext.insert(episode2)

    return SeasonRow(
        season: season,
        onEpisodeTap: { _ in },
        focusedEpisodeId: $focusedEpisodeId
    )
    .modelContainer(container)
    .background(Color.kanBackground)
}
