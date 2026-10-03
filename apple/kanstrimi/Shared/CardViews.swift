import SwiftUI

/// Poster art: the real image when there is one, a deterministic gradient otherwise.
struct ArtView: View {
    @Environment(\.metrics) private var metrics
    let id: ContentID
    let url: URL?
    var title: String? = nil

    var body: some View {
        // The gradient sets the size and the image is an overlay: a filled image must never
        // dictate the width of its container (a backdrop is wider than a phone).
        Rectangle().fill(Theme.art(for: id))
            .overlay {
                // The title stands in until the image arrives, and for good when it fails: nothing
                // else under a poster names the work.
                if let url {
                    AsyncImage(url: url) { phase in
                        if let image = phase.image { image.resizable().scaledToFill() } else { titleText }
                    }
                } else {
                    titleText
                }
            }
            .clipped()
    }

    @ViewBuilder private var titleText: some View {
        if let title {
            GeometryReader { geo in
                let pad = metrics.artTitle * 0.6
                Text(title)
                    .font(.system(size: Self.fittingSize(title, width: geo.size.width - 2 * pad, max: metrics.artTitle), weight: .heavy))
                    .foregroundStyle(.white.opacity(0.85))
                    .multilineTextAlignment(.center)
                    .lineLimit(5)
                    .minimumScaleFactor(0.5)
                    .padding(pad)
                    // The upper part only: the bottom carries the year, the rating and the badges.
                    .frame(width: geo.size.width, height: geo.size.height * 0.7)
            }
        }
    }

    /// The largest size, up to `max`, at which the longest word holds on one line: a word is never
    /// broken on a phone-sized poster. A heavy glyph is about 0.62 of the size wide.
    static func fittingSize(_ title: String, width: CGFloat, max: CGFloat) -> CGFloat {
        let longest = title.split(whereSeparator: \.isWhitespace).map(\.count).max() ?? 1
        return min(max, Swift.max(8, width / (CGFloat(longest) * 0.62)))
    }
}

/// A poster's shell, 2:3: its art (the title stands in for it), a gradient that keeps the text drawn at the
/// bottom readable, then `overlay` at the bottom left. Titles and sagas share it.
struct PosterFrame<Overlay: View>: View {
    @Environment(\.metrics) private var metrics
    let id: ContentID
    let url: URL?
    let title: String
    /// Defaults to the platform's poster width.
    var width: CGFloat? = nil
    @ViewBuilder let overlay: () -> Overlay

    var body: some View {
        let width = width ?? metrics.posterWidth
        ZStack(alignment: .bottomLeading) {
            ArtView(id: id, url: url, title: title).frame(width: width, height: width * 1.5)
            LinearGradient(colors: [.clear, .black.opacity(0.75)], startPoint: .center, endPoint: .bottom)
            overlay()
        }
        .frame(width: width, height: width * 1.5)
        .clipShape(RoundedRectangle(cornerRadius: metrics.cardRadius))
    }
}

/// The short line drawn on a poster: « 2024 · ★ 7.4 », « 5 films ».
struct PosterFacts: View {
    @Environment(\.metrics) private var metrics
    let text: String
    var body: some View {
        Text(text).font(.system(size: metrics.badge, weight: .semibold)).foregroundStyle(.white).lineLimit(1)
            .shadow(color: .black.opacity(0.6), radius: 3)
    }
}

/// A grid of posters that are all loaded (an actor's titles, a saga's movies); a click opens the title.
struct PosterGrid: View {
    @Environment(\.metrics) private var metrics
    let items: [ContentItem]
    let onSelect: (ContentID) -> Void

    var body: some View {
        LazyVGrid(columns: metrics.posterColumns, alignment: .leading, spacing: metrics.cardSpacing) {
            ForEach(items) { item in
                PosterCard(item: item) { onSelect(item.id) }
            }
        }
        .padding(.horizontal, metrics.inset)
        .padding(.vertical, metrics.rowPadding)
    }
}

