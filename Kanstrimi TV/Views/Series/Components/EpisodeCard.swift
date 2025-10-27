//
//  EpisodeCard.swift
//  Kanstrimi TV
//
//  Created on 2025-10-27.
//

import SwiftUI

/// Carte compacte affichant un épisode
struct EpisodeCard: View {
    // MARK: - Properties
    let episode: Episode
    let onTap: () -> Void
    @FocusState.Binding var focusedEpisodeId: String?

    private var isFocused: Bool {
        focusedEpisodeId == episode.id
    }

    // MARK: - Body
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Cover de l'épisode avec indicateur "vu"
            ZStack(alignment: .topTrailing) {
                AsyncImage(url: URL(string: episode.movieImage ?? "")) { phase in
                    switch phase {
                    case .empty:
                        Color.gray.opacity(0.3)
                            .overlay {
                                ProgressView()
                                    .tint(.secondary)
                            }
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                    case .failure:
                        Color.gray.opacity(0.3)
                            .overlay {
                                Image(systemName: "tv.fill")
                                    .font(.system(size: 30))
                                    .foregroundColor(.secondary)
                            }
                    @unknown default:
                        Color.gray.opacity(0.3)
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
                    .foregroundColor(isFocused ? .blue : .secondary)

                if let title = episode.title, !title.isEmpty {
                    Text(title)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(isFocused ? .primary : .secondary)
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
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(isFocused ? Color.gray.opacity(0.3) : Color.clear)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(isFocused ? Color.blue : Color.clear, lineWidth: 3)
        )
        .scaleEffect(isFocused ? 1.08 : 1.0)
        .animation(.easeInOut(duration: 0.2), value: isFocused)
        .focusable()
        .focused($focusedEpisodeId, equals: episode.id)
        .onTapGesture {
            onTap()
        }
    }
}
