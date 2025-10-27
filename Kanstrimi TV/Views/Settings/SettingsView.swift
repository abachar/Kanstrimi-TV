//
//  SettingsView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftData
import SwiftUI

struct SettingsView: View {

    // MARK: - Environment
    @Environment(\.modelContext) private var modelContext

    // MARK: - Queries
    @Query private var accounts: [Account]
    @Query private var playerSettings: [PlayerSettings]

    // MARK: - State
    @FocusState private var focusedButton: String?
    @State private var showDeleteConfirmation = false
    @State private var showSyncProgress = false
    @State private var currentSyncStep: SyncStep = .liveChannels

    // MARK: - Computed Properties
    private var appInfo: AppInfo {
        AppInfo()
    }

    private var currentAccount: Account? {
        accounts.first
    }

    private var currentPlayerSettings: PlayerSettings {
        playerSettings.first ?? PlayerSettings()
    }

    // MARK: - Body
    var body: some View {
        ZStack {
            Color.black
                .ignoresSafeArea()

            HStack(spacing: 0) {
                // Colonne gauche : Informations app + disclaimer
                AppInfoPanel(appInfo: appInfo)
                    .frame(width: 550)

                // Séparateur vertical
                Rectangle()
                    .fill(Color.secondary.opacity(0.2))
                    .frame(width: 1)

                // Colonne droite : Sections de paramètres
                ScrollView(.vertical, showsIndicators: true) {
                    VStack(alignment: .leading, spacing: 40) {
                        // Section Compte
                        AccountSectionView(
                            account: currentAccount,
                            focusedButton: $focusedButton,
                            onRefresh: handleRefreshAccount,
                            onEdit: handleEditAccount,
                            onDelete: handleDeleteAccount
                        )

                        Divider()
                            .background(Color.secondary.opacity(0.3))

                        // Section Lecture
                        PlaybackSectionView(
                            bufferSize: Binding(
                                get: { currentPlayerSettings.bufferSize },
                                set: { newValue in
                                    currentPlayerSettings.bufferSize = newValue
                                    try? StorageService.shared.save()
                                }
                            ),
                            focusedButton: $focusedButton
                        )

                        Divider()
                            .background(Color.secondary.opacity(0.3))

                        // Section Informations
                        InfoSectionView(
                            appInfo: appInfo,
                            focusedButton: $focusedButton,
                            onLicenses: handleShowLicenses,
                            onCredits: handleShowCredits
                        )
                    }
                    .padding(60)
                }
                .frame(maxWidth: .infinity)
            }

            // Overlay de synchronisation
            if showSyncProgress {
                Color.black.opacity(0.7)
                    .ignoresSafeArea()

                SyncProgressView(currentStep: currentSyncStep)
            }

            // Alert de confirmation de suppression
            if showDeleteConfirmation {
                deleteConfirmationAlert
            }
        }
        .onAppear {
            initializePlayerSettingsIfNeeded()
            // focusedButton = "account-refresh"
        }
    }

    // MARK: - Delete Confirmation Alert
    private var deleteConfirmationAlert: some View {
        ZStack {
            Color.black.opacity(0.7)
                .ignoresSafeArea()

            VStack(spacing: 30) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 60))
                    .foregroundColor(.red)

                Text("Supprimer le compte")
                    .font(.system(size: 36, weight: .bold))
                    .foregroundColor(.primary)

                Text(
                    "Toutes les données (chaînes, films, séries) seront supprimées. Cette action est irréversible."
                )
                .font(.system(size: 22))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

                HStack(spacing: 20) {
                    Button("Annuler") {
                        showDeleteConfirmation = false
                    }
                    .font(.system(size: 24, weight: .medium))
                    .foregroundColor(.primary)
                    .padding(.horizontal, 40)
                    .padding(.vertical, 16)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            //.fill(Color.gray.opacity(0.3))
                    )

                    Button("Supprimer") {
                        confirmDeleteAccount()
                    }
                    .font(.system(size: 24, weight: .medium))
                    .foregroundColor(.white)
                    .padding(.horizontal, 40)
                    .padding(.vertical, 16)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(Color.red)
                    )
                }
                .padding(.top, 20)
            }
            .padding(60)
            .background(
                RoundedRectangle(cornerRadius: 24)
                    // .fill(Color.gray.opacity(0.3))
            )
            .frame(maxWidth: 700)
        }
    }

    // MARK: - Actions
    private func handleRefreshAccount() {
        guard let account = currentAccount else { return }

        showSyncProgress = true
        currentSyncStep = .liveChannels

        Task {
            do {
                try await AccountService.shared.refreshAccount(
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

    private func handleEditAccount() {
        // TODO: Navigation vers AccountFormView
        print("Edit account (à implémenter)")
    }

    private func handleDeleteAccount() {
        showDeleteConfirmation = true
    }

    private func confirmDeleteAccount() {
        guard let account = currentAccount else { return }

        // Supprimer toutes les données liées
        let liveChannelsDescriptor = FetchDescriptor<LiveChannel>()
        if let liveChannels = try? StorageService.shared.fetch(liveChannelsDescriptor) {
            liveChannels.forEach { StorageService.shared.context.delete($0) }
        }

        let moviesDescriptor = FetchDescriptor<Movie>()
        if let movies = try? StorageService.shared.fetch(moviesDescriptor) {
            movies.forEach { StorageService.shared.context.delete($0) }
        }

        let seriesDescriptor = FetchDescriptor<Series>()
        if let series = try? StorageService.shared.fetch(seriesDescriptor) {
            series.forEach { StorageService.shared.context.delete($0) }
        }

        // Supprimer les catégories
        let categoriesDescriptor = FetchDescriptor<LiveCategory>()
        if let categories = try? StorageService.shared.fetch(categoriesDescriptor) {
            categories.forEach { StorageService.shared.context.delete($0) }
        }

        let moviesCategoriesDescriptor = FetchDescriptor<MoviesCategory>()
        if let moviesCategories = try? StorageService.shared.fetch(
            moviesCategoriesDescriptor
        ) {
            moviesCategories.forEach { StorageService.shared.context.delete($0) }
        }

        let seriesCategoriesDescriptor = FetchDescriptor<SeriesCategory>()
        if let seriesCategories = try? StorageService.shared.fetch(
            seriesCategoriesDescriptor
        ) {
            seriesCategories.forEach { StorageService.shared.context.delete($0) }
        }

        // Supprimer le compte
        StorageService.shared.context.delete(account)

        // Sauvegarder
        try? StorageService.shared.save()

        showDeleteConfirmation = false
    }

    private func handleShowLicenses() {
        // TODO: Navigation vers LicensesView
        print("Show licenses (à implémenter)")
    }

    private func handleShowCredits() {
        // TODO: Navigation vers CreditsView
        print("Show credits (à implémenter)")
    }

    private func initializePlayerSettingsIfNeeded() {
        if playerSettings.isEmpty {
            let settings = PlayerSettings()
            try? StorageService.shared.insert(settings)
        }
    }
}

// MARK: - Preview
#Preview {
    let container = try! ModelContainer(
        for: Account.self,
        PlayerSettings.self,
        configurations: ModelConfiguration(isStoredInMemoryOnly: true)
    )

    let context = container.mainContext

    // Créer un compte de test
    let account = Account(
        name: "Mon IPTV",
        serverURL: "http://example.com:8080",
        username: "user123",
        password: "pass123"
    )
    account.lastSyncDate = Date()
    context.insert(account)

    // Créer des PlayerSettings de test
    let settings = PlayerSettings(bufferSize: 30)
    context.insert(settings)

    return SettingsView()
        .modelContainer(container)
}
