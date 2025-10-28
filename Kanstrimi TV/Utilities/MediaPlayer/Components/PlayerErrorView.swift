//
//  PlayerErrorView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 28/10/2025.
//

import SwiftUI

/// Vue d'erreur affichée en overlay sur le player
struct PlayerErrorView: View {
    let errorMessage: String
    let onRetry: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        ZStack {
            // Background semi-transparent
            Color.black.opacity(0.85)
                .ignoresSafeArea()

            // Error content
            VStack(spacing: 40) {
                // Icon
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 80))
                    .foregroundColor(.red)

                // Title
                Text("Erreur de lecture")
                    .font(.title)
                    .fontWeight(.bold)
                    .foregroundColor(.primary)

                // Error message
                Text(errorMessage)
                    .font(.body)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 60)

                // Actions
                HStack(spacing: 30) {
                    Button(action: onRetry) {
                        HStack {
                            Image(systemName: "arrow.clockwise")
                            Text("Réessayer")
                        }
                        .padding(.horizontal, 40)
                        .padding(.vertical, 20)
                    }
                    .buttonStyle(.bordered)
                    .hoverEffect(.highlight)

                    Button(action: onDismiss) {
                        HStack {
                            Image(systemName: "xmark")
                            Text("Fermer")
                        }
                        .padding(.horizontal, 40)
                        .padding(.vertical, 20)
                    }
                    .buttonStyle(.bordered)
                    .hoverEffect(.highlight)
                }
            }
            .frame(width: 800)
        }
    }
}

// MARK: - Preview
#Preview {
    PlayerErrorView(
        errorMessage: "Le flux vidéo n'a pas pu être chargé. Vérifiez votre connexion Internet et réessayez.",
        onRetry: {},
        onDismiss: {}
    )
}
