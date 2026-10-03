import AVFoundation
import AetherEngine
import Combine
import SwiftUI

/// Direct in three columns on TV: categories with their count, the channels of the selected one,
/// and on the right the live preview of the focused channel with its programme. On a phone the
/// categories are chips above the channel list and a tap plays the channel; no preview.
struct LiveView: View {
    private enum CategoryID: Hashable { case recent, mostWatched, favorites, group(String) }

    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics
    @State private var groups: [ChannelGroup] = []
    @State private var error: CatalogError?
    @State private var isLoading = true
    @State private var selected: CategoryID = .recent
    @State private var focusedChannelID: ContentID?
    @State private var focusedDetail: Channel?
    @State private var preview = PreviewPlayer()
    @State private var isVisible = false
    @FocusState private var focus: Focus?
    private enum Focus: Hashable { case category(CategoryID), channel(ContentID), watch }

    /// Every channel once, and by id: built at each load, read at every move of the focus.
    @State private var allChannels: [Channel] = []
    @State private var channelByID: [ContentID: Channel] = [:]
    private var recents: [Channel] { env.recentChannels.entries.compactMap { channelByID[$0.channelID] } }
    private var favorites: [Channel] { allChannels.filter { $0.isFavorite == true } }
    /// The server's ranking over the last 30 days; a channel sits in several groups, counted once.
    private var mostWatched: [Channel] {
        var seen = Set<ContentID>()
        return allChannels.filter { $0.watchedRank != nil && seen.insert($0.id).inserted }.sorted { $0.watchedRank! < $1.watchedRank! }
    }

    /// The channels of the selected category, in the order used for zapping.
    private var visible: [Channel] {
        switch selected {
        case .recent: recents
        case .mostWatched: mostWatched
        case .favorites: favorites
        case .group(let id): groups.first { $0.id == id }?.channels ?? []
        }
    }
    private var focusedChannel: Channel? { focusedChannelID.flatMap { channelByID[$0] } }

