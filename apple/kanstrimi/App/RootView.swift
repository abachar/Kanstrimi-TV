import SwiftUI

/// Pairing gate, then the tabs. Sheets and the player are full-screen covers above everything.
struct RootView: View {
    @Environment(AppEnvironment.self) private var env

    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if env.device.isPaired {
                MainTabsView()
                    .task(id: env.device.token) { await env.loadInfo() }
            } else {
                PairingView()
            }
        }
        .task { await debugHooks() }
        .onChange(of: scenePhase) { _, phase in env.sceneBecame(active: phase == .active) }
        .onOpenURL { url in
            if let link = DeepLink(url: url) { Task { await env.handle(link) } }
        }
        // The Top Shelf shows the last title in progress and reads the server address from the Keychain.
        .task(id: env.device.token) { env.shareWithTopShelf() }
        .onChange(of: env.preferences.serverURL) { env.shareWithTopShelf() }
        .onChange(of: env.player.progressRevision) { env.topShelfDidChange() }
        .overlay {
            if let notice = env.notice { ToastView(text: notice, icon: "exclamationmark.triangle") }
        }
        .animation(.easeInOut(duration: 0.25), value: env.notice)
        .background(Theme.background.ignoresSafeArea())
        .detailCover(env)
        .fullScreenCover(isPresented: Binding(get: { env.player.isPresented && !env.player.isMinimized && env.presentedDetail == nil },
                                              set: { if !$0, !env.player.isMinimized { env.player.stop() } })) {
            PlayerScreen().environment(env).interactiveDismissDisabled()
        }
    }
}

private extension RootView {
    /// Debug only, read once then erased. From UserDefaults so the app can be driven without a remote or a finger
    /// (`xcrun simctl spawn <udid> defaults write dev.crafters.kanstrimi <key> <value>`):
    ///   debug.autopair  — with the mock client (`pref.useMock`), pairs at once
    ///   debug.unpair    — forgets the token, back to the pairing screen
    ///   debug.tab       — home | live | movies | series | search | settings
    ///   debug.open      — a content id whose detail opens
    ///   debug.search    — a query typed in the search screen (read and erased by `SearchView`, built later)
    ///   debug.autoplay  — live | live:<id> | <content id>, plus debug.resumeAt in seconds
    ///   debug.playerState — vodPaused | failure | nextEpisode | nextTitle | livePlaying | panel | opening | skipIntro:
    ///                     stages the player in that state instead of streaming (no flux in the mock)
    ///   debug.landscape — iPhone, read by `PlayerScreen+iOS`: the player in landscape
    ///   debug.panel     — iPhone, read by `PlayerScreen+iOS`: that player panel open
    func debugHooks() async {
        #if DEBUG
        let defaults = UserDefaults.standard
        // One launch only: a key left behind (by scripts/shot.sh) would unpair or replay on every start.
        defer {
            for key in ["debug.unpair", "debug.autopair", "debug.tab", "debug.open", "debug.autoplay", "debug.playerState", "debug.resumeAt"] {
                defaults.removeObject(forKey: key)
            }
        }
        if defaults.bool(forKey: "debug.unpair"), env.device.isPaired { env.device.forget(reason: nil) }
        if defaults.bool(forKey: "debug.autopair"), env.client.isMock, !env.device.isPaired {
            env.device.store(token: "mock-debug", code: "DEBUG0")
        }
        try? await Task.sleep(for: .seconds(1))
        if let tab = defaults.string(forKey: "debug.tab").flatMap(MainTab.init(rawValue:)) {
            // iPhone: Réglages is pushed from the home screen, it has no tab.
            if tab == .settings, !Platform.isTV { env.selectedTab = .home; env.navigate(.settings) } else { env.selectedTab = tab }
        }
        if let id = defaults.string(forKey: "debug.open") { env.open(ContentID(id)) }
        await debugAutoplay(defaults)
        #endif
    }

    #if DEBUG
    func debugAutoplay(_ defaults: UserDefaults) async {
        guard let what = defaults.string(forKey: "debug.autoplay") else { return }
        let staged = defaults.string(forKey: "debug.playerState").flatMap(PlayerService.PreviewState.init(rawValue:))
        switch what {
        case "live":
            guard let groups = try? await env.client.channels(), let first = groups.flatMap(\.channels).first else { return }
            if let staged {
                let ctx = PlaybackContext(content: PlaybackContent(id: first.id, kind: .live, title: first.name, subtitle: nil, episode: nil, backdrop: nil), versions: first.versions)
                env.player.debugPut(ctx, state: staged, channels: groups.flatMap(\.channels))
            } else {
                env.player.play(channel: first, in: groups.flatMap(\.channels))
            }
        case let id where id.hasPrefix("live:"):
            guard let groups = try? await env.client.channels() else { return }
            let all = groups.flatMap(\.channels)
            guard let channel = all.first(where: { $0.id == ContentID(id) }) else { return }
            env.player.play(channel: channel, in: all)
        default:
            guard var ctx = try? await env.playbackContext(for: ContentID(what)) else { return }
            let resume = defaults.double(forKey: "debug.resumeAt")
            if resume > 0 {
                ctx = ctx.resuming(at: resume)
            }
            if let staged {
                env.player.debugPut(ctx, state: staged, suggestions: try? await env.client.suggestions(id: ctx.content.id))
            } else {
                env.player.play(ctx)
            }
        }
    }
    #endif
}

extension View {
    /// Presents the player above this view when playback starts from it.
    func playerCover(_ env: AppEnvironment) -> some View {
        fullScreenCover(isPresented: Binding(get: { env.player.isPresented }, set: { if !$0, !env.player.isMinimized { env.player.stop() } })) {
            PlayerScreen().environment(env).interactiveDismissDisabled()
        }
    }
}

struct MainTabsView: View {
    @Environment(AppEnvironment.self) private var env

    var body: some View {
        @Bindable var env = env
        TabView(selection: $env.selectedTab) {
            Tab("Accueil", systemImage: "house", value: .home) { stack(.home) { HomeView() } }
            Tab("Direct", systemImage: "tv", value: .live) { stack(.live) { LiveView() } }
            Tab("Films", systemImage: "film", value: .movies) { stack(.movies) { CatalogView(kind: .movie) } }
            Tab("Séries", systemImage: "rectangle.stack", value: .series) { stack(.series) { CatalogView(kind: .series) } }
            // Icon-only tabs: the label stays for accessibility, the bar shows the symbol alone.
            Tab(value: .search, role: .search) { stack(.search) { SearchView() } } label: {
                Image(systemName: "magnifyingglass").accessibilityLabel("Recherche")
            }
            // iPhone keeps five tabs: Réglages is reached from the home screen (`settingsToolbar`).
            if Platform.isTV {
                Tab(value: .settings) { stack(.settings) { SettingsView() } } label: {
                    Image(systemName: "gearshape").accessibilityLabel("Réglages")
                }
            }
        }
    }

    /// Each tab owns a navigation stack: `env.navigate` pushes onto it on iOS. On tvOS the stack
    /// stays at its root, details being covers.
    private func stack<Content: View>(_ tab: MainTab, @ViewBuilder content: () -> Content) -> some View {
        NavigationStack(path: Binding(get: { env.paths[tab] ?? [] }, set: { env.paths[tab] = $0 })) {
            content()
                .navigationDestination(for: Route.self) { RouteView(route: $0).detailChrome() }
        }
    }
}
