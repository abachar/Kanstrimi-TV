//
//  AudioTrackSelector.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 28/10/2025.
//

import SwiftUI
import AVKit

/// Sélecteur de piste audio pour AVPlayer
struct AudioTrackSelector: View {
    let audioTracks: [AVMediaSelectionOption]
    let currentTrack: AVMediaSelectionOption?
    let onSelect: (AVMediaSelectionOption?) -> Void
    let onDismiss: () -> Void

    var body: some View {
        ZStack {
            // Background semi-transparent
            Color.black.opacity(0.85)
                .ignoresSafeArea()
                .onTapGesture {
                    onDismiss()
                }

            VStack(spacing: 30) {
                // Header
                Text("Piste audio")
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundColor(.primary)

                // Liste des pistes
                if audioTracks.isEmpty {
                    Text("Aucune piste audio disponible")
                        .font(.body)
                        .foregroundColor(.secondary)
                        .padding(40)
                } else {
                    ScrollView(.vertical, showsIndicators: false) {
                        VStack(spacing: 12) {
                            ForEach(Array(audioTracks.enumerated()), id: \.offset) { index, track in
                                audioTrackRow(track: track, isSelected: track == currentTrack)
                            }
                        }
                        .padding(.vertical, 20)
                    }
                    .frame(maxHeight: 400)
                }

                // Bouton Fermer
                Button("Fermer") {
                    onDismiss()
                }
                .buttonStyle(.bordered)
            }
            .padding(60)
            .background(Color.gray.opacity(0.2))
            .cornerRadius(20)
            .frame(width: 800)
        }
    }

    private func audioTrackRow(track: AVMediaSelectionOption, isSelected: Bool) -> some View {
        Button {
            onSelect(track)
            onDismiss()
        } label: {
            HStack {
                Text(track.displayName)
                    .font(.body)
                    .foregroundColor(.primary)

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.blue)
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(isSelected ? Color.blue.opacity(0.2) : Color.clear)
            .cornerRadius(8)
        }
        .buttonStyle(.plain)
        .hoverEffect(.highlight)
    }
}

// MARK: - Preview
#Preview {
    AudioTrackSelector(
        audioTracks: [],
        currentTrack: nil,
        onSelect: { _ in },
        onDismiss: {}
    )
}
