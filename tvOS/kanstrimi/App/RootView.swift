import SwiftUI

/// Pairing gate, then the tabs. Sheets and the player are full-screen covers above everything.
struct RootView: View {
    @Environment(AppEnvironment.self) private var env

    var body: some View {
        @Bindable var env = env
        Group {
            if env.device.isPaired {
                MainTabsView()
                    .task(id: env.device.token) { await env.loadSession() }
                    .task { await debugAutoplay() }
            } else {
                PairingView()
            }
        }
        .background(Theme.background.ignoresSafeArea())
        .fullScreenCover(item: $env.presentedDetail) { id in
            DetailView(id: id)
                .environment(env)
                .playerCover(env)
        }
        .fullScreenCover(isPresented: Binding(get: { env.player.isPresented && env.presentedDetail == nil },
                                              set: { if !$0 { env.player.stop() } })) {
            PlayerScreen().environment(env)
        }
    }
}

private extension RootView {
    /// Debug only: `defaults write dev.crafters.kanstrimi debug.autoplay live|<content id>`
    /// starts playback at launch, so the player can be checked without a remote.
    func debugAutoplay() async {
        #if DEBUG
        guard let what = UserDefaults.standard.string(forKey: "debug.autoplay") else { return }
        try? await Task.sleep(for: .seconds(1))
        switch what {
        case "live":
            guard let groups = try? await env.client.channels(), let first = groups.flatMap(\.channels).first else { return }
            env.player.play(channel: first, in: groups.flatMap(\.channels))
        default:
            guard var ctx = try? await env.client.playbackContext(id: ContentID(what)) else { return }
            let resume = UserDefaults.standard.double(forKey: "debug.resumeAt")
            if resume > 0 {
                ctx = PlaybackContext(content: ctx.content, versions: ctx.versions, resumeAt: resume, duration: ctx.duration, next: ctx.next, seriesID: ctx.seriesID)
            }
            env.player.play(ctx)
        }
        #endif
    }
}

extension View {
    /// Presents the player above this view when playback starts from it.
    func playerCover(_ env: AppEnvironment) -> some View {
        fullScreenCover(isPresented: Binding(get: { env.player.isPresented }, set: { if !$0 { env.player.stop() } })) {
            PlayerScreen().environment(env)
        }
    }
}

enum MainTab: String, Hashable, CaseIterable {
    case home, live, movies, series, search, settings
}

struct MainTabsView: View {
    @State private var selection: MainTab = .home

    var body: some View {
        TabView(selection: $selection) {
            Tab("Accueil", systemImage: "house", value: .home) { HomeView() }
            Tab("Direct", systemImage: "tv", value: .live) { LiveView() }
            Tab("Films", systemImage: "film", value: .movies) { CatalogView(kind: .movie) }
            Tab("Séries", systemImage: "rectangle.stack", value: .series) { CatalogView(kind: .series) }
            Tab("Recherche", systemImage: "magnifyingglass", value: .search, role: .search) { SearchView() }
            Tab("Réglages", systemImage: "gearshape", value: .settings) { SettingsView() }
        }
    }
}
