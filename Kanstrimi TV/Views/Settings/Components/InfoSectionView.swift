//
//  InfoSectionView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI

/// Section affichant les informations de l'application
struct InfoSectionView: View {
    // MARK: - Properties
    let appInfo: AppInfo
    @FocusState.Binding var focusedButton: String?

    let onLicenses: () -> Void
    let onCredits: () -> Void

    // MARK: - Body
    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            SettingsSectionHeader(icon: "info.circle.fill", title: "Informations")

            VStack(alignment: .leading, spacing: 20) {
                // Version et Build
                VStack(alignment: .leading, spacing: 12) {
                    InfoRow(label: "Version", value: appInfo.version)
                    InfoRow(label: "Build", value: appInfo.build)
                }

                Divider()
                    .background(Color.secondary.opacity(0.3))
                    .padding(.vertical, 8)

                // Boutons d'actions
                VStack(spacing: 16) {
                    SettingsButton(
                        title: "Licences Open Source",
                        icon: "doc.text",
                        style: .secondary,
                        buttonId: "info-licenses",
                        focusedButton: $focusedButton,
                        action: onLicenses
                    )

                    SettingsButton(
                        title: "Crédits",
                        icon: "star.fill",
                        style: .secondary,
                        buttonId: "info-credits",
                        focusedButton: $focusedButton,
                        action: onCredits
                    )
                }
            }
            .padding(24)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    // .fill(Color.gray.opacity(0.3))
            )
        }
    }

    // MARK: - Info Row Component
    private struct InfoRow: View {
        let label: String
        let value: String

        var body: some View {
            HStack {
                Text(label)
                    .font(.system(size: 22, weight: .medium))
                    .foregroundColor(.secondary)

                Spacer()

                Text(value)
                    .font(.system(size: 22, weight: .regular))
                    .foregroundColor(.primary)
            }
        }
    }
}

// MARK: - Preview
#Preview {
    @Previewable @FocusState var focusedButton: String?

    InfoSectionView(
        appInfo: AppInfo(),
        focusedButton: $focusedButton,
        onLicenses: { print("Licenses") },
        onCredits: { print("Credits") }
    )
    .padding(60)
    .background(Color.black)
}
