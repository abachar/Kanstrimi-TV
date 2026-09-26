import SwiftUI

/// Hero, then the rows the server composed [3]. Offline: the last home received, from disk [17].
struct HomeView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var model: HomeModel?
    @State private var showPicker = false

    var body: some View {
        Group {
            if let model {
                content(model)
            } else {
                Color.clear
            }
        }
        .background(Theme.background)
        .task {
            if model == nil {
                let m = HomeModel(env: env)
                model = m
                await m.load()
            }
        }
        .fullScreenCover(isPresented: $showPicker) {
            if let model, let hero = model.home?.hero {
                VersionPicker(title: hero.card.title, versions: hero.versions, recommendedID: model.heroChoice?.version.id) { v, s, remember, _ in
                    if remember { env.preferences.remember(versionID: v.id, for: hero.card.id) }
                    Task {
                        try? await Task.sleep(for: .milliseconds(400))
                        model.playHero(version: v, source: s)
                    }
                }
                .environment(env)
            }
        }
    }

    @ViewBuilder private func content(_ model: HomeModel) -> some View {
        if let home = model.home {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    if model.isOffline {
                        OfflineBanner(detail: "Accueil du \(Format.dayHour(home.generatedAt)) affiché · la lecture reste possible si le flux répond") {
                            Task { await model.load() }
                        }
                        .padding(.horizontal, 96).padding(.top, 30)
                    }
                    if let hero = home.hero { heroView(hero, model: model) }
                    ForEach(home.rows) { row in
                        CardRow(title: row.title, cards: row.cards, landscape: row.kind == .resume) { card in
                            if row.kind == .resume { model.resume(card) } else { env.open(card.id) }
                        }
                    }
                    Spacer(minLength: 60)
                }
                .padding(.bottom, 20)
            }
            .ignoresSafeArea(edges: .horizontal)
        } else if let error = model.error {
            StatePanel(icon: "wifi.exclamationmark", title: "Serveur injoignable",
                       message: "\(error.localizedDescription). Aucun accueil en cache sur cet Apple TV.") {
                Task { await model.load() }
            }
        } else {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func heroView(_ hero: HomeHero, model: HomeModel) -> some View {
        ZStack(alignment: .bottomLeading) {
            ArtView(id: hero.card.id, url: hero.card.backdrop)
                .frame(maxWidth: .infinity).frame(height: 640)
                .overlay {
                    LinearGradient(colors: [Theme.background.opacity(0.95), Theme.background.opacity(0.3), .clear], startPoint: .leading, endPoint: .trailing)
                    LinearGradient(colors: [.clear, Theme.background.opacity(0.6), Theme.background], startPoint: .center, endPoint: .bottom)
                }
            VStack(alignment: .leading, spacing: 16) {
                Text(hero.tagline).font(.caption.weight(.bold)).tracking(2.5).foregroundStyle(Theme.accent)
                Text(hero.card.title).font(.system(size: 88, weight: .heavy)).lineLimit(2).frame(maxWidth: 1000, alignment: .leading)
                HStack(spacing: 12) {
                    Text([hero.card.year.map(String.init), hero.card.genres.first, hero.runtime.map(Format.runtime(minutes:))].compactMap { $0 }.joined(separator: " · "))
                        .foregroundStyle(Theme.secondary)
                    if let c = hero.certification { Badge(c) }
                }
                .font(.title3)
                if let c = model.heroChoice {
                    HStack(spacing: 10) {
                        Image(systemName: "sparkles").foregroundStyle(Theme.accent)
                        Text(c.version.label).font(.title3.weight(.semibold))
                        Text(model.isOffline ? "— version connue à \(Format.hour(model.home?.generatedAt ?? .now)) · elle sera revérifiée au lancement" : "— choisi pour vous")
                            .font(.title3).foregroundStyle(Theme.secondary)
                    }
                }
                HStack(spacing: 18) {
                    Button { model.playHero(version: nil, source: nil) } label: {
                        Label(hero.card.progress?.isResumable == true ? "Reprendre" : "Lecture", systemImage: "play.fill").font(.title3.weight(.bold))
                    }
                    .buttonStyle(.borderedProminent)
                    .onLongPressGesture(minimumDuration: 0.5) { showPicker = true }
                    Button("Versions · \(hero.versions.count)") { showPicker = true }.buttonStyle(.bordered)
                    Button { env.open(hero.card.id) } label: { Label("Fiche", systemImage: "info.circle") }.buttonStyle(.bordered)
                }
                .padding(.top, 8)
            }
            .padding(.horizontal, 96)
            .padding(.bottom, 40)
        }
    }
}

@Observable
final class HomeModel {
    private let env: AppEnvironment
    private(set) var home: HomeScreen?
    private(set) var error: CatalogError?
    private(set) var isOffline = false
    private(set) var isLoading = false

    init(env: AppEnvironment) { self.env = env }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let h = try await env.call { try await env.client.home() }
            home = h
            error = nil
            isOffline = false
            env.homeCache.save(h)
            await env.progressQueue.flush { try await env.client.report($0) }
        } catch {
            let e = (error as? CatalogError) ?? .server(error.localizedDescription)
            if e == .unauthorized { return }
            if let cached = env.homeCache.load() {
                home = cached
                isOffline = true
                self.error = nil
            } else if home == nil {
                self.error = e
            } else {
                isOffline = true
            }
        }
    }

    var heroChoice: VersionChooser.Choice? {
        guard let hero = home?.hero else { return nil }
        let remembered = env.preferences.rememberVersionPerTitle ? env.preferences.rememberedVersion(for: hero.card.id) : nil
        return env.player.chooser.choose(from: hero.versions, remembered: remembered)
    }

    func playHero(version: Version?, source: Source?) {
        guard let hero = home?.hero else { return }
        let p = hero.card.progress
        let ctx = PlaybackContext(content: PlaybackContent(id: hero.card.id, kind: hero.card.kind, title: hero.card.title, subtitle: nil, episode: nil, backdrop: hero.card.backdrop),
                                  versions: hero.versions, resumeAt: p?.isResumable == true ? p?.position : nil,
                                  duration: p?.duration ?? hero.runtime.map { TimeInterval($0 * 60) }, next: nil, seriesID: nil)
        if let version { env.player.play(ctx, version: version, source: source) } else { env.player.play(ctx) }
    }

    /// "Reprendre" launches the player directly: one call for the playback context, no sheet.
    func resume(_ card: ContentCard) {
        Task {
            if let ctx = try? await env.call({ try await env.client.playbackContext(id: card.id) }) {
                env.player.play(ctx)
            } else if let cached = home, cached.hero?.card.id == card.id {
                playHero(version: nil, source: nil)
            }
        }
    }
}
