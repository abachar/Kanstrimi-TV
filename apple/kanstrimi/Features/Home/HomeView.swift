import SwiftUI

/// The carousel, then the rows the server composed [3]. Offline: the last home received, from disk [17].
struct HomeView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics
    @State private var model: HomeModel?
    @State private var showPicker = false
    /// tvOS: the hero's buttons, and the two invisible edges past them that turn the carousel.
    @FocusState private var heroFocus: HeroFocus?
    /// iPhone: a finger on the carousel holds it.
    @State private var dragging = false

    /// Seconds a slide stays before the next one.
    static let slideDuration: Duration = .seconds(8)

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
            if let model {
                // Left before its first answer, or shown from the disk: try the server again.
                if model.home == nil || model.isOffline { await model.load() }
            } else {
                let m = HomeModel(env: env)
                model = m
                await m.load()
            }
        }
        .onChange(of: env.player.progressRevision) { Task { await model?.load() } }
        .onChange(of: env.resumeRevision) { Task { await model?.load() } }
        .platformSheet(isPresented: $showPicker) {
            if let model, let hero = model.hero {
                VersionPicker(title: hero.item.title, versions: hero.versions, recommendedID: model.heroChoice?.version.id) { v, s in
                    Task {
                        try? await Task.sleep(for: .milliseconds(400))
                        model.playHero(hero, version: v, source: s)
                    }
                }
                .environment(env)
            }
        }
    }

    /// Long press on a « Reprendre » card: out of the row, or seen (it leaves the row too).
    private func resumeActions(_ card: ContentItem, model: HomeModel) -> [CardAction] {
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
                    if let hero = model.hero { carousel(hero, count: home.heroes.count, model: model) }
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

    /// One slide at a time, the next every eight seconds unless held: the hero's buttons focused (tvOS),
    /// a finger on it (iPhone), the version picker open. A slide turned by hand starts its eight seconds again.
    private func carousel(_ hero: HomeHero, count: Int, model: HomeModel) -> some View {
        let held = heroFocus != nil || dragging || showPicker
        return heroView(hero, model: model)
            .overlay(alignment: metrics.compact ? .bottom : .bottomTrailing) {
                if count > 1 {
                    PageDots(count: count, current: model.heroIndex, size: metrics.compact ? 8 : 14)
                        .padding(.horizontal, metrics.inset)
                        .padding(.bottom, metrics.compact ? 8 : 48)
                }
            }
            .horizontalSwipe(touching: { dragging = $0 }) { turn(model, by: $0) }
            .task(id: SlideTimer(index: model.heroIndex, count: count, held: held)) {
                guard !held, count > 1 else { return }
                try? await Task.sleep(for: Self.slideDuration)
                guard !Task.isCancelled else { return }
                turn(model, by: 1)
            }
            .onChange(of: heroFocus) { _, focus in
                // Past the first or the last button: the previous or the next slide, the focus back on Lecture.
                guard focus == .previous || focus == .next else { return }
                turn(model, by: focus == .next ? 1 : -1)
                heroFocus = .play
            }
    }

    private func turn(_ model: HomeModel, by step: Int) {
        withAnimation(.easeInOut(duration: 0.6)) { model.turn(by: step) }
    }

    @ViewBuilder private func heroView(_ hero: HomeHero, model: HomeModel) -> some View {
        if metrics.compact { phoneHero(hero, model: model) } else { tvHero(hero, model: model) }
    }

    /// iPhone: Ma liste, Lecture (a long press offers the versions) and the sheet. A tap on the picture opens the sheet too.
    private func phoneHero(_ hero: HomeHero, model: HomeModel) -> some View {
        HeroBanner(item: hero.item, tagline: hero.tagline, certification: hero.certification, slideID: hero.playID,
                   onTapPicture: { env.open(hero.item.id) }) {
            let favorite = model.isFavorite(hero)
            Button { Task { await model.toggleFavorite(hero) } } label: { Image(systemName: favorite ? "heart.fill" : "heart") }
                .buttonStyle(RoundIconStyle(diameter: 46))
                .accessibilityLabel(favorite ? "Retirer de ma liste" : "Ajouter à ma liste")
                .sensoryFeedback(.selection, trigger: favorite)
            Button { model.playHero(hero, version: nil, source: nil) } label: {
                Label(hero.playLabel, systemImage: "play.fill")
                    .font(.headline).phoneFullWidth(metrics)
            }
            .prominentButtonStyle()
            .contextMenu {
                if VersionPicker.lineCount(hero.versions) > 1 {
                    Button { showPicker = true } label: { Label("Choisir la version", systemImage: "rectangle.stack.badge.play") }
                }
            }
            Button { env.open(hero.item.id) } label: { Image(systemName: "info") }
                .buttonStyle(RoundIconStyle(diameter: 46))
                .accessibilityLabel("Fiche")
        }
    }

    /// TV: Lecture (a long press offers the versions), Ma liste and Fiche between two invisible stops, focusable
    /// once the focus is in the row (coming up from a row below never lands on it): reaching one turns the carousel.
    private func tvHero(_ hero: HomeHero, model: HomeModel) -> some View {
        HeroBanner(item: hero.item, tagline: hero.tagline, certification: hero.certification, slideID: hero.playID) {
            if Platform.isTV { edge(.previous) }
            HStack(spacing: 18) { heroButtons(hero, model: model) }
            if Platform.isTV { edge(.next) }
        }
    }
}

