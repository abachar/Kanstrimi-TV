import SwiftUI

/// Hero, then the rows the server composed [3]. Offline: the last home received, from disk [17].
struct HomeView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics
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
        .settingsToolbar(env)
        .task {
            if model == nil {
                let m = HomeModel(env: env)
                model = m
                await m.load()
            }
        }
        .onChange(of: env.player.progressRevision) { Task { await model?.load() } }
        .platformSheet(isPresented: $showPicker) {
            if let model, let hero = model.home?.hero {
                VersionPicker(title: hero.card.title, versions: hero.versions, recommendedID: model.heroChoice?.version.id) { v, s in
                    Task {
                        try? await Task.sleep(for: .milliseconds(400))
                        model.playHero(version: v, source: s)
                    }
                }
                .environment(env)
            }
        }
    }

    /// Long press on a « Reprendre » card: out of the row, or seen (it leaves the row too).
    private func resumeActions(_ card: Card, model: HomeModel) -> [CardAction] {
        [CardAction(title: "Retirer de « Reprendre »", systemImage: "xmark.circle") { Task { await model.removeFromResume(card) } },
         CardAction(title: "Marquer comme vu", systemImage: "checkmark.circle") { Task { await model.markWatched(card) } }]
    }

    @ViewBuilder private func content(_ model: HomeModel) -> some View {
        if let home = model.home {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    if model.isOffline {
                        OfflineBanner(detail: "Accueil du \(Format.dayHour(home.generatedAt)) affiché · la lecture reste possible si le flux répond") {
                            Task { await model.load() }
                        }
                        .padding(.horizontal, metrics.inset).padding(.top, metrics.compact ? 64 : 30)
                    }
                    if let hero = home.hero { heroView(hero, model: model) }
                    ForEach(home.rows) { row in
                        CardRow(title: row.title, cards: row.cards, landscape: row.kind == .resume,
                                actions: row.kind == .resume ? { card in resumeActions(card, model: model) } : { _ in [] }) { card in
                            if row.kind == .resume { model.resume(card) }
                            else if card.kind == .live { Task { await env.watchChannel(card.id) } }
                            else { env.open(card.id) }
                        }
                    }
                    Spacer(minLength: 60)
                }
                .padding(.bottom, 20)
            }
            // The hero runs under the floating tab bar (tvOS) or the status bar (iPhone) instead of leaving a black band above it.
            .ignoresSafeArea(edges: [.horizontal, .top])
        } else if let error = model.error {
            StatePanel(icon: "wifi.exclamationmark", title: "Serveur injoignable",
                       message: "\(error.localizedDescription). Aucun accueil en cache sur cet appareil.") {
                Task { await model.load() }
            }
        } else {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    @ViewBuilder private func heroView(_ hero: HomeHero, model: HomeModel) -> some View {
        if metrics.compact { phoneHero(hero, model: model) } else { tvHero(hero, model: model) }
    }

    /// iPhone: the backdrop from the top edge, the logo (or the title), one line of facts, then Lecture,
    /// Ma liste and the sheet. A tap on the picture opens the sheet too.
    private func phoneHero(_ hero: HomeHero, model: HomeModel) -> some View {
        ZStack(alignment: .bottom) {
            ArtView(id: hero.card.id, url: hero.card.backdrop)
                .frame(maxWidth: .infinity).frame(height: metrics.heroHeight)
                .overlay {
                    // Dark under the status bar, then clear, then the background under the text.
                    LinearGradient(stops: [.init(color: Theme.background.opacity(0.55), location: 0),
                                           .init(color: .clear, location: 0.22),
                                           .init(color: .clear, location: 0.4),
                                           .init(color: Theme.background.opacity(0.85), location: 0.78),
                                           .init(color: Theme.background, location: 1)],
                                   startPoint: .top, endPoint: .bottom)
                }
                .contentShape(Rectangle())
                .onTapGesture { env.open(hero.card.id) }
            VStack(spacing: 12) {
                Text(hero.tagline).font(.caption2.weight(.bold)).tracking(2).foregroundStyle(Theme.accent)
                TitleLogo(title: hero.card.title, logo: hero.card.logo, centered: true)
                HStack(spacing: 8) {
                    Text([hero.card.year.map(String.init), hero.card.genres.first, hero.runtime.map(Format.runtime(minutes:))].compactMap { $0 }.joined(separator: " · "))
                        .foregroundStyle(Theme.secondary).lineLimit(1)
                    if let c = hero.certification { Badge(c, small: true) }
                }
                .font(.subheadline)
                HStack(spacing: 14) {
                    let favorite = model.heroIsFavorite
                    Button { Task { await model.toggleHeroFavorite() } } label: { Image(systemName: favorite ? "heart.fill" : "heart") }
                        .buttonStyle(RoundIconStyle(diameter: 46))
                        .accessibilityLabel(favorite ? "Retirer de ma liste" : "Ajouter à ma liste")
                        .sensoryFeedback(.selection, trigger: favorite)
                    Button { model.playHero(version: nil, source: nil) } label: {
                        Label(hero.card.progress?.isResumable == true ? "Reprendre" : "Lecture", systemImage: "play.fill")
                            .font(.headline).phoneFullWidth(metrics)
                    }
                    .prominentButtonStyle()
                    .contextMenu {
                        if VersionPicker.lineCount(hero.versions) > 1 {
                            Button { showPicker = true } label: { Label("Choisir la version", systemImage: "rectangle.stack.badge.play") }
                        }
                    }
                    Button { env.open(hero.card.id) } label: { Image(systemName: "info") }
                        .buttonStyle(RoundIconStyle(diameter: 46))
                        .accessibilityLabel("Fiche")
                }
                .padding(.top, 4)
            }
            .padding(.horizontal, metrics.inset + 8)
            .padding(.bottom, 12)
        }
    }

    private func tvHero(_ hero: HomeHero, model: HomeModel) -> some View {
        ZStack(alignment: .bottomLeading) {
            ArtView(id: hero.card.id, url: hero.card.backdrop)
                .frame(maxWidth: .infinity).frame(height: metrics.heroHeight)
                .overlay {
                    LinearGradient(colors: [Theme.background.opacity(0.95), Theme.background.opacity(0.3), .clear], startPoint: .leading, endPoint: .trailing)
                    LinearGradient(colors: [.clear, Theme.background.opacity(0.6), Theme.background], startPoint: .center, endPoint: .bottom)
                    // Keeps the tab bar readable over a bright backdrop.
                    if Platform.isTV { LinearGradient(colors: [Theme.background.opacity(0.7), .clear], startPoint: .top, endPoint: .init(x: 0.5, y: 0.3)) }
                }
            VStack(alignment: .leading, spacing: 16) {
                Text(hero.tagline).font(.caption.weight(.bold)).tracking(2.5).foregroundStyle(Theme.accent)
                // Wider than running text: a long title keeps two lines instead of being cut.
                Text(hero.card.title).font(.system(size: metrics.heroTitle, weight: .heavy)).lineLimit(2).minimumScaleFactor(0.85)
                    .frame(maxWidth: metrics.textWidth * 1.4, alignment: .leading)
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
                // The row never wraps a label: on a phone it scrolls sideways instead.
                ScrollView(.horizontal) {
                    HStack(spacing: 18) { heroButtons(hero, model: model) }.fixedSize()
                }
                .scrollClipDisabled()
                .padding(.top, 8)
            }
            .padding(.horizontal, metrics.inset)
            .padding(.bottom, 40)
        }
    }
}

