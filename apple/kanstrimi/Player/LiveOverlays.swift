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
    let channel: Channel
    let isCurrent: Bool
    var logoSize: CGFloat = 64
    let action: () -> Void

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
                    ChannelNow(channel: channel, bar: 260)
                }
                Spacer(minLength: 0)
                if let q = channel.maxQuality { Badge(q.rawValue, small: true) }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .cardButtonStyle()
    }
}

/// A channel of « Récentes »: logo, name and when it was watched, then the programme on air and its progress.
struct RecentChannelCard: View {
    @Environment(\.metrics) private var metrics
    let channel: Channel
    let watchedAt: Date
    let isCurrent: Bool
    let action: () -> Void

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
                ChannelNow(channel: channel, font: .callout, color: nil, spacing: 8, bar: .infinity, fallback: .text(" "))
            }
            .padding(18)
            .frame(width: metrics.recentCard)
        }
        .cardButtonStyle()
    }
}
