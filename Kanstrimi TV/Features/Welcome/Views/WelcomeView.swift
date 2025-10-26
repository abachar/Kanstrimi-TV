//
//  WelcomeView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftData
import SwiftUI

struct WelcomeView: View {
    // MARK: - SwiftData
    @Environment(\.modelContext) private var modelContext
    @Query private var accounts: [Account]

    // MARK: - State
    @State private var showForm: Bool = false
    @State private var titleOffset: CGFloat = 0
    @State private var isSyncing: Bool = false
    @State private var currentSyncStep: SyncStep = .liveChannels
    @State private var errorMessage: String? = nil

    // MARK: - Callback
    let onAccountReady: () -> Void

    // MARK: - Computed Properties
    private var hasAccount: Bool {
        !accounts.isEmpty
    }

    // MARK: - Body
    var body: some View {
        ZStack {
            Color.kanBackground
                .ignoresSafeArea()

            // Afficher titre + formulaire (toujours présent)
            HStack(spacing: 0) {
                // Titre "Kanstrimi TV"
                VStack(spacing: 20) {
                    Text("Kanstrimi TV")
                        .font(.system(size: 80, weight: .bold))
                        .foregroundColor(.kanTextPrimary)

                    // Afficher erreur si présente
                    if let errorMessage {
                        Text(errorMessage)
                            .font(.system(size: 24))
                            .foregroundColor(.kanError)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 40)
                            .transition(.opacity)
                    }
                }
                .frame(maxWidth: .infinity)

                // Formulaire d'inscription (si pas de compte)
                if showForm && !isSyncing {
                    AccountFormView { name, serverURL, username, password in
                        createAccount(
                            name: name,
                            serverURL: serverURL,
                            username: username,
                            password: password
                        )
                    }
                    .transition(.opacity)
                    .frame(maxWidth: 800)
                }
            }
            .opacity(isSyncing ? 0.3 : 1.0)  // Effet de transparence pendant la sync

            // Barre de progression (apparaît par le bas)
            if isSyncing {
                VStack {
                    Spacer()
                    SyncProgressView(currentStep: currentSyncStep)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                        .padding(.bottom, 100)
                }
            }
        }
        .ignoresSafeArea()
        .task {
            if hasAccount {
                // Un compte existe : attendre 5 secondes puis passer à MainView
                try? await Task.sleep(nanoseconds: 5_000_000_000)
                onAccountReady()
            } else {
                // Aucun compte : afficher le formulaire avec animation
                try? await Task.sleep(nanoseconds: 500_000_000)  // Petit délai pour l'effet
                withAnimation(.easeInOut(duration: 0.8)) {
                    titleOffset = -300
                    showForm = true
                }
            }
        }
    }

    // MARK: - Create Account
    private func createAccount(
        name: String,
        serverURL: String,
        username: String,
        password: String
    ) {
        // Réinitialiser l'erreur
        errorMessage = nil

        // Afficher la progression (le formulaire se cache automatiquement via isSyncing)
        withAnimation(.easeInOut(duration: 0.5)) {
            isSyncing = true
        }

        Task {
            do {
                // Créer et synchroniser le compte via AccountService
                _ = try await AccountService.shared.createAccount(
                    name: name,
                    serverURL: serverURL,
                    username: username,
                    password: password,
                    modelContext: modelContext,
                    onStepChange: { step in
                        withAnimation(.easeInOut(duration: 0.3)) {
                            currentSyncStep = step
                        }
                    }
                )

                // Succès : transition vers MainView
                onAccountReady()

            } catch let error as XtreamError {
                // Erreur Xtream : afficher message et masquer la progression
                withAnimation(.easeInOut(duration: 0.5)) {
                    isSyncing = false
                    errorMessage = error.errorDescription
                }
            } catch {
                // Erreur générique
                withAnimation(.easeInOut(duration: 0.5)) {
                    isSyncing = false
                    errorMessage = "Erreur inconnue : \(error.localizedDescription)"
                }
            }
        }
    }
}

#Preview {
    WelcomeView {
        print("Account ready, transitioning to MainView")
    }
}