    var body: some View {
        Group {
            if let error, groups.isEmpty {
                StatePanel(icon: "tv.slash", title: "Chaînes indisponibles", message: error.localizedDescription) { Task { await load() } }
            } else if isLoading && groups.isEmpty {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if metrics.liveColumns {
                // Columns in proportion of the width left inside the margins: the channel list and
                // the preview both grow with the screen instead of leaving the preview to absorb it all.
                GeometryReader { geo in
                    let width = geo.size.width - 2 * metrics.inset - 60
                    HStack(alignment: .top, spacing: 30) {
                        categories.frame(width: width * 0.28)
                        channelList.frame(width: width * 0.38)
                        side.frame(maxWidth: .infinity)
                    }
                    .padding(.horizontal, metrics.inset).padding(.top, 30)
                }
                .ignoresSafeArea(edges: .horizontal)
            } else {
                // iPhone: the title is the navigation bar's; one menu picks the category above the list.
                VStack(alignment: .leading, spacing: 8) {
                    categoryMenu.padding(.horizontal, metrics.inset)
                    channelList.padding(.horizontal, metrics.inset)
                }
            }
        }
        .background(Theme.background)
        .phoneLargeTitle("Direct")
        .task { if groups.isEmpty { await load() } }
        // A channel left: its watch time may change « Les plus regardées ».
        .onChange(of: env.player.progressRevision) { Task { await load() } }
        .onChange(of: env.resumeRevision) { Task { await load() } }
        .onChange(of: focus) { _, f in
            switch f {
            case .category(let id): selected = id
            case .channel(let id): focusChannel(id)
            default: break
            }
        }
        .onChange(of: env.player.isPresented) { _, presented in
            if presented {
                preview.stop()
            } else if isVisible {
                // Back from the player: on the channel that was playing, not on the first column.
                if let id = focusedChannelID { focus = .channel(id) }
                if let c = focusedChannel { showPreview(c) }
            }
        }
        .onAppear {
            isVisible = true
            if !env.player.isPresented, let c = focusedChannel { showPreview(c) }
        }
        .onDisappear {
            isVisible = false
            preview.stop()
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            groups = try await env.call { try await env.client.channels() }
            allChannels = groups.flatMap(\.channels)
            // A channel sits in several groups: the first one wins, as `first(where:)` did.
            channelByID = Dictionary(allChannels.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
            error = nil
            if recents.isEmpty {
                selected = !mostWatched.isEmpty ? .mostWatched : !favorites.isEmpty ? .favorites : .group(groups.first?.id ?? "")
            }
            if focusedChannelID == nil, let first = visible.first { focusChannel(first.id) }
        } catch is CancellationError {
            // The screen went away first: nothing to show.
        } catch {
            self.error = (error as? CatalogError) ?? .server(error.localizedDescription)
        }
    }

    private func focusChannel(_ id: ContentID) {
        focusedChannelID = id
        focusedDetail = env.channelCache.cached(id)
        Task {
            let c = await env.channelCache.channel(id)
            guard focusedChannelID == id else { return }
            focusedDetail = c
            // The detail's links are fresh; the list's may have expired while the screen stayed open.
            if isVisible, !env.player.isPresented, let channel = focusedChannel { showPreview(channel) }
        }
        if isVisible, !env.player.isPresented, let c = focusedChannel { showPreview(c) }
    }

    /// The quality and language the channel is shown in (`liveVersion`: remembered, else the best); the
    /// channel's best and languages when it has no version.
    @ViewBuilder private func versionBadges(_ c: Channel, small: Bool) -> some View {
        if let v = env.liveVersion(of: c) {
            Badge(v.quality.rawValue, small: small)
            Badge(v.language.rawValue, small: small)
        } else {
            if let q = c.maxQuality { Badge(q.rawValue, small: small) }
            ForEach(c.versions.languages.prefix(2), id: \.self) { Badge($0.rawValue, small: small) }
        }
    }

    /// The side preview exists only in the three-column layout: a phone streams nothing until a tap. It
    /// shows the version the channel would start in: « TF1 » switched to FHD previews in FHD.
    private func showPreview(_ c: Channel) {
        let versions = focusedDetail?.id == c.id ? focusedDetail?.versions ?? c.versions : c.versions
        guard metrics.liveColumns, let url = env.player.startChoice(c.id, versions: versions)?.source.streamURL else { return }
        preview.show(c.id, url: url)
    }

    /// Phone: the selected category as a button whose menu lists them all, Récentes, Les plus regardées and Favoris first,
    /// then the groups by market ("France · Sport" under France). Too many groups for a row of chips.
    private var categoryMenu: some View {
        Menu {
            if !recents.isEmpty || !mostWatched.isEmpty || !favorites.isEmpty {
                Section {
                    if !recents.isEmpty { menuItem(.recent, name: "Récentes", count: recents.count, icon: "clock") }
                    if !mostWatched.isEmpty { menuItem(.mostWatched, name: "Les plus regardées", count: mostWatched.count, icon: "flame") }
                    if !favorites.isEmpty { menuItem(.favorites, name: "Favoris", count: favorites.count, icon: "heart") }
                }
            }
            ForEach(markets, id: \.name) { market in
                Section(market.name) {
                    ForEach(market.groups) { g in menuItem(.group(g.id), name: g.themeName, count: g.channels.count, icon: nil) }
                }
            }
        } label: {
            HStack(spacing: 8) {
                Text(selectedName).font(.headline).lineLimit(1)
                Text("\(visible.count)").font(.subheadline).foregroundStyle(Theme.secondary)
                Image(systemName: "chevron.up.chevron.down").font(.footnote.weight(.semibold)).foregroundStyle(Theme.secondary)
            }
            .padding(.horizontal, 14).frame(height: 38)
            .background(Capsule().fill(.white.opacity(0.12)))
        }
        .sensoryFeedback(.selection, trigger: selected)
    }

    private func menuItem(_ id: CategoryID, name: String, count: Int, icon: String?) -> some View {
        Button { selected = id } label: {
            if selected == id {
                Label("\(name) · \(count)", systemImage: "checkmark")
            } else if let icon {
                Label("\(name) · \(count)", systemImage: icon)
            } else {
                Text("\(name) · \(count)")
            }
        }
    }

    /// The groups by country, in the server's order: "France · Sport" goes under "France".
    private var markets: [(name: String, groups: [ChannelGroup])] {
        var result: [(name: String, groups: [ChannelGroup])] = []
        for g in groups {
            let market = g.sectionName
            if let i = result.firstIndex(where: { $0.name == market }) { result[i].groups.append(g) } else { result.append((market, [g])) }
        }
        return result
    }

    private var selectedName: String {
        switch selected {
        case .recent: "Récentes"
        case .mostWatched: "Les plus regardées"
        case .favorites: "Favoris"
        case .group(let id): groups.first { $0.id == id }?.name ?? "Catégorie"
        }
    }

    // MARK: - Column 1: categories

    private var categories: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                Text("Direct").font(.largeTitle.weight(.bold)).padding(.bottom, 16)
                if !recents.isEmpty { categoryRow(.recent, name: "Récentes", count: recents.count, icon: "clock") }
                if !mostWatched.isEmpty { categoryRow(.mostWatched, name: "Les plus regardées", count: mostWatched.count, icon: "flame") }
                if !favorites.isEmpty { categoryRow(.favorites, name: "Favoris", count: favorites.count, icon: "heart") }
                // A grey heading per country, its themes under it.
                ForEach(markets, id: \.name) { market in
                    Text(market.name.uppercased())
                        .font(.caption.weight(.semibold)).foregroundStyle(Theme.secondary)
                        .padding(.horizontal, 16).padding(.top, 22).padding(.bottom, 2)
                    ForEach(market.groups) { g in categoryRow(.group(g.id), name: g.themeName, count: g.channels.count, icon: nil) }
                }
            }
            .padding(.trailing, 10)
        }
        .scrollClipDisabled()
    }

    private func categoryRow(_ id: CategoryID, name: String, count: Int, icon: String?) -> some View {
        let on = selected == id
        return Button {
            selected = id
            if let first = visible.first { focus = .channel(first.id) }
        } label: {
            // Every name starts at the same edge: the groups keep an empty slot where the others have their icon,
            // which faces the name rather than the two lines.
            HStack(alignment: .firstTextBaseline, spacing: 14) {
                Image(systemName: icon ?? "circle").frame(width: 30).opacity(icon == nil ? 0 : 1)
                VStack(alignment: .leading, spacing: 2) {
                    Text(name).font(on ? .callout.weight(.semibold) : .callout)
                    Text("\(count) chaîne\(count > 1 ? "s" : "")").font(.caption).foregroundStyle(Theme.secondary)
                }
                Spacer()
            }
            .padding(.horizontal, 16).padding(.vertical, 10)
        }
        .buttonStyle(.plain)
        .opacity(on ? 1 : 0.7)
        .focused($focus, equals: .category(id))
    }

    // MARK: - Column 2: channels

    private var channelList: some View {
        ScrollView {
            LazyVStack(spacing: metrics.compact ? 2 : 10) {
                ForEach(visible) { c in channelRow(c) }
                if visible.isEmpty {
                    Text("Aucune chaîne dans cette catégorie.").foregroundStyle(Theme.secondary).padding(30)
                }
            }
            .padding(.vertical, 10)
        }
        // tvOS lets the focus growth spill over; on a phone the list must stay under the category menu.
        .scrollClipDisabled(!metrics.compact)
    }

    /// iPhone: the programme's hours, a long press to watch. tvOS: nothing asked from the row, the side column shows the
    /// focused channel's programme.
    @ViewBuilder private func channelRow(_ c: Channel) -> some View {
        if metrics.compact {
            LoadedChannelCard(channel: c, hours: true) { watch(c) }
                .touchContextMenu {
                    Button { watch(c) } label: { Label("Regarder", systemImage: "play.fill") }
                }
        } else {
            LoadedChannelCard(channel: c, loads: false) { watch(c) }
                .focused($focus, equals: .channel(c.id))
        }
    }

    // MARK: - Column 3: preview and programme

    private var side: some View {
        VStack(alignment: .leading, spacing: 20) {
            ZStack {
                VideoSurface(view: preview.videoView)
                if preview.channelID == nil || !preview.hasImage {
                    VStack(spacing: 10) {
                        Image(systemName: "tv").font(.system(size: 50)).foregroundStyle(Theme.secondary)
                        Text(preview.channelID == nil ? "Aperçu de la chaîne focalisée" : "Ouverture du flux… ≈ 2 s").font(.callout).foregroundStyle(Theme.secondary)
                    }
                }
            }
            .frame(height: 360)
            .background(.black)
            .clipShape(RoundedRectangle(cornerRadius: 22))
            if let c = focusedChannel {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 10) {
                        Text("EN DIRECT").font(.caption.weight(.bold)).tracking(1.5).padding(.horizontal, 8).padding(.vertical, 3).background(Theme.live, in: RoundedRectangle(cornerRadius: 5))
                        Text(c.name).font(.headline).lineLimit(1).minimumScaleFactor(0.8)
                        versionBadges(c, small: false)
                    }
                    if let guide = focusedDetail.map(env.guide(of:)), let now = guide.now {
                        ProgrammeCard(programme: now, width: metrics.panelCard * 1.4)
                        if let next = guide.next {
                            Text("Ensuite : \(next.title) · \(Format.hour(next.start))").font(.caption).foregroundStyle(Theme.secondary)
                        }
                    } else if focusedDetail == nil {
                        ProgressView().padding(.vertical, 10)
                    } else {
                        Text("Programme inconnu").foregroundStyle(Theme.secondary)
                    }
                    HStack(spacing: 8) {
                        let start = env.liveVersion(of: c)?.id
                        ForEach(c.versions) { v in
                            // "×3" = backup sources, the same mark as the version matrix of the detail page. The
                            // version the channel starts in stands out.
                            HStack(spacing: 6) {
                                Text("\(v.quality.rawValue) · \(v.language.rawValue)")
                                if v.sources.count > 1 {
                                    Text("×\(v.sources.count)").foregroundStyle(v.id == start ? Color.black.opacity(0.6) : Theme.secondary)
                                }
                            }
                            .font(.caption.weight(.semibold)).padding(.horizontal, 10).padding(.vertical, 5)
                            .foregroundStyle(v.id == start ? Color.black : Theme.text)
                            .background(v.id == start ? AnyShapeStyle(Theme.accent) : AnyShapeStyle(.white.opacity(0.12)), in: Capsule())
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel("\(v.quality.rawValue) \(v.language.label)\(v.sources.count > 1 ? ", \(v.sources.count) sources" : "")")
                        }
                    }
                    Button { watch(c) } label: { Label("Regarder", systemImage: "play.fill") }
                        .prominentButtonStyle()
                        .focused($focus, equals: .watch)
                        .padding(.top, 6)
                }
            }
        }
    }

    private func watch(_ c: Channel) {
        preview.stop()
        let order = visible.isEmpty ? [c] : visible
        env.player.play(channel: c, in: order.contains(c) ? order : [c] + order)
        env.recentChannels.record(c.id)
    }
}

