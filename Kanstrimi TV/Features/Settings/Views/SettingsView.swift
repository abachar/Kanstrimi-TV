//
//  SettingsView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftData
import SwiftUI

struct SettingsView: View {
    // MARK: - Bindings
    @Binding var resetToWelcome: Bool

    // MARK: - Environment
    @Environment(\.modelContext) private var modelContext

    // MARK: - Queries
    @Query private var accounts: [Account]
    @Query private var playerSettings: [PlayerSettings]
    @Query private var liveChannels: [LiveChannel]
    @Query private var movies: [Movie]
    @Query private var series: [Series]

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
            Color.kanBackground
                .ignoresSafeArea()

            HStack(spacing: 0) {
                // Colonne gauche : Informations app + disclaimer
                AppInfoPanel(appInfo: appInfo)
                    .frame(width: 550)

                // Séparateur vertical
                Rectangle()
                    .fill(Color.kanTextSecondary.opacity(0.2))
                    .frame(width: 1)

                // Colonne droite : Sections de paramètres
                ScrollView(.vertical, showsIndicators: true) {
                    VStack(alignment: .leading, spacing: 40) {
                        // Section Compte
                        AccountSectionView(
                            account: currentAccount,
                            channelsCount: liveChannels.count,
                            moviesCount: movies.count,
                            seriesCount: series.count,
                            focusedButton: $focusedButton,
                            onRefresh: handleRefreshAccount,
                            onEdit: handleEditAccount,
                            onDelete: handleDeleteAccount
                        )

                        Divider()
                            .background(Color.kanTextSecondary.opacity(0.3))

                        // Section Lecture
                        PlaybackSectionView(
                            bufferSize: Binding(
                                get: { currentPlayerSettings.bufferSize },
                                set: { newValue in
                                    currentPlayerSettings.bufferSize = newValue
                                    try? modelContext.save()
                                }
                            ),
                            focusedButton: $focusedButton
                        )

                        Divider()
                            .background(Color.kanTextSecondary.opacity(0.3))

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
            focusedButton = "account-refresh"
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
                    .foregroundColor(.kanError)

                Text("Supprimer le compte")
                    .font(.system(size: 36, weight: .bold))
                    .foregroundColor(.kanTextPrimary)

                Text(
                    "Toutes les données (chaînes, films, séries) seront supprimées. Cette action est irréversible."
                )
                .font(.system(size: 22))
                .foregroundColor(.kanTextSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

                HStack(spacing: 20) {
                    Button("Annuler") {
                        showDeleteConfirmation = false
                    }
                    .font(.system(size: 24, weight: .medium))
                    .foregroundColor(.kanTextPrimary)
                    .padding(.horizontal, 40)
                    .padding(.vertical, 16)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(Color.kanCardBackground)
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
                            .fill(Color.kanError)
                    )
                }
                .padding(.top, 20)
            }
            .padding(60)
            .background(
                RoundedRectangle(cornerRadius: 24)
                    .fill(Color.kanCardBackground)
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
                    modelContext: modelContext,
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
        liveChannels.forEach { modelContext.delete($0) }
        movies.forEach { modelContext.delete($0) }
        series.forEach { modelContext.delete($0) }

        // Supprimer les catégories
        let categoriesDescriptor = FetchDescriptor<Category>()
        if let categories = try? modelContext.fetch(categoriesDescriptor) {
            categories.forEach { modelContext.delete($0) }
        }

        let moviesCategoriesDescriptor = FetchDescriptor<MoviesCategory>()
        if let moviesCategories = try? modelContext.fetch(
            moviesCategoriesDescriptor
        ) {
            moviesCategories.forEach { modelContext.delete($0) }
        }

        let seriesCategoriesDescriptor = FetchDescriptor<SeriesCategory>()
        if let seriesCategories = try? modelContext.fetch(
            seriesCategoriesDescriptor
        ) {
            seriesCategories.forEach { modelContext.delete($0) }
        }

        // Supprimer le compte
        modelContext.delete(account)

        // Sauvegarder
        try? modelContext.save()

        showDeleteConfirmation = false

        // Déclencher le retour à l'écran d'accueil
        resetToWelcome = true
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
            modelContext.insert(settings)
            try? modelContext.save()
        }
    }
}

// MARK: - Preview
#Preview {
    @Previewable @State var resetToWelcome = false

    let container = try! ModelContainer(
        for: Account.self,
        PlayerSettings.self,
        LiveChannel.self,
        Movie.self,
        Series.self,
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

    return SettingsView(resetToWelcome: $resetToWelcome)
        .modelContainer(container)
}
