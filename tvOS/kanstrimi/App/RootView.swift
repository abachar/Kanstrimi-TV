import SwiftUI

/// Pairing gate, then the tabs. The player is a full-screen cover above everything.
struct RootView: View {
    @Environment(AppEnvironment.self) private var env

    var body: some View {
        @Bindable var player = env.player
        Group {
            if env.device.isPaired {
                MainTabsView()
                    .task(id: env.device.token) { await env.loadSession() }
            } else {
                PairingView()
            }
        }
        .background(Theme.background.ignoresSafeArea())
        .fullScreenCover(isPresented: Binding(get: { env.player.isPresented }, set: { if !$0 { env.player.stop() } })) {
            PlayerScreen()
                .environment(env)
        }
    }
}

enum MainTab: String, Hashable, CaseIterable {
    case home, live, movies, series, search
}

struct MainTabsView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var selection: MainTab = .home
    @State private var showSettings = false

    var body: some View {
        TabView(selection: $selection) {
            Tab("Accueil", systemImage: "house", value: .home) { HomeView() }
            Tab("Direct", systemImage: "tv", value: .live) { LiveView() }
            Tab("Films", systemImage: "film", value: .movies) { CatalogView(kind: .movie) }
            Tab("Séries", systemImage: "rectangle.stack", value: .series) { CatalogView(kind: .series) }
            Tab("Recherche", systemImage: "magnifyingglass", value: .search, role: .search) { SearchView() }
        }
        .environment(\.openSettings, OpenSettingsAction { showSettings = true })
        .fullScreenCover(isPresented: $showSettings) {
            SettingsView().environment(env)
        }
    }
}

/// Every tab shows a ⚙ at the top right; this action opens Réglages.
struct OpenSettingsAction {
    let run: () -> Void
    func callAsFunction() { run() }
}
extension EnvironmentValues {
    @Entry var openSettings = OpenSettingsAction { }
}

/// Small glass ⚙ button, placed at the top right of each tab.
struct SettingsButton: View {
    @Environment(\.openSettings) private var openSettings
    var body: some View {
        Button { openSettings() } label: {
            Image(systemName: "gearshape").font(.title3)
        }
        .buttonStyle(.borderless)
        .accessibilityLabel("Réglages")
    }
}
