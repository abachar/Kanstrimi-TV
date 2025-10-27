//
//  UniversalPlayerView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 27/10/2025.
//

import SwiftUI
import AVKit

/// Vue principale du player universel
/// Détecte automatiquement le type de player (AVPlayer ou VLC) selon le format
struct UniversalPlayerView: View {
    let content: PlaybackContent
    @Environment(\.dismiss) private var dismiss

    // Détection du type de player
    private var playerType: VideoPlayerType {
        VideoPlayerType.detect(from: content.streamURL)
    }

    // URL du stream
    private var streamURL: URL? {
        URL(string: content.streamURL)
    }

    var body: some View {
        ZStack {
            Color.black
                .ignoresSafeArea()

            if let url = streamURL {
                // Afficher le player approprié selon le format
                switch playerType {
                case .avPlayer:
                    AVPlayerWrapper(url: url)
                        .ignoresSafeArea()

                case .vlcPlayer:
                    VLCPlayerWrapper(url: url)
                        .ignoresSafeArea()
                }
            } else {
                // Erreur : URL invalide
                VStack(spacing: 30) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.system(size: 80))
                        .foregroundColor(.red)

                    Text("URL de stream invalide")
                        .font(.title2)
                        .foregroundColor(.primary)

                    Text(content.streamURL)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 60)

                    Button("Fermer") {
                        dismiss()
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
    }
}

// MARK: - Preview
#Preview {
    let sampleChannel = LiveChannel(
        streamId: 1,
        name: "TF1 HD",
        streamURL: "http://example.com/stream.m3u8",
        categoryId: "1",
        sortOrder: 0
    )

    return UniversalPlayerView(content: .liveChannel(sampleChannel))
}
