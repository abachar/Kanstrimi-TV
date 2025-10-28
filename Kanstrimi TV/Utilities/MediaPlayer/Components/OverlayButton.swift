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
