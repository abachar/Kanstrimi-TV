import SwiftUI
import VLCKit

/// A list, not a grid [10]: channels on the left with category filters and the recent ones first;
/// on the right a live preview of the focused channel, its programme and "Regarder".
struct LiveView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var groups: [ChannelGroup] = []
    @State private var error: CatalogError?
    @State private var isLoading = true
    @State private var category: String?
    @State private var only4K = false
    @State private var focusedID: ContentID?
    @State private var focusedEPG: EPGNow = .empty
    @State private var preview = PreviewPlayer()
    @FocusState private var focus: ContentID?

    private var visible: [Channel] {
        groups.filter { category == nil || $0.category == category }.flatMap(\.channels).filter { !only4K || $0.maxQuality == .uhd }
    }
    private var recents: [Channel] {
        let all = groups.flatMap(\.channels)
        return env.recentChannels.entries.compactMap { e in all.first { $0.id == e.channelID } }
    }
    private var focusedChannel: Channel? { groups.flatMap(\.channels).first { $0.id == focusedID } }

    var body: some View {
        Group {
            if let error, groups.isEmpty {
                StatePanel(icon: "tv.slash", title: "Chaînes indisponibles", message: error.localizedDescription) { Task { await load() } }
            } else if isLoading && groups.isEmpty {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                HStack(alignment: .top, spacing: 40) {
                    list.frame(width: 900)
                    side.frame(maxWidth: .infinity)
                }
                .padding(.horizontal, 96).padding(.top, 30)
            }
        }
        .background(Theme.background)
        .task { if groups.isEmpty { await load() } }
        .onChange(of: focus) { _, f in
            guard let f else { return }
            focusedID = f
            Task { focusedEPG = await env.epg.now(for: f) }
            if let c = focusedChannel { preview.show(c) }
        }
        .onChange(of: env.player.isPresented) { _, presented in
            if presented { preview.stop() } else if let c = focusedChannel { preview.show(c) }
        }
        .onDisappear { preview.stop() }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            groups = try await env.call { try await env.client.channels() }
            error = nil
            if focusedID == nil { focusedID = recents.first?.id ?? visible.first?.id }
            if let f = focusedID { focusedEPG = await env.epg.now(for: f) }
        } catch {
            self.error = (error as? CatalogError) ?? .server(error.localizedDescription)
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Direct").font(.largeTitle.weight(.bold))
                    Spacer()
                    SettingsButton()
                }
                .padding(.bottom, 10)
                ScrollView(.horizontal) {
                    HStack(spacing: 10) {
                        chip("Tout", on: category == nil) { category = nil }
                        ForEach(groups) { g in chip(g.category, on: category == g.category) { category = g.category } }
                        Divider().frame(height: 36)
                        chip("4K uniquement", on: only4K) { only4K.toggle() }
                    }
                    .padding(.vertical, 16)
                }
                .scrollClipDisabled()
                if category == nil, !recents.isEmpty {
                    sectionTitle("Chaînes récentes")
                    ForEach(recents) { c in row(c, in: visible) }
                }
                ForEach(groups.filter { category == nil || $0.category == category }) { g in
                    let channels = g.channels.filter { !only4K || $0.maxQuality == .uhd }
                    if !channels.isEmpty {
                        sectionTitle(g.category)
                        ForEach(channels) { c in row(c, in: visible) }
                    }
                }
                if visible.isEmpty {
                    Text("Aucune chaîne pour ce filtre.").foregroundStyle(Theme.secondary).padding(30)
                }
            }
            .padding(.trailing, 20)
        }
        .scrollClipDisabled()
    }

    private func sectionTitle(_ t: String) -> some View {
        Text(t.uppercased()).font(.caption.weight(.bold)).tracking(1.5).foregroundStyle(Theme.secondary).padding(.top, 20).padding(.bottom, 6)
    }

    private func chip(_ text: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(text, action: action).buttonStyle(.bordered).tint(on ? Theme.accent : nil)
    }

    private func row(_ c: Channel, in order: [Channel]) -> some View {
        let expanded = focus == c.id
        return Button {
            watch(c, in: order)
        } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 16) {
                    Text(c.number.map(String.init) ?? "").font(.callout.monospacedDigit()).foregroundStyle(Theme.secondary).frame(width: 44, alignment: .trailing)
                    ChannelLogo(channel: c, size: 52)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(c.name).font(.headline)
                        if !expanded, let now = env.epg.cached(c.id)?.now {
                            Text(now.title).font(.caption).foregroundStyle(Theme.secondary).lineLimit(1)
                        }
                    }
                    Spacer()
                    if let q = c.maxQuality { Badge(q.rawValue, small: true) }
                }
                if expanded {
                    if let now = focusedEPG.now {
                        HStack(spacing: 10) {
                            Text("EN DIRECT").font(.caption2.weight(.bold)).tracking(1).padding(.horizontal, 6).padding(.vertical, 2).background(Theme.live, in: RoundedRectangle(cornerRadius: 4))
                            Text(now.title).font(.callout.weight(.semibold))
                            Spacer()
                            Text("\(Format.hour(now.start)) – \(Format.hour(now.end))").font(.caption).foregroundStyle(Theme.secondary)
                        }
                        ProgressBar(fraction: now.fraction(), height: 4)
                    }
                    HStack(spacing: 8) {
                        ForEach(c.versions) { v in
                            Text("\(v.quality.rawValue) · \(v.language.rawValue)\(v.sources.count > 1 ? " · \(v.sources.count) sources" : "")")
                                .font(.caption.weight(.semibold)).padding(.horizontal, 10).padding(.vertical, 5)
                                .background(.white.opacity(0.12), in: Capsule())
                        }
                    }
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
        }
        .buttonStyle(.card)
        .focused($focus, equals: c.id)
    }

    private var side: some View {
        VStack(alignment: .leading, spacing: 22) {
            ZStack {
                PreviewSurface(player: preview.player)
                if preview.channelID == nil || !preview.hasImage {
                    VStack(spacing: 10) {
                        Image(systemName: "tv").font(.system(size: 50)).foregroundStyle(Theme.secondary)
                        Text(preview.channelID == nil ? "Aperçu de la chaîne focalisée" : "Ouverture du flux… ≈ 2 s").font(.callout).foregroundStyle(Theme.secondary)
                    }
                }
            }
            .frame(height: 400)
            .background(.black)
            .clipShape(RoundedRectangle(cornerRadius: 22))
            if let c = focusedChannel {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 10) {
                        Text("EN DIRECT").font(.caption.weight(.bold)).tracking(1.5).padding(.horizontal, 8).padding(.vertical, 3).background(Theme.live, in: RoundedRectangle(cornerRadius: 5))
                        Text(c.name).font(.title3.weight(.bold))
                        if let q = c.maxQuality { Badge(q.rawValue) }
                        ForEach(c.versions.languages, id: \.self) { Badge($0.rawValue) }
                    }
                    if let now = focusedEPG.now {
                        Text(now.title).font(.title2.weight(.bold))
                        Text("\(Format.hour(now.start)) – \(Format.hour(now.end))" + (focusedEPG.next.map { " · Ensuite : \($0.title)" } ?? ""))
                            .foregroundStyle(Theme.secondary)
                    } else {
                        Text("Programme inconnu").foregroundStyle(Theme.secondary)
                    }
                    HStack(spacing: 16) {
                        Button { watch(c, in: visible) } label: { Label("Regarder", systemImage: "play.fill") }.buttonStyle(.borderedProminent)
                        Button { } label: { Label("Guide TV", systemImage: "calendar") }.buttonStyle(.bordered).disabled(true)
                    }
                    .padding(.top, 6)
                    Text("Droite sur une chaîne : ses flux · Haut / bas : zapping avec aperçu").font(.caption).foregroundStyle(Theme.secondary)
                }
            }
        }
    }

    private func watch(_ c: Channel, in order: [Channel]) {
        preview.stop()
        env.player.play(channel: c, in: order.isEmpty ? [c] : order)
        env.recentChannels.record(c.id)
    }
}

/// A second, silent VLC instance for the side preview. It closes the previous stream and opens the new one.
@Observable
final class PreviewPlayer: NSObject, VLCMediaPlayerDelegate {
    let player = VLCMediaPlayer(options: ["--network-caching=1000", "--no-video-title-show"])
    private(set) var channelID: ContentID?
    private(set) var hasImage = false
    private var debounce: Task<Void, Never>?

    override init() {
        super.init()
        player.delegate = self
        player.audio?.isMuted = true
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

struct PreviewSurface: UIViewRepresentable {
    let player: VLCMediaPlayer
    func makeUIView(context: Context) -> UIView {
        let v = UIView()
        v.backgroundColor = .black
        player.drawable = v
        return v
    }
    func updateUIView(_ uiView: UIView, context: Context) {
        if (player.drawable as? UIView) !== uiView { player.drawable = uiView }
    }
}
