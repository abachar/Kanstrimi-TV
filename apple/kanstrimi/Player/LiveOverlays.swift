import SwiftUI

/// iOS: "EN DIRECT · 4K · FR · Source A", programme and the zapping banner [16].
/// tvOS shows its bar instead (`PlayerBar`).
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
}

/// ◀ on tvOS: the channels of the group the live started from, each with what it shows now.
struct ChannelListOverlay: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics
    @FocusState private var focusedID: ContentID?
    let onClose: () -> Void
    var onActivity: () -> Void = { }
    private var player: PlayerService { env.player }

    var body: some View {
        HStack(spacing: 0) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    Text("Chaînes").font(.title2.weight(.bold)).padding(.bottom, 6)
                    ForEach(player.channels) { c in
                        ChannelListRow(channel: c, isCurrent: c.id == player.channel?.id) {
                            player.play(channel: c, in: player.channels)
                            env.recentChannels.record(c.id)
                            onClose()
                        }
                        .focused($focusedID, equals: c.id)
                    }
                }
                .padding(metrics.panelPadding)
            }
            .scrollClipDisabled()
            .frame(width: metrics.listWidth)
            .background(.ultraThinMaterial)
            .background(.black.opacity(0.35))
            // The video stays readable on the right, darkened towards the list.
            LinearGradient(colors: [.black.opacity(0.35), .clear], startPoint: .leading, endPoint: .trailing)
                .frame(width: 160)
            Spacer(minLength: 0)
        }
        .ignoresSafeArea()
        .touchActivity(onActivity)
        .onAppear { focusedID = player.channel?.id ?? player.channels.first?.id }
        .onChange(of: focusedID) { _, _ in onActivity() }
    }
}

/// A channel of the ◀ list: logo, name, the programme on air and its progress; the one playing marked.
private struct ChannelListRow: View {
    @Environment(AppEnvironment.self) private var env
    let channel: Channel
    let isCurrent: Bool
    let action: () -> Void
    /// The list's own, else the guide asked at display (kept a minute by the cache).
    private var now: Programme? { channel.now ?? env.channelCache.cached(channel.id)?.now }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 18) {
                ChannelLogo(channel: channel, size: 64)
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 10) {
                        Text(channel.name).font(.callout.weight(.semibold)).lineLimit(1)
                        if isCurrent {
                            Text("EN COURS").font(.caption2.weight(.bold)).tracking(1).foregroundStyle(Theme.accent)
                        }
                    }
                    if let now {
                        Text(now.title).font(.caption).foregroundStyle(Theme.secondary).lineLimit(1)
                        ProgressBar(fraction: now.fraction(), height: 4).frame(maxWidth: 260)
                    } else {
                        Text(channel.hasEPG == false ? "Pas de programme" : " ").font(.caption).foregroundStyle(Theme.secondary)
                    }
                }
                Spacer(minLength: 0)
                if let q = channel.maxQuality { Badge(q.rawValue, small: true) }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .cardButtonStyle()
        .task {
            if now == nil, channel.hasEPG != false { _ = await env.channelCache.channel(channel.id) }
        }
    }
}

/// iOS: the 8 last channels, most recent first; the previous one is focused [22].
struct RecentChannelsOverlay: View {
    @Environment(\.metrics) private var metrics
    let onClose: () -> Void
    var onActivity: () -> Void = { }

    var body: some View {
        VStack {
            Spacer()
            VStack(alignment: .leading, spacing: 16) {
                Text("Chaînes récentes").font(.title2.weight(.bold))
                RecentChannelsStrip(onActivity: onActivity, onPick: onClose)
            }
            .padding(metrics.panelPadding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.thinMaterial.opacity(0.9))
        }
        .ignoresSafeArea()
        .touchActivity(onActivity)
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
                        Text(channel.name).font(.headline).lineLimit(1)
                        Text(isCurrent ? "en cours" : Format.ago(watchedAt)).font(.caption).foregroundStyle(Theme.secondary).lineLimit(1)
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
