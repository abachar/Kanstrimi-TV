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
    @State private var domainService = DomainService()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(\.domainService, domainService)
        }
        .modelContainer(domainService.modelContainer)
    }
}
