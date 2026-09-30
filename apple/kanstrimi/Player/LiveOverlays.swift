import SwiftUI

/// "EN DIRECT · 4K · FR · Source A", programme and the zapping banner [16].
struct LiveBanner: View {
    @Environment(AppEnvironment.self) private var env
    let visible: Bool
    private var player: PlayerService { env.player }

    var body: some View {
        VStack {
            HStack(alignment: .top) {
                if visible {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 10) {
                            Text("EN DIRECT").font(.caption.weight(.bold)).tracking(1.5)
                                .padding(.horizontal, 8).padding(.vertical, 3).background(Theme.live, in: RoundedRectangle(cornerRadius: 5))
                            if let v = player.version, let s = player.source {
                                Text("\(v.shortQualityLabel) · \(v.language.rawValue) · \(player.sourceLabel(s, in: v))").font(.callout.weight(.semibold))
                            }
                        }
                        Text(player.channel?.name ?? "").font(.title2.weight(.bold))
                        if let now = player.epg.now {
                            Text(now.title).font(.headline)
                            Text("\(Format.hour(now.start)) – \(Format.hour(now.end))" + (player.epg.next.map { " · Ensuite : \($0.title) · \(Format.hour($0.start))" } ?? ""))
                                .font(.callout).foregroundStyle(Theme.secondary)
                            ProgressBar(fraction: now.fraction(), height: 5).frame(maxWidth: 420)
                        }
                    }
                    .padding(.horizontal, 24).padding(.vertical, 18)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20))
                    .transition(.opacity)
                }
                Spacer()
                if player.zapBanner { zapColumn.transition(.move(edge: .trailing).combined(with: .opacity)) }
            }
            Spacer()
            if visible, Platform.isTV {
                HStack(spacing: 30) {
                    hint("◀", "Chaînes du groupe")
                    hint("▶", "Programme")
                    hint("▲", "Dernières chaînes")
                    hint("▼", "Qualité · Audio · Sous-titres")
                    hint("‹", "Retour · quitter")
                }
                .font(.callout).foregroundStyle(Theme.secondary)
                .transition(.opacity)
            }
        }
        .playerChromeInsets()
        .allowsHitTesting(false)
    }

    private var zapColumn: some View {
        let n = player.neighbours
        return VStack(alignment: .trailing, spacing: 10) {
            if let p = n.previous { zapRow(p, current: false, arrow: "▲") }
            if let c = player.channel { zapRow(c, current: true, arrow: "") }
            if let x = n.next { zapRow(x, current: false, arrow: "▼") }
        }
        .padding(16)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18))
    }

    private func zapRow(_ c: Channel, current: Bool, arrow: String) -> some View {
        HStack(spacing: 12) {
            Text(arrow).font(.caption).foregroundStyle(Theme.secondary).frame(width: 20)
            ChannelLogo(channel: c, size: 32)
            Text(c.name).font(current ? .headline : .callout).foregroundStyle(current ? Theme.text : Theme.secondary)
            if let q = c.maxQuality { Badge(q.rawValue) }
        }
    }

    private func hint(_ key: String, _ text: String) -> some View {
        HStack(spacing: 8) {
            Text(key).font(.callout.weight(.bold)).padding(.horizontal, 8).padding(.vertical, 2)
                .background(RoundedRectangle(cornerRadius: 6).fill(.white.opacity(0.14)))
            Text(text)
        }
    }
}

/// ◀ on tvOS: the channels of the group the live started from.
struct ChannelListOverlay: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics
    @FocusState private var focusedID: ContentID?
    let onClose: () -> Void
    var onActivity: () -> Void = { }
    private var player: PlayerService { env.player }

    var body: some View {
        HStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 8) {
                    Text("Chaînes").font(.title2.weight(.bold)).padding(.bottom, 10)
                    ForEach(player.channels) { c in
                        Button {
                            player.play(channel: c, in: player.channels)
                            env.recentChannels.record(c.id)
                            onClose()
                        } label: {
                            HStack(spacing: 14) {
                                ChannelLogo(channel: c, size: 44)
                                Text(c.name).frame(maxWidth: .infinity, alignment: .leading)
                                if let q = c.maxQuality { Badge(q.rawValue) }
                                if c.id == player.channel?.id { Image(systemName: "play.fill").foregroundStyle(Theme.accent) }
                            }
                            .padding(.horizontal, 10)
                        }
                        .focused($focusedID, equals: c.id)
                    }
                }
                .padding(metrics.panelPadding)
            }
            .frame(width: metrics.listWidth)
            .background(.thinMaterial.opacity(0.9))
            Spacer()
        }
        .ignoresSafeArea()
        .touchActivity(onActivity)
        .onAppear { focusedID = player.channel?.id ?? player.channels.first?.id }
        .onChange(of: focusedID) { _, _ in onActivity() }
    }
}

