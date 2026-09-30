import SwiftUI

/// ◀ on tvOS: the channels of the group the live started from, each with what it shows now.
struct ChannelListOverlay: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics
    @FocusState private var focusedID: ContentID?
    let onClose: () -> Void
    var onActivity: () -> Void = { }
    /// iPhone: a tap beside the list or a swipe back closes it.
    var touch = false
    /// iPhone held upright: the list rises from the bottom, under the video, instead of sliding from the left.
    var fromBottom = false
    private var player: PlayerService { env.player }

    var body: some View {
        if fromBottom { bottomSheet } else { sideList }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: touch ? 4 : 14) {
                Text("Chaînes").font(.title2.weight(.bold)).padding(.bottom, 6)
                ForEach(player.channels) { c in
                    ChannelListRow(channel: c, isCurrent: c.id == player.channel?.id, logoSize: touch ? 44 : 64) {
                        player.play(channel: c, in: player.channels)
                        env.recentChannels.record(c.id)
                        onClose()
                    }
                    .focused($focusedID, equals: c.id)
                }
            }
            .padding(metrics.panelPadding)
        }
    }

    private var bottomSheet: some View {
        VStack(spacing: 0) {
            Color.black.opacity(0.35).ignoresSafeArea().contentShape(Rectangle()).onTapGesture { onClose() }
            list
                .frame(maxWidth: .infinity)
                .frame(height: 460)
                .background {
                    let shape = UnevenRoundedRectangle(topLeadingRadius: 24, topTrailingRadius: 24)
                    ZStack { shape.fill(.black.opacity(0.35)); shape.fill(.ultraThinMaterial) }.ignoresSafeArea(edges: .bottom)
                }
                .touchSwipe { t in
                    if t.height > 80, abs(t.height) > abs(t.width) { onClose() }
                }
        }
        // The sheet's material runs under the home indicator, its rows stay above it.
        .touchActivity(onActivity)
    }

    private var sideList: some View {
        HStack(spacing: 0) {
            list
            .scrollClipDisabled()
            .frame(width: metrics.listWidth)
            .background(.ultraThinMaterial)
            .background(.black.opacity(0.35))
            // The video stays readable on the right, darkened towards the list.
            LinearGradient(colors: [.black.opacity(0.35), .clear], startPoint: .leading, endPoint: .trailing)
                .frame(width: 160)
            Spacer(minLength: 0)
        }
        .overlay {
            // iPhone: a tap on the video beside the list closes it, a swipe towards the left too.
            if touch {
                HStack(spacing: 0) {
                    Color.clear.frame(width: metrics.listWidth)
                    Color.clear.contentShape(Rectangle()).onTapGesture { onClose() }
                }
            }
        }
        .touchSwipe { t in
            if t.width < -80, abs(t.width) > abs(t.height) { onClose() }
        }
        // tvOS: to the edges. iPhone: the rows clear the notch, the list's material still reaches the edge.
        .playerIgnoresSafeArea()
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
    var logoSize: CGFloat = 64
    let action: () -> Void
    /// The list's own, else the guide asked at display (kept a minute by the cache).
    private var now: Programme? { channel.now ?? env.channelCache.cached(channel.id)?.now }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 18) {
                ChannelLogo(channel: channel, size: logoSize)
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
