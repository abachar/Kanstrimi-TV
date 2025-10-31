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
    let episodes: [Episode]
    let onEpisodeTap: (Episode) -> Void

    // MARK: - Body
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Titre de la saison
            HStack(spacing: 12) {
                Text(season.name ?? "Saison \(season.seasonNumber)")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundColor(.primary)

                if let episodeCount = season.episodeCount {
                    Text("• \(episodeCount) épisode\(episodeCount > 1 ? "s" : "")")
                        .font(.system(size: 20))
                        .foregroundColor(.secondary)
                }
            }

            // Liste des épisodes en scroll horizontal
            if episodes.isEmpty {
                Text("Aucun épisode disponible")
                    .font(.system(size: 18))
                    .foregroundColor(.secondary)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 30) {
                        ForEach(episodes) { episode in
                            EpisodeCard(
                                episode: episode,
                                onTap: { onEpisodeTap(episode) }
                            )
                        }
                    }
                }
                .scrollClipDisabled()
            }
        }
    }
}
