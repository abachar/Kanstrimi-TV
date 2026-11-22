import SwiftUI

/// A list beside the video, which stays readable next to it, darkened towards the list: the channels from the
/// left, the variants from the right. An iPhone held upright raises it from the bottom, under the video.
private struct SideList<Content: View>: View {
    enum Side { case leading, trailing }

    @Environment(\.metrics) private var metrics
    let side: Side
    /// Narrower than the usual list, for one that has less to say on a row.
    var maxWidth: CGFloat = .infinity
    /// iPhone: a tap beside the list or a swipe towards its edge closes it.
    let touch: Bool
    let fromBottom: Bool
    let onClose: () -> Void
    let onActivity: () -> Void
    @ViewBuilder let content: Content

    var body: some View {
        if fromBottom { bottomSheet } else { sideList }
    }

    private var width: CGFloat { min(metrics.listWidth, maxWidth) }

    private var list: some View {
        ScrollView { content.padding(metrics.panelPadding) }
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
            if side == .trailing {
                Spacer(minLength: 0)
                shade
            }
            list
                .scrollClipDisabled()
                .frame(width: width)
                .background(.ultraThinMaterial)
                .background(.black.opacity(0.35))
            if side == .leading {
                shade
                Spacer(minLength: 0)
            }
        }
        .overlay {
            // iPhone: a tap on the video beside the list closes it.
            if touch {
                HStack(spacing: 0) {
                    if side == .leading { Color.clear.frame(width: width) }
                    Color.clear.contentShape(Rectangle()).onTapGesture { onClose() }
                    if side == .trailing { Color.clear.frame(width: width) }
                }
            }
        }
        // iPhone: a swipe back towards the edge the list came from closes it too.
        .touchSwipe { t in
            let back = side == .leading ? t.width < -80 : t.width > 80
            if back, abs(t.width) > abs(t.height) { onClose() }
        }
        // tvOS: to the edges. iPhone: the rows clear the notch, the list's material still reaches the edge.
        .playerIgnoresSafeArea()
        .touchActivity(onActivity)
    }

    /// The video darkened towards the list.
    private var shade: some View {
        LinearGradient(colors: [.black.opacity(0.35), .clear], startPoint: side == .leading ? .leading : .trailing,
                       endPoint: side == .leading ? .trailing : .leading)
            .frame(width: 160)
    }
}

/// ◀ on tvOS: the channels of the group the live started from, each with what it shows now.
struct ChannelListOverlay: View {
    @Environment(AppEnvironment.self) private var env
    @FocusState private var focusedID: ContentID?
    let onClose: () -> Void
    var onActivity: () -> Void = { }
    var touch = false
    var fromBottom = false
    private var player: PlayerService { env.player }

    var body: some View {
        SideList(side: .leading, touch: touch, fromBottom: fromBottom, onClose: onClose, onActivity: onActivity) {
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
        }
        .onAppear { focusedID = player.channel?.id ?? player.channels.first?.id }
        .onChange(of: focusedID) { _, _ in onActivity() }
    }
}

/// The round button of the bar, and ▶ in live on tvOS: the variants of what plays, in the server's order, the one
/// playing ticked, those that failed here a moment ago marked. A pick switches at once and keeps the choice for the
/// title. Apple TV, in live: « Comparer » turns the list into a choice for the inset, the variants of the big video's
/// provider greyed out (one stream per account); with an inset up, its own actions come first.
struct VariantListOverlay: View {
    @Environment(AppEnvironment.self) private var env
    @FocusState private var focusedID: String?
    @State private var comparing = false
    let onClose: () -> Void
    var onActivity: () -> Void = { }
    var touch = false
    var fromBottom = false
    private var player: PlayerService { env.player }
    private var comparison: ComparisonInset { player.comparison }
    private var offersComparison: Bool { Platform.isTV && player.offersComparison }

    private enum Action: String { case compare, swap, end }

    var body: some View {
        let variants = player.context?.variants.playable ?? []
        SideList(side: .trailing, maxWidth: 500, touch: touch, fromBottom: fromBottom, onClose: onClose, onActivity: onActivity) {
            VStack(alignment: .leading, spacing: touch ? 4 : 14) {
                Text(comparing ? "Comparer avec…" : "Variantes").font(.title3.weight(.bold)).padding(.bottom, 6)
                if offersComparison { actions }
                VariantList(variants: variants, marks: marks, narrow: true, focused: $focusedID) { v in
                    if comparing {
                        player.compare(v)
                    } else if v.id != player.variant?.id {
                        player.switchVariant(v)
                    }
                    onClose()
                }
            }
        }
        .onAppear { focusedID = player.variant?.id ?? variants.first?.id }
        .onChange(of: focusedID) { _, _ in onActivity() }
    }

    /// « Comparer » (or « Annuler » while choosing), then « Échanger » and « Fermer l'incrustation » with an inset up.
    @ViewBuilder private var actions: some View {
        if comparing {
            action(.compare, "Annuler", icon: "xmark") { toggleComparing() }
        } else {
            action(.compare, comparison.isActive ? "Comparer avec une autre" : "Comparer", icon: "rectangle.inset.topleft.filled") { toggleComparing() }
            if comparison.isActive {
                action(.swap, "Échanger les deux vidéos", icon: "arrow.left.arrow.right") { player.swapComparison(); onClose() }
                action(.end, "Fermer l'incrustation", icon: "xmark.rectangle") { player.endComparison(); onClose() }
            }
        }
    }

    private func action(_ id: Action, _ title: String, icon: String, perform: @escaping () -> Void) -> some View {
        Button(action: perform) {
            Label(title, systemImage: icon)
                .font(.caption.weight(.semibold))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16).padding(.vertical, 12)
        }
        .cardButtonStyle()
        .focused($focusedID, equals: "action.\(id.rawValue)")
    }

    /// Into the choice for the inset, the focus on the first variant it may show; back, on the one playing.
    private func toggleComparing() {
        comparing.toggle()
        let variants = player.context?.variants.playable ?? []
        focusedID = comparing ? variants.first(where: player.canCompare)?.id : player.variant?.id
    }

    private func marks(_ variant: Variant) -> VariantMarks {
        VariantMarks(playing: variant.id == player.variant?.id, failed: env.failedVariants.isFailed(variant.id),
                     inset: variant.id == comparison.variant?.id, enabled: !comparing || player.canCompare(variant))
    }
}
