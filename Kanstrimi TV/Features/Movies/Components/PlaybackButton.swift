//
//  PlaybackButton.swift
//  Kanstrimi TV
//
//  Created on 2025-10-27.
//

import SwiftUI

/// Bouton d'action de lecture (Play, Resume, Restart)
struct PlaybackButton: View {
    // MARK: - Properties
    let title: String
    let icon: String
    let action: () -> Void
    @FocusState.Binding var isFocused: Bool

    // MARK: - Body
    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 24))
                Text(title)
                    .font(.system(size: 20, weight: .semibold))
            }
            .foregroundColor(isFocused ? .kanBackground : .kanTextPrimary)
            .frame(width: 280, height: 70)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isFocused ? Color.kanHighlight : Color.kanCardBackground)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isFocused ? Color.kanHighlight : Color.clear, lineWidth: 3)
            )
            .scaleEffect(isFocused ? 1.05 : 1.0)
            .animation(.easeInOut(duration: 0.2), value: isFocused)
        }
        .buttonStyle(.plain)
        .focusable()
        .focused($isFocused)
    }
}

// MARK: - Preview
#Preview {
    @Previewable @FocusState var isFocused: Bool

    PlaybackButton(
        title: "Lire",
        icon: "play.fill",
        action: {},
        isFocused: $isFocused
    )
    .background(Color.kanBackground)
}
