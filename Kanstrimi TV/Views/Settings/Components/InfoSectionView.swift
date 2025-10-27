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
                VStack(spacing: 16) {
                    Button(action: {
                        // TODO: Navigation vers LicensesView
                        print("Show licenses (à implémenter)")
                    }) {
                        HStack(spacing: 12) {
                            Image(systemName: "doc.text")
                                .font(.system(size: 24, weight: .semibold))
                            Text("Licences Open Source")
                                .font(.system(size: 24, weight: .medium))
                        }
                        .padding(.horizontal, 32)
                        .padding(.vertical, 16)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(Color.cyan)
                        )
                    }
                    .buttonStyle(.plain)
                    .hoverEffect(.highlight)

                    Button(action: {
                        // TODO: Navigation vers CreditsView
                        print("Show credits (à implémenter)")
                    }) {
                        HStack(spacing: 12) {
                            Image(systemName: "star.fill")
                                .font(.system(size: 24, weight: .semibold))
                            Text("Crédits")
                                .font(.system(size: 24, weight: .medium))
                        }
                        .padding(.horizontal, 32)
                        .padding(.vertical, 16)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(Color.cyan)
                        )
                    }
                    .buttonStyle(.plain)
                    .hoverEffect(.highlight)
                }
            }
            .padding(24)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.gray.opacity(0.3))
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
