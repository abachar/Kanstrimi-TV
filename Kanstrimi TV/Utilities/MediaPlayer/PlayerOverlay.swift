//
//  PlayerOverlay.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 27/10/2025.
//

import SwiftUI
import SwiftData

/// Overlay du player avec auto-hide et contrôles interactifs
struct PlayerOverlay: View {
    let content: PlaybackContent
    let currentPosition: TimeInterval
    let totalDuration: TimeInterval
    @Binding var isVisible: Bool

    let onResetAutoHide: () -> Void
    let onSeek: ((TimeInterval) -> Void)?
    let onAudioTapped: () -> Void
    let onSubtitlesTapped: () -> Void
    let onResumeTapped: () -> Void
    let onPreviousEpisodeTapped: (() -> Void)?
    let onNextEpisodeTapped: (() -> Void)?
    let onInfoTapped: () -> Void

    var body: some View {
        if isVisible {
            VStack(spacing: 0) {
                Spacer()
                
                VStack() {
                    // Header
                    headerSection

                    // Footer (VOD uniquement)
                    if content.contentType == .vod {
                        footerSection
                    }
                }
                .padding(.top, 40)
                .background(Color.black.opacity(0.6))
            }
            .transition(.opacity)
            .onTapGesture {
                onResetAutoHide()
            }
        }
    }

    // MARK: - Header Section
    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(content.title)
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundColor(.primary)

                    if let subtitle = content.subtitle {
                        Text(subtitle)
                            .font(.body)
                            .foregroundColor(.secondary)
                    }
                }

                Spacer()
                
                // Audio
                Button(action: {
                    onAudioTapped()
                    onResetAutoHide()
                }) {
                    Image(systemName: "speaker.wave.2")
                        .font(.system(size: 28))
                        //.foregroundColor(.primary)
                        //.frame(width: 80, height: 80)
                        //.background(Color.gray.opacity(0.2))
                        //.cornerRadius(12)
                        .hoverEffect(.highlight)
                }
                .buttonStyle(.borderless)

                // Sous-titres
                Button(action: {
                    onSubtitlesTapped()
                    onResetAutoHide()
                }) {
                    Image(systemName: "captions.bubble")
                        .font(.system(size: 28))
                        .hoverEffect(.highlight)
                }
                .buttonStyle(.borderless)

                // Info
                Button(action: {
                    onInfoTapped()
                    onResetAutoHide()
                }) {
                    Image(systemName: "info.circle")
                        .font(.system(size: 28))
                        .hoverEffect(.highlight)
                }
                .buttonStyle(.borderless)

                // Badge LIVE
                if content.contentType == .live {
                    Text("LIVE")
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Color.red)
                        .cornerRadius(4)
                }
            }
        }
    }

    // MARK: - Footer Section
    private var footerSection: some View {
        VStack(alignment: .leading, spacing: 30) {
            // Barre de progression
            ProgressBar(
                currentPosition: currentPosition,
                totalDuration: totalDuration,
                isLive: content.contentType == .live,
                onSeek: onSeek
            )

            // Boutons de seek (rewind/forward)
            /*
            HStack(spacing: 40) {
                // -1min
                Button(action: {
                    seekBy(-60)
                    onResetAutoHide()
                }) {
                    VStack(spacing: 4) {
                        Image(systemName: "gobackward.60")
                            .font(.title)
                        Text("-1 min")
                            .font(.caption)
                    }
                }
                .buttonStyle(.plain)
                .hoverEffect(.highlight)

                // -10s
                Button(action: {
                    seekBy(-10)
                    onResetAutoHide()
                }) {
                    VStack(spacing: 4) {
                        Image(systemName: "gobackward.10")
                            .font(.title)
                        Text("-10s")
                            .font(.caption)
                    }
                }
                .buttonStyle(.plain)
                .hoverEffect(.highlight)

                // +10s
                Button(action: {
                    seekBy(10)
                    onResetAutoHide()
                }) {
                    VStack(spacing: 4) {
                        Image(systemName: "goforward.10")
                            .font(.title)
                        Text("+10s")
                            .font(.caption)
                    }
                }
                .buttonStyle(.plain)
                .hoverEffect(.highlight)

                // +1min
                Button(action: {
                    seekBy(60)
                    onResetAutoHide()
                }) {
                    VStack(spacing: 4) {
                        Image(systemName: "goforward.60")
                            .font(.title)
                        Text("+1 min")
                            .font(.caption)
                    }
                }
                .buttonStyle(.plain)
                .hoverEffect(.highlight)
            }
             */

            // Boutons de contrôle
            HStack(spacing: 20) {
                // Reprendre/Redémarrer
                Button("Reprendre", systemImage: "arrow.counterclockwise"){
                    onResumeTapped()
                    onResetAutoHide()
                }

                // Épisode précédent (si série)
                if let onPrevious = onPreviousEpisodeTapped {
                    Button("Épisode précédent") {
                        onPrevious()
                        onResetAutoHide()
                    }
                }

                // Épisode suivant (si série)
                if let onNext = onNextEpisodeTapped {
                    Button("Épisode suivant"){
                        onNext()
                        onResetAutoHide()
                    }
                }
            }
            .font(.caption)
            .buttonStyle(.glass)
            .foregroundColor(.secondary)
        }
    }

    // MARK: - Helper Methods
    private func seekBy(_ seconds: TimeInterval) {
        guard let onSeek = onSeek else { return }
        let newPosition = max(0, min(currentPosition + seconds, totalDuration))
        onSeek(newPosition)
    }
}

