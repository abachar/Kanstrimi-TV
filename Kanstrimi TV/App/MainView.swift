//
//  MainView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 26/10/2025.
//

import SwiftUI

struct MainView: View {
    @Binding var resetToWelcome: Bool
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            LiveTVView()
                .tag(0)
                .tabItem {
                    Label("TV en direct", systemImage: "tv")
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

            SearchView()
                .tag(3)
                .tabItem {
                    Label("Recherche", systemImage: "magnifyingglass")
                }

            SettingsView(resetToWelcome: $resetToWelcome)
                .tag(4)
                .tabItem {
                    Label("", systemImage: "gearshape")
                }
        }
    }
}

#Preview {
    @Previewable @State var resetToWelcome = false
    MainView(resetToWelcome: $resetToWelcome)
}
