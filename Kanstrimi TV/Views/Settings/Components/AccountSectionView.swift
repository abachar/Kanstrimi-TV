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
    // MARK: - Environment
    @Environment(\.domainService) private var domainService

    // MARK: - Queries
    @Query private var accounts: [Account]

    // MARK: - State
    @State private var showRefreshDialog = false
    @State private var showDeleteDialog = false
    @State private var showSyncProgress = false
    @State private var currentSyncStep: SyncStep = .liveChannels

    // MARK: - Computed Properties
    private var currentAccount: Account? {
        accounts.first
    }

    private var lastSyncText: String {
        guard let lastSyncDate = currentAccount?.lastSyncDate else {
            return "Jamais synchronisé"
        }

        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        formatter.locale = Locale(identifier: "fr_FR")
        return formatter.localizedString(for: lastSyncDate, relativeTo: Date())
    }

    // MARK: - Body
    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            SettingsSectionHeader(icon: "person.circle.fill", title: "Compte")

            if let account = currentAccount {
                // Informations du compte
                VStack(alignment: .leading, spacing: 16) {
                    InfoRow(label: "Nom", value: account.name)
                    InfoRow(label: "Serveur", value: account.serverURL)
                    InfoRow(label: "Dernière synchro", value: lastSyncText)
                }
                .padding(24)
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(Color.appSecondaryBackground)
                )

                // Actions
                HStack(spacing: 20) {
                    Button("Rafraîchir", systemImage: "arrow.clockwise") {
                        showRefreshDialog = true
                    }
                    .confirmationDialog(
                        "Rafraîchir le compte ?",
                        isPresented: $showRefreshDialog,
                        titleVisibility: .visible
                    ) {
                        Button("Confirmer") {
                            handleRefresh()
                        }
                        Button("Annuler", role: .cancel) {}
                    } message: {
                        Text("Toutes les données (chaînes, films, séries) seront supprimées puis re-synchronisées.")
                    }

                    Button("Supprimer", systemImage: "trash", role: .destructive) {
                        showDeleteDialog = true
                    }
                    .confirmationDialog(
                        "Supprimer le compte ?",
                        isPresented: $showDeleteDialog,
                        titleVisibility: .visible
                    ) {
                        Button("Supprimer", role: .destructive) {
                            handleDelete()
                        }
                        Button("Annuler", role: .cancel) {}
                    } message: {
                        Text("Toutes les données (chaînes, films, séries) seront supprimées. Cette action est irréversible.")
                    }
                }
            } else {
                // Aucun compte configuré
                VStack(spacing: 16) {
                    Text("Aucun compte configuré")
                        .font(.system(size: 24, weight: .medium))
                        .foregroundColor(.secondary)

                    Text("Ajoutez un compte depuis l'écran d'accueil")
                        .font(.system(size: 20, weight: .light))
                        .foregroundColor(.secondary)
                }
                .padding(24)
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(Color.gray.opacity(0.3))
                )
            }
        }
        .fullScreenCover(isPresented: $showSyncProgress) {
            SyncProgressView(currentStep: currentSyncStep)
        }
    }

    // MARK: - Actions
    private func handleRefresh() {
        guard let account = currentAccount else { return }

        Task {
            await MainActor.run {
                showSyncProgress = true
                currentSyncStep = .liveChannels
            }

            do {
                try await domainService.refreshAccount(
                    account: account,
                    onStepChange: { step in
                        Task { @MainActor in
                            currentSyncStep = step
                        }
                    }
                )
                await MainActor.run {
                    showSyncProgress = false
                }
            } catch {
                print("⚠️ Erreur lors du rafraîchissement: \(error)")
                await MainActor.run {
                    showSyncProgress = false
                }
            }
        }
    }

    private func handleDelete() {
        guard let account = currentAccount else { return }

        Task {
            await domainService.deleteAccount(account: account)
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
                    .lineLimit(1)
            }
        }
    }
}