/// Side preview of the focused channel: a second engine with its own surface, heard once its picture shows, created at the
/// first `show` (a phone has no preview column and never creates it). The account allows one connection,
/// so `LiveView` stops it before any playback starts.
@Observable
final class PreviewPlayer {
    /// The surface the engine draws into, kept here because the engine holds its views weakly.
    let videoView = AetherPlayerView(frame: .zero)
    private(set) var channelID: ContentID?
    private(set) var hasImage = false
    @ObservationIgnored private var engine: AetherEngine?
    @ObservationIgnored private var cancellables = Set<AnyCancellable>()
    @ObservationIgnored private var debounce: Task<Void, Never>?
    @ObservationIgnored private var loadTask: Task<Void, Never>?
    @ObservationIgnored private var streamURL: URL?
    @ObservationIgnored private var pendingURL: URL?
    /// Reloads of the current channel after a source reset: one at most, then the placeholder stays.
    @ObservationIgnored private var resets = 0

    func show(_ id: ContentID, url: URL) {
        if id == channelID {
            // Not started yet: a fresher link (the channel's detail, asked at focus) replaces the list's.
            if debounce != nil { pendingURL = url }
            return
        }
        stop()
        channelID = id
        resets = 0
        pendingURL = url
        debounce = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(400))
            guard let self, !Task.isCancelled, let url = pendingURL else { return }
            debounce = nil
            streamURL = url
            start(url)
        }
    }

    /// Synchronous: nothing of the preview is still connecting or playing when it returns.
    func stop() {
        debounce?.cancel(); debounce = nil
        loadTask?.cancel(); loadTask = nil
        engine?.volume = 0
        engine?.stop()
        streamURL = nil
        pendingURL = nil
        channelID = nil
        hasImage = false
    }

    private func start(_ url: URL) {
        let engine = makeEngine()
        hasImage = false
        loadTask?.cancel()
        engine.stop()
        // Its sound needs the session active; the player screen activates it the same way.
        try? AVAudioSession.sharedInstance().setActive(true)
        // Decoded in the app, like the live in the player: the picture comes within a second of the focus.
        var options = LoadOptions(suppressDisplayCriteria: true, isLive: true, liveJoinProfile: .fastZap, maxConcurrentSourceRequests: 1)
        options.preferredDecodePath = .software
        loadTask = Task { _ = try? await engine.load(url: url, options: options) }
    }

    private func makeEngine() -> AetherEngine {
        if let engine { return engine }
        let engine: AetherEngine
        do { engine = try AetherEngine() } catch { fatalError("AetherEngine failed to start: \(error)") }
        engine.volume = 0
        // The player screen owns the audio session: the preview must not release it.
        engine.deactivatesAudioSessionOnStop = false
        engine.bind(view: videoView)
        // Each sink hops to the next main-queue turn: `@Published` emits before it stores the value.
        engine.$hasFirstFrameReadyForDisplay
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in
                guard let self else { return }
                hasImage = $0 && channelID != nil
                // The sound comes with the picture, not while the stream is still connecting.
                self.engine?.volume = hasImage ? 1 : 0
            }
            .store(in: &cancellables)
        engine.liveSourceReset
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in
                guard let self, let streamURL, resets < 1 else { return }
                resets += 1
                start(streamURL)
            }
            .store(in: &cancellables)
        self.engine = engine
        return engine
    }
}
