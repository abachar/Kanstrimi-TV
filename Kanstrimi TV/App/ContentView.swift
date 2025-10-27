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
    @State private var resetToWelcome = false

    var body: some View {
        ZStack {
            if showWelcome {
                WelcomeView {
                    // Callback appelé quand le compte est prêt
                    withAnimation(.easeInOut(duration: 0.5)) {
                        showWelcome = false
                    }
                }
                .transition(.opacity)
            } else {
                MainView(resetToWelcome: $resetToWelcome)
                    .transition(.opacity)
            }
        }
        .ignoresSafeArea()
        .onChange(of: resetToWelcome) { _, newValue in
            if newValue {
                withAnimation(.easeInOut(duration: 0.5)) {
                    showWelcome = true
                }
                resetToWelcome = false
            }
        }
    }
}
