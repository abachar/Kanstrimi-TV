//
//  AccountSectionView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI
import SwiftData

/// Section affichant les informations du compte et les actions disponibles
struct AccountSectionView: View {
    // MARK: - Properties
    let account: Account?

    @FocusState.Binding var focusedButton: String?

    let onRefresh: () -> Void
    let onEdit: () -> Void
    let onDelete: () -> Void

    // MARK: - Environment
    @Environment(\.modelContext) private var modelContext

    // MARK: - Computed Properties
    private var lastSyncText: String {
        guard let lastSyncDate = account?.lastSyncDate else {
            return "Jamais synchronisé"
        }

        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        formatter.locale = Locale(identifier: "fr_FR")
        return formatter.localizedString(for: lastSyncDate, relativeTo: Date())
    }

    private var liveChannelsCount: Int {
        let descriptor = FetchDescriptor<LiveChannel>()
        return (try? modelContext.fetchCount(descriptor)) ?? 0
    }

    private var moviesCount: Int {
        let descriptor = FetchDescriptor<Movie>()
        return (try? modelContext.fetchCount(descriptor)) ?? 0
    }

    private var seriesCount: Int {
        let descriptor = FetchDescriptor<Series>()
        return (try? modelContext.fetchCount(descriptor)) ?? 0
    }

    // MARK: - Body
    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            SettingsSectionHeader(icon: "person.circle.fill", title: "Compte")

            if let account = account {
                // Informations du compte
                VStack(alignment: .leading, spacing: 16) {
                    InfoRow(label: "Nom", value: account.name)
                    InfoRow(label: "Serveur", value: account.serverURL)
                    InfoRow(label: "Dernière synchro", value: lastSyncText)

                    Divider()
                        .background(Color.kanTextSecondary.opacity(0.3))
                        .padding(.vertical, 8)

                    InfoRow(label: "Chaînes", value: "\(liveChannelsCount)")
                    InfoRow(label: "Films", value: "\(moviesCount)")
                    InfoRow(label: "Séries", value: "\(seriesCount)")
                }
                .padding(24)
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(Color.kanCardBackground)
                )

                // Actions
                HStack(spacing: 20) {
                    SettingsButton(
                        title: "Rafraîchir",
                        icon: "arrow.clockwise",
                        style: .primary,
                        buttonId: "account-refresh",
                        focusedButton: $focusedButton,
                        action: onRefresh
                    )

                    SettingsButton(
                        title: "Modifier",
                        icon: "pencil",
                        style: .secondary,
                        buttonId: "account-edit",
                        focusedButton: $focusedButton,
                        action: onEdit
                    )

                    SettingsButton(
                        title: "Supprimer",
                        icon: "trash",
                        style: .destructive,
                        buttonId: "account-delete",
                        focusedButton: $focusedButton,
                        action: onDelete
                    )
                }
            } else {
                // Aucun compte configuré
                VStack(spacing: 16) {
                    Text("Aucun compte configuré")
                        .font(.system(size: 24, weight: .medium))
                        .foregroundColor(.kanTextSecondary)

                    SettingsButton(
                        title: "Ajouter un compte",
                        icon: "plus.circle",
                        style: .primary,
                        buttonId: "account-add",
                        focusedButton: $focusedButton,
                        action: onEdit
                    )
                }
                .padding(24)
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(Color.kanCardBackground)
                )
            }
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
                    .foregroundColor(.kanTextSecondary)

                Spacer()

                Text(value)
                    .font(.system(size: 22, weight: .regular))
                    .foregroundColor(.kanTextPrimary)
                    .lineLimit(1)
            }
        }
    }
}

// MARK: - Preview
#Preview {
    @Previewable @FocusState var focusedButton: String?

    let container = try! ModelContainer(
        for: Account.self,
        LiveChannel.self,
        Movie.self,
        Series.self,
        configurations: ModelConfiguration(isStoredInMemoryOnly: true)
    )

    let context = container.mainContext

    let sampleAccount = Account(
        name: "Mon IPTV",
        serverURL: "http://example.com:8080",
        username: "user123",
        password: "pass123"
    )
    sampleAccount.lastSyncDate = Date()
    context.insert(sampleAccount)

    return AccountSectionView(
        account: sampleAccount,
        focusedButton: $focusedButton,
        onRefresh: { print("Refresh") },
        onEdit: { print("Edit") },
        onDelete: { print("Delete") }
    )
    .modelContainer(container)
    .padding(60)
    .background(Color.kanBackground)
}
