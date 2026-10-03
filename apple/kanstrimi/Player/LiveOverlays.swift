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
                    LoadedChannelCard(channel: c, status: c.id == player.channel?.id ? .playing : nil) {
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

