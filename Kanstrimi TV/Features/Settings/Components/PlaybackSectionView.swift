//
//  PlaybackSectionView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI

/// Section affichant les paramètres de lecture
struct PlaybackSectionView: View {
    // MARK: - Properties
    @Binding var bufferSize: Int
    @FocusState.Binding var focusedButton: String?

    // Options de buffer disponibles (en secondes)
    private let bufferOptions = [5, 10, 20, 30]

    // MARK: - Body
    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            SettingsSectionHeader(icon: "play.circle.fill", title: "Lecture")

            VStack(alignment: .leading, spacing: 20) {
                // Description
                Text("Taille du buffer")
                    .font(.system(size: 24, weight: .medium))
                    .foregroundColor(.kanTextPrimary)

                Text("Taille du buffer avant le démarrage de la lecture. Une valeur plus élevée améliore la stabilité mais augmente le délai de démarrage.")
                    .font(.system(size: 18, weight: .light))
                    .foregroundColor(.kanTextSecondary)
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)

                // Picker horizontal avec boutons
                HStack(spacing: 16) {
                    ForEach(bufferOptions, id: \.self) { option in
                        BufferOptionButton(
                            value: option,
                            isSelected: bufferSize == option,
                            isFocused: focusedButton == "buffer-\(option)",
                            focusedButton: $focusedButton
                        ) {
                            bufferSize = option
                        }
                    }
                }
                .padding(.top, 8)
            }
            .padding(24)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.kanCardBackground)
            )
        }
    }

    // MARK: - Buffer Option Button
    private struct BufferOptionButton: View {
        let value: Int
        let isSelected: Bool
        let isFocused: Bool
        @FocusState.Binding var focusedButton: String?
        let action: () -> Void

        var body: some View {
            Button(action: action) {
                VStack(spacing: 8) {
                    Text("\(value)")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(textColor)

                    Text("sec")
                        .font(.system(size: 16, weight: .regular))
                        .foregroundColor(textColor.opacity(0.8))
                }
                .frame(width: 100, height: 80)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(backgroundColor)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(borderColor, lineWidth: isFocused ? 3 : (isSelected ? 2 : 0))
                )
                .scaleEffect(isFocused ? 1.1 : 1.0)
                .animation(.easeInOut(duration: 0.2), value: isFocused)
            }
            .buttonStyle(.plain)
            .focusable()
            .focused($focusedButton, equals: "buffer-\(value)")
        }

        private var backgroundColor: Color {
            if isFocused {
                return isSelected ? .kanTabSelected : .kanCardBackground.opacity(0.8)
            }
            return isSelected ? .kanTabSelected.opacity(0.5) : .kanBackground
        }

        private var textColor: Color {
            if isFocused || isSelected {
                return .kanOverlayText
            }
            return .kanTextSecondary
        }

        private var borderColor: Color {
            if isFocused {
                return .kanHighlight
            }
            return isSelected ? .kanTabSelected : .clear
        }
    }
}

// MARK: - Preview
#Preview {
    @Previewable @State var bufferSize = 30
    @Previewable @FocusState var focusedButton: String?

    PlaybackSectionView(
        bufferSize: $bufferSize,
        focusedButton: $focusedButton
    )
    .padding(60)
    .background(Color.kanBackground)
}
