//
//  OverlayButton.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 28/10/2025.
//

import SwiftUI

/// Bouton stylisé pour l'overlay du player
struct OverlayButton: View {
    let icon: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 28))
                    .foregroundColor(.primary)

                Text(label)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            .frame(width: 100, height: 100)
            .background(Color.gray.opacity(0.2))
            .cornerRadius(12)
        }
        .buttonStyle(.plain)
        .hoverEffect(.highlight)
    }
}

// MARK: - Preview
#Preview {
    HStack(spacing: 20) {
        OverlayButton(icon: "speaker.wave.2", label: "Audio") {
            print("Audio tapped")
        }

        OverlayButton(icon: "captions.bubble", label: "Sous-titres") {
            print("Subtitles tapped")
        }

        OverlayButton(icon: "arrow.counterclockwise", label: "Reprendre") {
            print("Resume tapped")
        }

        OverlayButton(icon: "chevron.left", label: "Précédent") {
            print("Previous tapped")
        }

        OverlayButton(icon: "chevron.right", label: "Suivant") {
            print("Next tapped")
        }

        OverlayButton(icon: "info.circle", label: "Info") {
            print("Info tapped")
        }
    }
    .padding(60)
    .background(Color.black)
}
