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
                        Color.kanCardBackground
                            .overlay {
                                ProgressView()
                                    .tint(.kanTextSecondary)
                            }
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                    case .failure:
                        Color.kanCardBackground
                            .overlay {
                                Image(systemName: "tv.fill")
                                    .font(.system(size: 30))
                                    .foregroundColor(.kanTextSecondary)
                            }
                    @unknown default:
                        Color.kanCardBackground
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
                    .foregroundColor(isFocused ? .kanHighlight : .kanTextSecondary)

                if let title = episode.title, !title.isEmpty {
                    Text(title)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(isFocused ? .kanTextPrimary : .kanTextSecondary)
                        .lineLimit(2)
                } else {
                    Text("Sans titre")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.kanTextSecondary)
                        .italic()
                }

                // Durée
                if let duration = episode.duration {
                    Text(duration)
                        .font(.system(size: 12))
                        .foregroundColor(.kanTextSecondary)
                }
            }
            .frame(width: 240, alignment: .leading)
        }
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(isFocused ? Color.kanCardBackground : Color.clear)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(isFocused ? Color.kanHighlight : Color.clear, lineWidth: 3)
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

// MARK: - Preview
#Preview {
    @Previewable @FocusState var focusedEpisodeId: String?

    let sampleEpisode = Episode(
        seriesId: 1,
        seasonNumber: 1,
        episodeNum: 1,
        episodeId: "12345",
        title: "Pilot",
        overview: "A high school chemistry teacher diagnosed with cancer...",
        duration: "58min",
        movieImage: "https://via.placeholder.com/240x135",
        streamURL: "http://example.com/episode",
        isWatched: true
    )

    EpisodeCard(
        episode: sampleEpisode,
        onTap: { print("Episode tapped") },
        focusedEpisodeId: $focusedEpisodeId
    )
    .background(Color.kanBackground)
}
