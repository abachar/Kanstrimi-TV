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
            ZStack {
                // Background semi-transparent
                Color.black.opacity(0.75)
                    .ignoresSafeArea()
                    .onTapGesture {
                        onResetAutoHide()
                    }

                VStack(spacing: 0) {
                    // Header
                    headerSection
                        .padding(.horizontal, 60)
                        .padding(.top, 60)

                    Spacer()

                    // Footer (VOD uniquement)
                    if content.contentType == .vod {
                        footerSection
                            .padding(.horizontal, 60)
                            .padding(.bottom, 60)
                    }
                }
            }
            .transition(.opacity)
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
        VStack(spacing: 30) {
            // Barre de progression
            ProgressBar(
                currentPosition: currentPosition,
                totalDuration: totalDuration,
                isLive: content.contentType == .live,
                onSeek: onSeek
            )

            // Boutons de seek (rewind/forward)
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

            // Boutons de contrôle
            HStack(spacing: 20) {
                // Audio
                OverlayButton(icon: "speaker.wave.2", label: "Audio") {
                    onAudioTapped()
                    onResetAutoHide()
                }

                // Sous-titres
                OverlayButton(icon: "captions.bubble", label: "Sous-titres") {
                    onSubtitlesTapped()
                    onResetAutoHide()
                }

                // Reprendre/Redémarrer
                OverlayButton(icon: "arrow.counterclockwise", label: "Reprendre") {
                    onResumeTapped()
                    onResetAutoHide()
                }

                // Épisode précédent (si série)
                if let onPrevious = onPreviousEpisodeTapped {
                    OverlayButton(icon: "chevron.left", label: "Précédent") {
                        onPrevious()
                        onResetAutoHide()
                    }
                }

                // Épisode suivant (si série)
                if let onNext = onNextEpisodeTapped {
                    OverlayButton(icon: "chevron.right", label: "Suivant") {
                        onNext()
                        onResetAutoHide()
                    }
                }

                // Info
                OverlayButton(icon: "info.circle", label: "Info") {
                    onInfoTapped()
                    onResetAutoHide()
                }
            }
        }
    }

    // MARK: - Helper Methods
    private func seekBy(_ seconds: TimeInterval) {
        guard let onSeek = onSeek else { return }
        let newPosition = max(0, min(currentPosition + seconds, totalDuration))
        onSeek(newPosition)
    }
}

// MARK: - Preview
#Preview {
    let sampleMovie = Movie(
        streamId: 1,
        name: "Inception",
        streamURL: "http://example.com/movie",
        sortOrder: 0,
        streamIcon: "https://via.placeholder.com/300x450",
        rating5based: 4.5
    )

    return ZStack {
        Color.blue
            .ignoresSafeArea()

        PlayerOverlay(
            content: .movie(sampleMovie),
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
    .modelContainer(for: [Movie.self], inMemory: true)
}
