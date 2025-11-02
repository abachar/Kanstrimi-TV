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
    let isBuffering: Bool
    let bufferProgress: Double
    let bufferedDuration: TimeInterval
    let playerType: VideoPlayerType

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
        VStack(spacing: 4) {
            HStack {
                Text(content.title)
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundColor(.primary)
                
                Spacer()
                
                // Badge Player Type
                Text(playerType == .avPlayer ? "AVPlayer" : "VLC")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundColor(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(playerType == .avPlayer ? Color.blue.opacity(0.8) : Color.orange.opacity(0.8))
                    .cornerRadius(4)
                
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
            
            HStack {
                if let subtitle = content.subtitle {
                    Text(subtitle)
                        .font(.body)
                        .foregroundColor(.secondary)
                }
                
                Spacer()
                
                // Indicateur de buffering
                if isBuffering {
                    HStack(spacing: 8) {
                        ProgressView()
                            .scaleEffect(0.8)
                        if bufferProgress > 0 {
                            Text("Chargement... \(Int(bufferProgress * 100))%")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        } else {
                            Text("Chargement...")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding(.top, 4)
                }
            }
        }
    }

    // MARK: - Footer Section
    private var footerSection: some View {
        VStack(alignment: .leading, spacing: 30) {
            // Barre de progression (avec buffer intégré)
            ProgressBar(
                currentPosition: currentPosition,
                totalDuration: totalDuration,
                bufferedDuration: bufferedDuration,
                isLive: content.contentType == .live,
                onSeek: onSeek
            )

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
                
                Spacer()
                
                HStack(spacing: 20) {
                    // Audio
                    Button("Audio", systemImage: "waveform") {
                        onAudioTapped()
                        onResetAutoHide()
                    }

                    // Sous-titres
                    Button("Sous-titres", systemImage: "captions.bubble") {
                        onSubtitlesTapped()
                        onResetAutoHide()
                    }

                    // Info
                    Button("Infos", systemImage: "info.circle") {
                        onInfoTapped()
                        onResetAutoHide()
                    }
                }
                .labelStyle(.iconOnly)
                .buttonBorderShape(.circle)
            }
            .font(.caption)
            .buttonStyle(.glass)
            .foregroundColor(.secondary)
        }
    }
}

// MARK: - Previews
#Preview("Live TV") {
    ZStack {
        Color.black
            .ignoresSafeArea()

        PlayerOverlay(
            content: .liveChannel(LiveChannel.previewChannels[1]),
            currentPosition: 0,
            totalDuration: 0,
            isVisible: .constant(true),
            isBuffering: false,
            bufferProgress: 0.0,
            bufferedDuration: 0.0,
            playerType: .vlcPlayer,
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
            isBuffering: false,
            bufferProgress: 0.0,
            bufferedDuration: 2100, // 35 minutes buffered (en avance)
            playerType: .avPlayer,
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
            isBuffering: true,
            bufferProgress: 0.65,
            bufferedDuration: 3000, // 50 minutes buffered
            playerType: .vlcPlayer,
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
