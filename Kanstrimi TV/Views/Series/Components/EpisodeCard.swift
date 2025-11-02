//
//  EpisodeCard.swift
//  Kanstrimi TV
//
//  Created on 2025-10-27.
//

import SwiftUI
import NukeUI

/// Carte compacte affichant un épisode
struct EpisodeCard: View {
    // MARK: - Properties
    let episode: Episode
    let onTap: () -> Void

    // MARK: - Body
    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 8) {
                // Cover de l'épisode avec indicateur "vu"
                ZStack(alignment: .topTrailing) {
                    LazyImage(url: URL(string: episode.movieImage ?? "")) { state in
                        if let image = state.image {
                            image
                                .resizable()
                                .aspectRatio(contentMode: .fill)
                        } else if state.isLoading {
                            Color.gray.opacity(0.3)
                                .overlay {
                                    ProgressView()
                                        .tint(.secondary)
                                }
                        } else {
                            Color.gray.opacity(0.3)
                                .overlay {
                                    Image(systemName: "tv.fill")
                                        .font(.system(size: 30))
                                        .foregroundColor(.secondary)
                                }
                        }
                    }
                    .frame(width: 240, height: 135)
                    .cornerRadius(8)
                    .clipped()

                    // Indicateur "vu"
                    WatchedIndicator(isWatched: episode.isWatched)
                        .padding(8)
                }

                // Numéro + Titre
                VStack(alignment: .leading, spacing: 4) {
                    Text("Épisode \(episode.episodeNum)")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.secondary)

                    if let title = episode.title, !title.isEmpty {
                        Text(title)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(.primary)
                            .lineLimit(2)
                    } else {
                        Text("Sans titre")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(.secondary)
                            .italic()
                    }

                    // Durée
                    if let duration = episode.duration {
                        Text(duration)
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)
                    }
                }
                .frame(width: 240, alignment: .leading)
            }
            .hoverEffect(.highlight)
        }
        .buttonStyle(.borderless)
    }
}
