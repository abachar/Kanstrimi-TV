//
//  KanstrimiTVApp.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 25/10/2025.
//

import SwiftUI
import SwiftData

@main
struct KanstrimiTVApp: App {
    // ✅ Nouveau: AppStore avec architecture @Observable
    @State private var appStore = AppStore()

    // Conservé pour compatibilité avec le code non-migré
    @State private var domainService = DomainService()

    var body: some Scene {
        WindowGroup {
            ContentView()
                // ✅ Injection du nouveau AppStore
                .environment(appStore)
                // Conservé pour le code non-migré
                .environment(\.domainService, domainService)
        }
        .modelContainer(appStore.storageService.container)
        .task {
            // Initialiser l'app au démarrage
            await appStore.initialize()
        }
    }
}
