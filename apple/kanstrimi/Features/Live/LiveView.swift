import SwiftUI

import VLCKit

/// Direct in three columns on TV: categories with their count, the channels of the selected one,
/// and on the right the live preview of the focused channel with its programme. On a phone the
/// categories are chips above the channel list and a tap plays the channel; no preview.
struct LiveView: View {
    private enum CategoryID: Hashable { case recent, favorites, group(String) }

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

    private var allChannels: [Channel] { groups.flatMap(\.channels) }
    private var recents: [Channel] { env.recentChannels.entries.compactMap { e in allChannels.first { $0.id == e.channelID } } }
    private var favorites: [Channel] { allChannels.filter { $0.isFavorite == true } }

    /// The channels of the selected category, in the order used for zapping.
    private var visible: [Channel] {
        switch selected {
        case .recent: recents
        case .favorites: favorites
        case .group(let id): groups.first { $0.id == id }?.channels ?? []
        }
    }
    private var focusedChannel: Channel? { allChannels.first { $0.id == focusedChannelID } }

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
                        categories.frame(width: width * 0.29)
                        channelList.frame(width: width * 0.31)
                        side.frame(maxWidth: .infinity)
                    }
                    .padding(.horizontal, metrics.inset).padding(.top, 30)
                }
                .ignoresSafeArea(edges: .horizontal)
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Direct").font(.largeTitle.weight(.bold)).padding(.horizontal, metrics.inset)
                    categoryChips
                    channelList.padding(.horizontal, metrics.inset)
                }
                .padding(.top, 10)
            }
        }
        .background(Theme.background)
        .task { if groups.isEmpty { await load() } }
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
            error = nil
            if recents.isEmpty { selected = favorites.isEmpty ? .group(groups.first?.id ?? "") : .favorites }
            if focusedChannelID == nil, let first = visible.first { focusChannel(first.id) }
        } catch {
            self.error = (error as? CatalogError) ?? .server(error.localizedDescription)
        }
    }

    private func focusChannel(_ id: ContentID) {
        focusedChannelID = id
        focusedDetail = env.channelCache.cached(id)
        Task {
            let c = await env.channelCache.channel(id)
            if focusedChannelID == id { focusedDetail = c }
        }
        if isVisible, !env.player.isPresented, let c = focusedChannel { showPreview(c) }
    }

    /// The side preview exists only in the three-column layout: a phone streams nothing until a tap.
    private func showPreview(_ c: Channel) {
        if metrics.liveColumns { preview.show(c) }
    }

    /// Phone: one chip per category above the list.
    private var categoryChips: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                if !recents.isEmpty { chip(.recent, name: "Récentes", count: recents.count) }
                if !favorites.isEmpty { chip(.favorites, name: "Favoris", count: favorites.count) }
                ForEach(groups) { g in chip(.group(g.id), name: g.name, count: g.channels.count) }
            }
            .padding(.horizontal, metrics.inset)
        }
        .scrollClipDisabled()
        .buttonStyle(.bordered)
    }

    private func chip(_ id: CategoryID, name: String, count: Int) -> some View {
        Button("\(name) · \(count)") { selected = id }
            .tint(selected == id ? Theme.accent : nil)
    }

    // MARK: - Column 1: categories

    private var categories: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                Text("Direct").font(.largeTitle.weight(.bold)).padding(.bottom, 16)
                if !recents.isEmpty { categoryRow(.recent, name: "Récentes", count: recents.count, icon: "clock") }
                if !favorites.isEmpty { categoryRow(.favorites, name: "Favoris", count: favorites.count, icon: "star") }
                ForEach(groups) { g in categoryRow(.group(g.id), name: g.name, count: g.channels.count, icon: nil) }
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
            HStack(spacing: 14) {
                if let icon { Image(systemName: icon).frame(width: 30) }
                VStack(alignment: .leading, spacing: 2) {
                    Text(name).font(on ? .headline : .body)
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
            LazyVStack(spacing: 10) {
                ForEach(visible) { c in channelRow(c) }
                if visible.isEmpty {
                    Text("Aucune chaîne dans cette catégorie.").foregroundStyle(Theme.secondary).padding(30)
                }
            }
            .padding(.vertical, 10)
        }
        .scrollClipDisabled()
    }

    private func channelRow(_ c: Channel) -> some View {
        Button {
            watch(c)
        } label: {
            HStack(spacing: 18) {
                ChannelLogo(channel: c, size: metrics.channelLogo)
                VStack(alignment: .leading, spacing: 8) {
                    Text(c.name).font(.headline)
                    if let now = env.channelCache.cached(c.id)?.now {
                        Text(now.title).font(.callout).foregroundStyle(Theme.secondary).lineLimit(1)
                    }
                    HStack(spacing: 6) {
                        if let q = c.maxQuality { Badge(q.rawValue, small: true) }
                        if c.hasEPG == true { Badge("EPG", small: true) }
                        ForEach(c.versions.languages.prefix(2), id: \.self) { Badge($0.rawValue, small: true) }
                    }
                }
                Spacer()
                if c.isFavorite == true { Image(systemName: "star.fill").foregroundStyle(Theme.accent) }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .cardButtonStyle()
        .focused($focus, equals: .channel(c.id))
    }

    // MARK: - Column 3: preview and programme

    private var side: some View {
        VStack(alignment: .leading, spacing: 20) {
            ZStack {
                VLCVideoView(view: preview.videoView)
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
                        Text(c.name).font(.title3.weight(.bold))
                        if let q = c.maxQuality { Badge(q.rawValue) }
                        ForEach(c.versions.languages, id: \.self) { Badge($0.rawValue) }
                    }
                    if let now = focusedDetail?.now {
                        Text("En ce moment").font(.caption).foregroundStyle(Theme.secondary)
                        Text(now.title).font(.title2.weight(.bold))
                        if let o = now.overview { Text(o).font(.callout).foregroundStyle(Theme.secondary).lineLimit(4) }
                        ProgressBar(fraction: now.fraction(), height: 5)
                        HStack {
                            Text(Format.hour(now.start)); Spacer(); Text(Format.hour(now.end))
                        }
                        .font(.caption).foregroundStyle(Theme.secondary)
                        if let next = focusedDetail?.next {
                            Text("Ensuite : \(next.title) · \(Format.hour(next.start))").font(.callout).foregroundStyle(Theme.secondary)
                        }
                    } else if focusedDetail == nil {
                        ProgressView().padding(.vertical, 10)
                    } else {
                        Text("Programme inconnu").foregroundStyle(Theme.secondary)
                    }
                    HStack(spacing: 8) {
                        ForEach(c.versions) { v in
                            Text("\(v.quality.rawValue) · \(v.language.rawValue)\(v.sources.count > 1 ? " · \(v.sources.count) sources" : "")")
                                .font(.caption.weight(.semibold)).padding(.horizontal, 10).padding(.vertical, 5)
                                .background(.white.opacity(0.12), in: Capsule())
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

/// A second, silent VLC instance for the side preview. It closes the previous stream and opens the new one.
@Observable
final class PreviewPlayer: NSObject, VLCMediaPlayerDelegate {
    let player = VLCMediaPlayer(options: ["--network-caching=1000", "--no-video-title-show", "--no-audio"])
    /// The surface VLC draws into, attached once, before any playback.
    let videoView: PlatformView = makeBlackSurface()
    private(set) var channelID: ContentID?
    private(set) var hasImage = false
    private var debounce: Task<Void, Never>?

    override init() {
        super.init()
        player.delegate = self
        player.drawable = videoView
    }

    func show(_ channel: Channel) {
        guard channel.id != channelID else { return }
        channelID = channel.id
        hasImage = false
        debounce?.cancel()
        debounce = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(400))
            guard let self, !Task.isCancelled, let url = channel.versions.first?.sources.first?.streamURL else { return }
            player.stop()
            player.media = VLCMedia(url: url)
            player.play()
        }
    }

    func stop() {
        debounce?.cancel()
        player.stop()
        channelID = nil
        hasImage = false
    }

    nonisolated func mediaPlayerStateChanged(_ newState: VLCMediaPlayerState) {
        Task { @MainActor in self.hasImage = newState == .playing && self.player.hasVideoOut }
    }
}