/// ▲ on tvOS: the 8 last channels, most recent first; the previous one is focused [22].
struct RecentChannelsOverlay: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics
    @FocusState private var focusedID: ContentID?
    let onClose: () -> Void
    var onActivity: () -> Void = { }
    private var player: PlayerService { env.player }

    private var recents: [(entry: RecentChannelsStore.Entry, channel: Channel)] {
        env.recentChannels.entries.compactMap { e in
            player.channels.first { $0.id == e.channelID }.map { (e, $0) }
        }
    }

    var body: some View {
        VStack {
            Spacer()
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text("Chaînes récentes").font(.title2.weight(.bold))
                    Text("clic = bascule immédiate").font(.callout).foregroundStyle(Theme.secondary)
                }
                if recents.isEmpty {
                    Text("Aucune chaîne regardée récemment.").foregroundStyle(Theme.secondary).padding(.vertical, 30)
                } else {
                    ScrollView(.horizontal) {
                        HStack(spacing: 20) {
                            ForEach(recents, id: \.entry.channelID) { r in
                                RecentChannelCard(channel: r.channel, watchedAt: r.entry.watchedAt, isCurrent: r.channel.id == player.channel?.id) {
                                    player.play(channel: r.channel, in: player.channels)
                                    env.recentChannels.record(r.channel.id)
                                    onClose()
                                }
                                .focused($focusedID, equals: r.channel.id)
                            }
                        }
                        .padding(.vertical, 24).padding(.horizontal, 8)
                    }
                }
            }
            .padding(metrics.panelPadding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.thinMaterial.opacity(0.9))
        }
        .ignoresSafeArea()
        .touchActivity(onActivity)
        .onAppear { focusedID = env.recentChannels.previous(excluding: player.channel?.id) ?? recents.first?.channel.id }
        .onChange(of: focusedID) { _, _ in onActivity() }
    }
}

struct RecentChannelCard: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics
    let channel: Channel
    let watchedAt: Date
    let isCurrent: Bool
    let action: () -> Void
    @State private var now: Programme?

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    ChannelLogo(channel: channel, size: 56)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(channel.name).font(.headline)
                        Text(isCurrent ? "en cours" : Format.ago(watchedAt)).font(.caption).foregroundStyle(Theme.secondary)
                    }
                    Spacer()
                    if let q = channel.maxQuality { Badge(q.rawValue) }
                }
                if let now {
                    Text(now.title).font(.callout).lineLimit(1)
                    ProgressBar(fraction: now.fraction(), height: 4)
                } else {
                    Text(" ").font(.callout)
                }
            }
            .padding(18)
            .frame(width: metrics.recentCard)
        }
        .cardButtonStyle()
        .task { now = await env.channelCache.channel(channel.id)?.now }
    }
}

/// Logo placeholder: the mock has none, so initials on the channel's colour.
/// The channel's logo (iptv-org's, served by our server, else the provider's) on a light tile:
/// most logos are drawn for a light background. Initials on the channel's colour meanwhile or without one.
struct ChannelLogo: View {
    let channel: Channel
    var size: CGFloat = 64
    var body: some View {
        ZStack {
            if let url = channel.logo {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        ZStack {
                            RoundedRectangle(cornerRadius: size * 0.22).fill(.white.opacity(0.92))
                            image.resizable().scaledToFit().padding(size * 0.12)
                        }
                    } else {
                        initialsTile
                    }
                }
            } else {
                initialsTile
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: size * 0.22))
    }
    private var initialsTile: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.22).fill(Theme.art(for: channel.id))
            Text(initials).font(.system(size: size * 0.36, weight: .heavy)).foregroundStyle(.white)
        }
    }
    private var initials: String {
        let words = channel.name.split(separator: " ")
        return words.prefix(2).compactMap { $0.first.map(String.init) }.joined().uppercased()
    }
}
