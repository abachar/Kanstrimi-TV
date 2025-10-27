//
//  SettingsView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftData
import SwiftUI

struct SettingsView: View {

    // MARK: - Queries
    @Query private var playerSettings: [PlayerSettings]

    // MARK: - Body
    var body: some View {
        ZStack {
            Color.black
                .ignoresSafeArea()

            HStack(spacing: 0) {
                // Colonne gauche : Informations app + disclaimer
                AppInfoPanel()
                    .frame(width: 550)

                // Séparateur vertical
                Rectangle()
                    .fill(Color.secondary.opacity(0.2))
                    .frame(width: 1)

                // Colonne droite : Sections de paramètres
                ScrollView(.vertical, showsIndicators: true) {
                    VStack(alignment: .leading, spacing: 40) {
                        // Section Compte
                        AccountSectionView()

                        Divider()
                            .background(Color.secondary.opacity(0.3))

                        // Section Lecture
                        PlaybackSectionView()

                        Divider()
                            .background(Color.secondary.opacity(0.3))

                        // Section Informations
                        InfoSectionView()
                    }
                    .padding(60)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .onAppear {
            initializePlayerSettingsIfNeeded()
        }
    }

    // MARK: - Initialization
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
