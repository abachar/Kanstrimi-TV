//
//  VLCSubtitleSelector.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 28/10/2025.
//

import SwiftUI

/// Sélecteur de sous-titres pour VLC Player
struct VLCSubtitleSelector: View {
    let subtitleTracks: [(index: Int32, name: String)]
    let currentTrackIndex: Int32?
    let onSelect: (Int32) -> Void
    let onDismiss: () -> Void

    var body: some View {
        ZStack {
            // Background
            Color.black.opacity(0.9)
                .ignoresSafeArea()
                .onTapGesture {
                    onDismiss()
                }

            // Modal content
            VStack(spacing: 30) {
                // Header
                Text("Sous-titres")
                    .font(.title2)
                    .fontWeight(.bold)

                // Track list
                ScrollView {
                    VStack(spacing: 12) {
                        // Option "Aucun"
                        Button(action: {
                            onSelect(-1) // -1 pour désactiver les sous-titres
                            onDismiss()
                        }) {
                            HStack {
                                Text("Aucun")
                                    .foregroundColor(.primary)

                                Spacer()

                                if currentTrackIndex == -1 || currentTrackIndex == nil {
                                    Image(systemName: "checkmark")
                                        .foregroundColor(.blue)
                                }
                            }
                            .padding(.horizontal, 30)
                            .padding(.vertical, 20)
                            .background(Color.gray.opacity(0.2))
                            .cornerRadius(8)
                        }
                        .buttonStyle(.plain)
                        .hoverEffect(.highlight)

                        // Pistes disponibles
                        ForEach(subtitleTracks, id: \.index) { track in
                            Button(action: {
                                onSelect(track.index)
                                onDismiss()
                            }) {
                                HStack {
                                    Text(track.name)
                                        .foregroundColor(.primary)

                                    Spacer()

                                    if track.index == currentTrackIndex {
                                        Image(systemName: "checkmark")
                                            .foregroundColor(.blue)
                                    }
                                }
                                .padding(.horizontal, 30)
                                .padding(.vertical, 20)
                                .background(Color.gray.opacity(0.2))
                                .cornerRadius(8)
                            }
                            .buttonStyle(.plain)
                            .hoverEffect(.highlight)
                        }
                    }
                    .padding(.horizontal, 60)
                }
                .frame(maxHeight: 400)

                // Close button
                Button("Fermer") {
                    onDismiss()
                }
                .buttonStyle(.bordered)
            }
            .frame(width: 800)
            .padding(60)
        }
    }
}

// MARK: - Preview
#Preview {
    VLCSubtitleSelector(
        subtitleTracks: [
            (index: 0, name: "Français"),
            (index: 1, name: "English"),
            (index: 2, name: "Español")
        ],
        currentTrackIndex: 0,
        onSelect: { _ in },
        onDismiss: {}
    )
}
