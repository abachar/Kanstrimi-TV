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
    @State private var navigationPath = NavigationPath()
    @State private var showPlayer: PlaybackContent?
    
    var body: some View {
        ZStack {
            Color.appBackground

            if showWelcome {
                welcomeView()
            } else {
                mainView()
            }
        }
        .ignoresSafeArea()
    }
    
    fileprivate func welcomeView() -> some View {
        return WelcomeView {
            // Callback appelé quand le compte est prêt
            withAnimation(.easeInOut(duration: 0.5)) {
                showWelcome = false
            }
        }
        .transition(.opacity)
    }
    
    fileprivate func mainView() -> some View {
        return NavigationStack(path: $navigationPath) {
            TabView(selection: $selectedTab) {
                ChannelListView()
                    .tag(0)
                    .tabItem {
                        Label("TV en direct", systemImage: "play.tv.fill")
                    }
                
                MovieListView()
                    .tag(1)
                    .tabItem {
                        Label("Films", systemImage: "film")
                    }
                
                ShowListView()
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
            .navigationDestination(for: NavigationDestination.self) { destination in
                switch destination {
                case .searchMovies:
                    MovieSearchView()
                    
                case .searchSeries:
                    ShowSearchView()
                    
                case .searchLiveTV:
                    ChannelSearchView()
                    
                case .movieDetail(let streamId):
                    MovieDetailView(streamId: streamId)
                    
                case .seriesDetail(let seriesId):
                    ShowDetailView(seriesId: seriesId)
                }
            }
        }
        .transition(.opacity)
        .environment(\.navigationPath, $navigationPath)
        .environment(\.showPlayer, $showPlayer)
        .fullScreenCover(item: $showPlayer) { content in
            MediaPlayerView(content: content)
        }
    }
}
