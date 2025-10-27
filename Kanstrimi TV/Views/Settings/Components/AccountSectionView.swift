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

    private var liveChannelsCount: Int {
        let descriptor = FetchDescriptor<LiveChannel>()
        return (try? StorageService.shared.fetchCount(descriptor)) ?? 0
    }

    private var moviesCount: Int {
        let descriptor = FetchDescriptor<Movie>()
        return (try? StorageService.shared.fetchCount(descriptor)) ?? 0
    }

    private var seriesCount: Int {
        let descriptor = FetchDescriptor<Series>()
        return (try? StorageService.shared.fetchCount(descriptor)) ?? 0
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

                    Divider()
                        .background(Color.secondary.opacity(0.3))
                        .padding(.vertical, 8)

                    InfoRow(label: "Chaînes", value: "\(liveChannelsCount)")
                    InfoRow(label: "Films", value: "\(moviesCount)")
                    InfoRow(label: "Séries", value: "\(seriesCount)")
                }
                .padding(24)
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(Color.gray.opacity(0.3))
                )

                // Actions
                HStack(spacing: 20) {
                    Button(action: { showRefreshDialog = true }) {
                        HStack(spacing: 12) {
                            Image(systemName: "arrow.clockwise")
                                .font(.system(size: 24, weight: .semibold))
                            Text("Rafraîchir")
                                .font(.system(size: 24, weight: .medium))
                        }
                        .padding(.horizontal, 32)
                        .padding(.vertical, 16)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(Color.blue)
                        )
                    }
                    .buttonStyle(.plain)
                    .hoverEffect(.highlight)
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

                    Button(action: { showDeleteDialog = true }) {
                        HStack(spacing: 12) {
                            Image(systemName: "trash")
                                .font(.system(size: 24, weight: .semibold))
                            Text("Supprimer")
                                .font(.system(size: 24, weight: .medium))
                        }
                        .padding(.horizontal, 32)
                        .padding(.vertical, 16)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(Color.red)
                        )
                    }
                    .buttonStyle(.plain)
                    .hoverEffect(.highlight)
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
                try await DomainService.shared.refreshAccount(
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
            await DomainService.shared.deleteAccount(account: account)
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
