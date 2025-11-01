//
//  InfoSectionView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI

/// Section affichant les informations de l'application
struct InfoSectionView: View {
    // MARK: - Computed Properties
    private var appInfo: AppInfo {
        AppInfo()
    }

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
                HStack(spacing: 16) {
                    Button("Licences Open Source", systemImage: "doc.text") {
                        // TODO: Navigation vers LicensesView
                        print("Show licenses (à implémenter)")
                    }

                    Button("Crédits", systemImage: "star.fill") {
                        // TODO: Navigation vers CreditsView
                        print("Show credits (à implémenter)")
                    }
                }
            }
            .padding(24)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.appSecondaryBackground)
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