/// A title's logo when TMDB has one, held in `box`; `fallback` stands in while it loads, when it fails and
/// without one, so the place never stays empty. Shared by the sheet's header, the home hero and the cards.
struct LogoOrTitle<Fallback: View>: View {
    let title: String
    let logo: URL?
    let box: CGSize
    var alignment: Alignment = .leading
    var shadowOpacity = 0.5
    var shadowRadius: CGFloat = 12
    @ViewBuilder let fallback: () -> Fallback

    var body: some View {
        if let logo {
            AsyncImage(url: logo) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFit()
                        .frame(maxWidth: box.width, maxHeight: box.height, alignment: alignment)
                        .shadow(color: .black.opacity(shadowOpacity), radius: shadowRadius)
                        .accessibilityLabel(title)
                } else {
                    fallback()
                }
            }
        } else {
            fallback()
        }
    }
}

/// The sheet's header and the home hero: the title's logo, else the title in large type.
struct TitleLogo: View {
    @Environment(\.metrics) private var metrics
    let title: String
    let logo: URL?
    /// Home hero on a phone: centred, the text shrinking a little rather than being cut.
    var centered = false
    /// The logo's box; the sheet's by default.
    var maxSize: CGSize?

    var body: some View {
        LogoOrTitle(title: title, logo: logo, box: maxSize ?? metrics.detailLogo, alignment: centered ? .center : .leading) { text }
    }

    @ViewBuilder private var text: some View {
        if centered {
            Text(title).font(.system(size: metrics.detailTitle, weight: .heavy)).lineLimit(3).minimumScaleFactor(0.6)
                .multilineTextAlignment(.center).frame(maxWidth: .infinity)
        } else {
            Text(title).font(.system(size: metrics.detailTitle, weight: .heavy)).lineLimit(2).frame(maxWidth: metrics.textWidth, alignment: .leading)
        }
    }
}

/// iPhone: a long press on a poster offers to play it at once or to open its sheet. Nothing on tvOS, nor for
/// a channel or a saga.
struct PosterMenu: ViewModifier {
    @Environment(AppEnvironment.self) private var env
    let id: ContentID
    let playable: Bool
    let context: (AppEnvironment) async throws -> PlaybackContext

    func body(content: Content) -> some View {
        content.touchContextMenu {
            if playable {
                Button { play() } label: { Label("Lecture", systemImage: "play.fill") }
                Button { env.open(id) } label: { Label("Voir la fiche", systemImage: "info.circle") }
            }
        }
    }

    private func play() {
        Task { if let ctx = await env.attempt("Lecture", { try await context(env) }) { env.player.play(ctx) } }
    }
}

extension View {
    func posterMenu(_ item: ContentItem) -> some View {
        modifier(PosterMenu(id: item.id, playable: item.kind != .live && item.kind != .saga) { try await $0.playbackContext(for: item) })
    }
}

/// Horizontal row with a title, used on the home screen and in search.
/// An entry of a card's context menu (long press on tvOS and iOS).
struct CardAction {
    let title: String
    let systemImage: String
    let action: () -> Void
}

struct CardRow: View {
    @Environment(\.metrics) private var metrics
    let title: String
    let cards: [ContentItem]
    var landscape = false
    /// The context menu of a card; none when empty.
    var actions: (ContentItem) -> [CardAction] = { _ in [] }
    let onSelect: (ContentItem) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(title).font(.title3.weight(.bold)).padding(.horizontal, metrics.inset)
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: metrics.cardSpacing) {
                    ForEach(cards) { c in
                        Group {
                            if landscape {
                                WideCard(item: c) { onSelect(c) }
                            } else if c.kind == .live {
                                LoadedChannelCard(channel: Channel(id: c.id, name: c.title, logo: c.poster), width: metrics.resumeWidth) { onSelect(c) }
                            } else {
                                PosterCard(item: c) { onSelect(c) }
                            }
                        }
                        .contextMenu {
                            ForEach(Array(actions(c).enumerated()), id: \.offset) { _, a in
                                Button(action: a.action) { Label(a.title, systemImage: a.systemImage) }
                            }
                        }
                    }
                }
                .padding(.horizontal, metrics.inset)
                .padding(.vertical, metrics.rowPadding)
            }
            .scrollClipDisabled()
        }
    }
}
