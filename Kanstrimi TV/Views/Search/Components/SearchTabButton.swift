//
//  SearchTabButton.swift
//  Kanstrimi TV
//
//  Created by Claude on 26/10/2025.
//

import SwiftUI

/// Bouton de tab de recherche avec count de résultats
///
/// Format: "Films (42)" ou "Films (0)"
/// Gère l'état sélectionné/non-sélectionné et le focus
struct SearchTabButton: View {

    let title: String
    let count: Int
    let isSelected: Bool
    let action: () -> Void
    let isFocused: Bool

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Text(title)
                    .font(.title3)
                    .fontWeight(isSelected ? .bold : .regular)

                Text("(\(count))")
                    .font(.title3)
                    .fontWeight(.regular)
                    .foregroundStyle(Color.secondary)
            }
            .padding(.horizontal, 40)
            .padding(.vertical, 20)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(backgroundColor)
            )
            .foregroundStyle(textColor)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Computed Properties

    private var backgroundColor: Color {
        if isFocused {
            return Color.blue
        } else if isSelected {
            return Color.gray.opacity(0.3)
        } else {
            return Color.clear
        }
    }

    private var textColor: Color {
        if isFocused {
            return .black
        } else if isSelected {
            return Color.primary
        } else {
            return Color.secondary
        }
    }
}

// MARK: - Previews

#Preview {
    VStack(spacing: 20) {
        SearchTabButton(
            title: "Films",
            count: 42,
            isSelected: true,
            action: {},
            isFocused: true
        )

        SearchTabButton(
            title: "Séries",
            count: 0,
            isSelected: false,
            action: {},
            isFocused: false
        )
    }
    .padding()
    .background(Color.black)
}