enum HeroFocus: Hashable { case previous, play, favorite, sheet, next }

/// The carousel's timer: a new slide, a new count or a hold restarts it.
private struct SlideTimer: Equatable {
    let index: Int
    let count: Int
    let held: Bool
}

/// Which slide of how many: a dot each, the current one long.
private struct PageDots: View {
    let count: Int
    let current: Int
    /// A dot's height: read from a sofa on the television.
    let size: CGFloat

    var body: some View {
        HStack(spacing: size) {
            ForEach(0..<count, id: \.self) { i in
                Capsule().fill(i == current ? Theme.accent : Theme.secondary.opacity(0.45))
                    .frame(width: i == current ? size * 2.5 : size, height: size)
            }
        }
        .animation(.easeInOut(duration: 0.3), value: current)
        .accessibilityElement()
        .accessibilityLabel("Élément \(current + 1) sur \(count)")
    }
}

private extension HomeView {
    @ViewBuilder func heroButtons(_ hero: HomeHero, model: HomeModel) -> some View {
        Button { model.playHero(hero, version: nil, source: nil) } label: {
            Label(hero.playLabel, systemImage: "play.fill").font(.headline)
        }
        .prominentButtonStyle()
        .focused($heroFocus, equals: .play)
        .onLongPressGesture(minimumDuration: 0.5) { if VersionPicker.lineCount(hero.versions) > 1 { showPicker = true } }
        // Said in words, not by a colour: « Ma liste », then « Dans ma liste » with a tick.
        let favorite = model.isFavorite(hero)
        Button { Task { await model.toggleFavorite(hero) } } label: {
            Label(favorite ? "Dans ma liste" : "Ma liste", systemImage: favorite ? "checkmark" : "plus")
        }
        .buttonStyle(.bordered)
        .focused($heroFocus, equals: .favorite)
        Button { env.open(hero.item.id) } label: { Label("Fiche", systemImage: "info.circle") }.buttonStyle(.bordered)
            .focused($heroFocus, equals: .sheet)
    }

    func edge(_ side: HeroFocus) -> some View {
        Color.clear.frame(width: 2, height: 2)
            .focusable(heroFocus != nil)
            .focused($heroFocus, equals: side)
            .accessibilityHidden(true)
    }
}

@Observable
final class HomeModel {
    private let env: AppEnvironment
    private(set) var home: HomeScreen?
    /// The carousel's current slide.
    private(set) var heroIndex = 0
    private(set) var error: CatalogError?
    private(set) var isOffline = false
    private(set) var isLoading = false

