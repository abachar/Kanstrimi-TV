//
//  ContentView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 25/10/2025.
//

import SwiftUI
import SwiftData

struct ContentView: View {
    @State private var showWelcome = true

    var body: some View {
        ZStack {
            if showWelcome {
                WelcomeView()
                    .transition(.opacity)
            } else {
                MainView()
                    .transition(.opacity)
            }
        }
        .ignoresSafeArea()
        .task {
            // Attendre 5 secondes puis passer à MainView
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            withAnimation(.easeInOut(duration: 0.5)) {
                showWelcome = false
            }
        }
    }
}

#Preview {
    ContentView()
}
