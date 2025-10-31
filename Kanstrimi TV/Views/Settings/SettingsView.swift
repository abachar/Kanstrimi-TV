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
    @Environment(\.domainService) private var domainService

    // MARK: - Queries
    @Query private var playerSettings: [PlayerSettings]

    // MARK: - Body
    var body: some View {
        ZStack {
            HStack(spacing: 0) {
                // Colonne gauche : Informations app + disclaimer
                AppInfoPanel()
                    .frame(maxWidth: .infinity)

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
            try? domainService.insertPlayerSettings(settings)
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

    // Créer le MockDomainService
    let mockDomainService = MockDomainService(container: container)

    return SettingsView()
        .modelContainer(container)
        .environment(\.domainService, mockDomainService)
}
