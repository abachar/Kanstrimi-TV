//
//  SubtitleSelector.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 28/10/2025.
//

import SwiftUI
import AVKit

/// Sélecteur de sous-titres pour AVPlayer
struct SubtitleSelector: View {
    let subtitleTracks: [AVMediaSelectionOption]
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
                Text("Sous-titres")
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundColor(.primary)

                // Liste des pistes
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 12) {
                        // Option "Aucun"
                        subtitleRow(track: nil, label: "Aucun", isSelected: currentTrack == nil)

                        // Pistes disponibles
                        if !subtitleTracks.isEmpty {
                            ForEach(Array(subtitleTracks.enumerated()), id: \.offset) { index, track in
                                subtitleRow(track: track, label: track.displayName, isSelected: track == currentTrack)
                            }
                        }
                    }
                    .padding(.vertical, 20)
                }
                .frame(maxHeight: 400)

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

    private func subtitleRow(track: AVMediaSelectionOption?, label: String, isSelected: Bool) -> some View {
        Button {
            onSelect(track)
            onDismiss()
        } label: {
            HStack {
                Text(label)
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
    SubtitleSelector(
        subtitleTracks: [],
        currentTrack: nil,
        onSelect: { _ in },
        onDismiss: {}
    )
}
