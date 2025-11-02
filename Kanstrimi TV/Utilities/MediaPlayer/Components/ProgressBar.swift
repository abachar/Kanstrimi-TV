//
//  ProgressBar.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 28/10/2025.
//

import SwiftUI

/// Composant affichant la barre de progression de lecture (interactive)
/// Affiche 3 barres superposées : background (gris clair), buffer (gris foncé), position (blanc)
struct ProgressBar: View {
    let currentPosition: TimeInterval
    let totalDuration: TimeInterval
    let bufferedDuration: TimeInterval
    let isLive: Bool
    let onSeek: ((TimeInterval) -> Void)?

    @State private var isDragging: Bool = false
    @State private var previewPosition: TimeInterval?

    private var displayPosition: TimeInterval {
        previewPosition ?? currentPosition
    }

    private var progress: Double {
        guard totalDuration > 0 else { return 0 }
        return min(displayPosition / totalDuration, 1.0)
    }

    private var bufferedProgress: Double {
        guard totalDuration > 0 else { return 0 }
        return min(bufferedDuration / totalDuration, 1.0)
    }

    private var currentTimeString: String {
        formatTime(displayPosition)
    }

    private var totalTimeString: String {
        formatTime(totalDuration)
    }

    var body: some View {
        VStack(spacing: 8) {
            // Barre de progression
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    // Background (gris clair)
                    Rectangle()
                        .fill(Color.gray.opacity(0.3))
                        .frame(height: isDragging ? 8 : 6)
                        .cornerRadius(isDragging ? 4 : 3)

                    // Buffer downloaded (gris foncé)
                    Rectangle()
                        .fill(Color.gray.opacity(0.6))
                        .frame(width: geometry.size.width * bufferedProgress, height: isDragging ? 8 : 6)
                        .cornerRadius(isDragging ? 4 : 3)

                    // Current position (blanc)
                    Rectangle()
                        .fill(isDragging ? Color.white.opacity(0.8) : Color.white)
                        .frame(width: geometry.size.width * progress, height: isDragging ? 8 : 6)
                        .cornerRadius(isDragging ? 4 : 3)

                    // Preview indicator (cercle au bout de la barre)
                    if isDragging {
                        Circle()
                            .fill(Color.white)
                            .frame(width: 16, height: 16)
                            .offset(x: geometry.size.width * progress - 8)
                    }
                }
                // Note: DragGesture non disponible sur tvOS
                // Le seek se fera via des boutons dédiés dans l'overlay (Phase 3)
            }
            .frame(height: isDragging ? 8 : 6)
            .animation(.easeOut(duration: 0.2), value: isDragging)

            // Timecodes
            HStack {
                Text(currentTimeString)
                    .font(.caption)
                    .foregroundColor(isDragging ? .primary : .secondary)
                    .fontWeight(isDragging ? .semibold : .regular)

                Spacer()

                if isLive {
                    Text("DIRECT")
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundColor(.red)
                } else {
                    Text(totalTimeString)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
    }

    private func formatTime(_ time: TimeInterval) -> String {
        let hours = Int(time) / 3600
        let minutes = Int(time) / 60 % 60
        let seconds = Int(time) % 60

        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, seconds)
        } else {
            return String(format: "%d:%02d", minutes, seconds)
        }
    }
}
