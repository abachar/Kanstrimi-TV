//
//  SettingsButton.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI

/// Bouton réutilisable pour les sections de paramètres avec gestion du focus tvOS
struct SettingsButton: View {
    // MARK: - Properties
    let title: String
    let icon: String?
    let style: ButtonStyle
    let action: () -> Void

    @FocusState.Binding var focusedButton: String?
    let buttonId: String

    // MARK: - Computed Properties
    private var isFocused: Bool {
        focusedButton == buttonId
    }

    // MARK: - Initialization
    init(
        title: String,
        icon: String? = nil,
        style: ButtonStyle = .primary,
        buttonId: String,
        focusedButton: FocusState<String?>.Binding,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.icon = icon
        self.style = style
        self.buttonId = buttonId
        self._focusedButton = focusedButton
        self.action = action
    }

    // MARK: - Body
    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                if let icon = icon {
                    Image(systemName: icon)
                        .font(.system(size: 24, weight: .semibold))
                }

                Text(title)
                    .font(.system(size: 24, weight: .medium))
            }
            .foregroundColor(isFocused ? .primary : style.textColor)
            .padding(.horizontal, 32)
            .padding(.vertical, 16)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isFocused ? style.focusedBackgroundColor : style.backgroundColor)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isFocused ? Color.blue : Color.clear, lineWidth: 3)
            )
            .scaleEffect(isFocused ? 1.05 : 1.0)
            .animation(.easeInOut(duration: 0.2), value: isFocused)
        }
        .buttonStyle(.plain)
        .focusable()
        .focused($focusedButton, equals: buttonId)
    }

    // MARK: - Button Style
    enum ButtonStyle {
        case primary
        case secondary
        case destructive

        var backgroundColor: Color {
            switch self {
            case .primary: return .blue
            case .secondary: return Color(.cyan)
            case .destructive: return .red.opacity(0.2)
            }
        }

        var focusedBackgroundColor: Color {
            switch self {
            case .primary: return .blue
            case .secondary: return Color(.cyan)
            case .destructive: return .red
            }
        }

        var textColor: Color {
            switch self {
            case .primary: return .primary
            case .secondary: return .primary
            case .destructive: return .red
            }
        }
    }
}