    init(env: AppEnvironment) { self.env = env }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let h = try await env.client.home()
            // The same slide stays on screen when it is still there.
            let current = hero?.playID
            home = h
            heroIndex = h.heroes.firstIndex { $0.playID == current } ?? 0
            favoriteOverrides = [:]
            error = nil
            isOffline = false
            env.homeCache.save(h)
            await env.progressQueue.flush { try await env.client.report($0) }
        } catch is CancellationError {
            // The screen went away first: nothing to show.
        } catch {
            let e = (error as? CatalogError) ?? .server(error.localizedDescription)
            if e == .unauthorized { return }
            if let cached = env.homeCache.load() {
                home = cached
                heroIndex = min(heroIndex, max(cached.heroes.count - 1, 0))
                isOffline = true
                self.error = nil
            } else if home == nil {
                self.error = e
            } else {
                isOffline = true
            }
        }
    }

    var hero: HomeHero? {
        guard let heroes = home?.heroes, !heroes.isEmpty else { return nil }
        return heroes[min(heroIndex, heroes.count - 1)]
    }

    /// The next slide (`step` 1) or the previous one (-1), round the carousel.
    func turn(by step: Int) {
        guard let count = home?.heroes.count, count > 0 else { return }
        heroIndex = ((heroIndex + step) % count + count) % count
    }

    /// Ma liste of each slide, as toggled here until the next load says otherwise.
    private var favoriteOverrides: [ContentID: Bool] = [:]
    func isFavorite(_ hero: HomeHero) -> Bool { favoriteOverrides[hero.item.id] ?? hero.isFavorite }

    func toggleFavorite(_ hero: HomeHero) async {
        let id = hero.item.id
        let target = !isFavorite(hero)
        favoriteOverrides[id] = target
        do { try await env.client.setFavorite(id: id, target) } catch { favoriteOverrides[id] = !target }
    }

    var heroChoice: VersionChooser.Choice? {
        guard let hero else { return nil }
        let remembered = env.preferences.rememberVersionPerTitle ? env.preferences.rememberedVersion(for: hero.item.id) : nil
        return env.player.chooser.choose(from: hero.versions, remembered: remembered)
    }

    /// Asks `/playback` first (the episode after it, the cast of the Distribution panel), and falls back on what the
    /// slide carries, offline included.
    func playHero(_ hero: HomeHero, version: Version?, source: Source?) {
        let content: PlaybackContent
        if let e = hero.episode {
            content = PlaybackContent(id: hero.playID, kind: .episode, title: e.title ?? hero.item.title, subtitle: hero.item.title,
                                      episode: e, backdrop: hero.item.picture)
        } else {
            content = PlaybackContent(id: hero.playID, kind: hero.item.kind.content ?? .movie, title: hero.item.title, subtitle: nil, episode: nil,
                                      backdrop: hero.item.picture)
        }
        let local = PlaybackContext(content: content, versions: hero.versions, resumeAt: hero.resumeAt, duration: hero.duration)
        Task {
            var ctx = local
            if let playback = try? await env.client.playback(id: hero.playID) {
                ctx = PlaybackContext(content: content, playback: playback)
            }
            if let version { env.player.play(ctx, version: version, source: source) } else { env.player.play(ctx) }
        }
    }

    func removeFromResume(_ card: ContentItem) async {
        env.progressQueue.drop(card.id)
        guard await env.attempt("Retrait", { try await env.client.removeFromResume(id: card.id) }) != nil else { return }
        await load()
    }

    func markWatched(_ card: ContentItem) async {
        env.progressQueue.drop(card.id)
        guard await env.attempt("Marquage", { try await env.client.setWatched(id: card.id, true, season: nil) }) != nil else { return }
        await load()
    }

    /// "Reprendre" launches the player directly: one call for the playback context, no sheet.
    func resume(_ card: ContentItem) {
        Task {
            if let hero = home?.heroes.first(where: { $0.item.id == card.id }) {
                // The carousel already holds its versions: played even when the server does not answer.
                if let ctx = try? await env.playbackContext(for: card) { env.player.play(ctx) } else { playHero(hero, version: nil, source: nil) }
            } else if let ctx = await env.attempt("Lecture", { try await env.playbackContext(for: card) }) {
                env.player.play(ctx)
            }
        }
    }
}
