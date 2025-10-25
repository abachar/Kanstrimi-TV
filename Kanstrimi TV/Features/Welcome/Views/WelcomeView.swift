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

            HStack(spacing: 0) {
                // Titre "Kanstrimi TV"
                VStack(spacing: 20) {
                    Text("Kanstrimi TV")
                        .font(.system(size: 80, weight: .bold))
                        .foregroundColor(.kanTextPrimary)
                }
                .frame(maxWidth: .infinity)

                // Formulaire d'inscription (si pas de compte)
                if showForm {
                    AccountFormView { name, serverURL, username, password in
                        saveAccount(
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

    // MARK: - Save Account
    private func saveAccount(
        name: String,
        serverURL: String,
        username: String,
        password: String
    ) {
        let newAccount = Account(
            name: name,
            serverURL: serverURL,
            username: username,
            password: password
        )

        modelContext.insert(newAccount)

        // Sauvegarder dans SwiftData
        do {
            try modelContext.save()
            // Passer à MainView après sauvegarde
            onAccountReady()
        } catch {
            print(
                "Erreur lors de la sauvegarde du compte: \(error.localizedDescription)"
            )
        }
    }
}

#Preview {
    WelcomeView {
        print("Account ready, transitioning to MainView")
    }
}
