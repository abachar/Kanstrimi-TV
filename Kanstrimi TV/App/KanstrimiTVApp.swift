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
    private let storageService = StorageService.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(storageService.container)
    }
}