private extension HomeView {
    @ViewBuilder func heroButtons(_ hero: HomeHero, model: HomeModel) -> some View {
        Button { model.playHero(version: nil, source: nil) } label: {
            Label(hero.card.progress?.isResumable == true ? "Reprendre" : "Lecture", systemImage: "play.fill").font(.headline)
        }
        .prominentButtonStyle()
        .onLongPressGesture(minimumDuration: 0.5) { if VersionPicker.lineCount(hero.versions) > 1 { showPicker = true } }
        // Only when the picker has more than one line to offer.
        if VersionPicker.lineCount(hero.versions) > 1 {
            Button("Versions · \(hero.versions.count)") { showPicker = true }.buttonStyle(.bordered)
        }
        Button { env.open(hero.card.id) } label: { Label("Fiche", systemImage: "info.circle") }.buttonStyle(.bordered)
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
            heroFavorite = nil
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

    /// Ma liste of the hero, as toggled here until the next load says otherwise.
    private var heroFavorite: Bool?
    var heroIsFavorite: Bool { heroFavorite ?? home?.hero?.card.isFavorite ?? false }

    func toggleHeroFavorite() async {
        guard let id = home?.hero?.card.id else { return }
        let target = !heroIsFavorite
        heroFavorite = target
        do { try await env.call { try await env.client.setFavorite(id: id, target) } } catch { heroFavorite = !target }
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
                                  duration: p?.duration ?? hero.runtime.map { TimeInterval($0 * 60) })
        if let version { env.player.play(ctx, version: version, source: source) } else { env.player.play(ctx) }
    }

    func removeFromResume(_ card: Card) async {
        env.progressQueue.drop(card.id)
        guard (try? await env.call { try await env.client.removeFromResume(id: card.id) }) != nil else { return }
        await load()
    }

    func markWatched(_ card: Card) async {
        env.progressQueue.drop(card.id)
        guard (try? await env.call { try await env.client.setWatched(id: card.id, true, season: nil) }) != nil else { return }
        await load()
    }

    /// "Reprendre" launches the player directly: one call for the playback context, no sheet.
    func resume(_ card: Card) {
        Task {
            if let ctx = try? await env.playbackContext(for: card) {
                env.player.play(ctx)
            } else if let cached = home, cached.hero?.card.id == card.id {
                playHero(version: nil, source: nil)
            }
        }
    }
}
