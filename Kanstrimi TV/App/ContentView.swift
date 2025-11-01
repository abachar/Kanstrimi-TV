//
//  ContentView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 25/10/2025.
//

import SwiftUI
import SwiftData

struct ContentView: View {
    @State private var selectedTab = 0
    @State private var showWelcome = true

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
                TabView(selection: $selectedTab) {
                    LiveTVView()
                        .tag(0)
                        .tabItem {
                            Label("TV en direct", systemImage: "play.tv.fill")
                        }

                    MoviesView()
                        .tag(1)
                        .tabItem {
                            Label("Films", systemImage: "film")
                        }

                    SeriesView()
                        .tag(2)
                        .tabItem {
                            Label("Séries", systemImage: "film.stack")
                        }

                    SettingsView()
                        .tag(3)
                        .tabItem {
                            Label("", systemImage: "gearshape")
                        }
                }
                .transition(.opacity)
            }
        }
        .ignoresSafeArea()
    }
}