// MARK: - Previews
#Preview("Live TV") {
    ZStack {
        Color.black
            .ignoresSafeArea()

        PlayerOverlay(
            content: .liveChannel(LiveChannelDetails.previewChannelDetails[0]),
            currentPosition: 0,
            totalDuration: 0,
            isVisible: .constant(true),
            onResetAutoHide: {},
            onSeek: nil,
            onAudioTapped: { print("Audio") },
            onSubtitlesTapped: { print("Subtitles") },
            onResumeTapped: { print("Resume") },
            onPreviousEpisodeTapped: nil,
            onNextEpisodeTapped: nil,
            onInfoTapped: { print("Info") }
        )
    }
}

#Preview("Film") {
    ZStack {
        Color.black
            .ignoresSafeArea()

        PlayerOverlay(
            content: .movie(MovieDetail.youreInvitedDetail),
            currentPosition: 1800,
            totalDuration: 7200,
            isVisible: .constant(true),
            onResetAutoHide: {},
            onSeek: { _ in },
            onAudioTapped: { print("Audio") },
            onSubtitlesTapped: { print("Subtitles") },
            onResumeTapped: { print("Resume") },
            onPreviousEpisodeTapped: nil,
            onNextEpisodeTapped: nil,
            onInfoTapped: { print("Info") }
        )
    }
}

#Preview("Série") {
    ZStack {
        AsyncImage(
            url: URL(string: "https://image.tmdb.org/t/p/w1280/qBKrj7WOBo5A4vX4cB4zU5cO5ca.jpg"),
            content: { image in
                image.resizable().scaledToFill()
            },
            placeholder: {
                ProgressView()
            }
        ).ignoresSafeArea()

        PlayerOverlay(
            content: .episode(Episode.previewEpisodes[3]),
            currentPosition: 2400,
            totalDuration: 5580,
            isVisible: .constant(true),
            onResetAutoHide: {},
            onSeek: { _ in },
            onAudioTapped: { print("Audio") },
            onSubtitlesTapped: { print("Subtitles") },
            onResumeTapped: { print("Resume") },
            onPreviousEpisodeTapped: { print("Previous Episode") },
            onNextEpisodeTapped: { print("Next Episode") },
            onInfoTapped: { print("Info") }
        )
    }
}
