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

/// Grid and row card: poster 2:3 with, drawn on it, year and rating, quality and language badges,
/// optional hint and progress. No text under it: the poster carries the title (`ArtView` draws it
/// until the artwork loads, or instead of it).
struct PosterCard: View {
    let card: Card
    /// Defaults to the platform's poster width.
    var width: CGFloat? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) { PosterCardLabel(card: card, width: width) }
            .cardButtonStyle()
    }
}

/// A grid of posters that are all loaded (an actor's titles, a saga's movies); a click opens the title.
struct PosterGrid: View {
    @Environment(\.metrics) private var metrics
    let cards: [Card]
    let onSelect: (ContentID) -> Void

    var body: some View {
        LazyVGrid(columns: metrics.posterColumns, alignment: .leading, spacing: metrics.cardSpacing) {
            ForEach(cards) { card in
                Button { onSelect(card.id) } label: { PosterCardLabel(card: card) }
                    .cardButtonStyle()
            }
        }
        .padding(.horizontal, metrics.inset)
        .padding(.vertical, metrics.rowPadding)
    }
}

/// The poster card without its button: rows wrap it in `PosterCard`, grids in their own button.
struct PosterCardLabel: View {
    @Environment(\.metrics) private var metrics
    let card: Card
    var width: CGFloat? = nil

    var body: some View {
        PosterFrame(id: card.id, url: card.poster, title: card.title, width: width) {
            if metrics.compact {
                // Phone: the year and the rating only, the hint as a small tag in the top corner.
                if let hint = card.hint {
                    Text(hint).font(.system(size: 9, weight: .bold)).lineLimit(1)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Theme.accent, in: Capsule()).foregroundStyle(.black)
                        .padding(6)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                }
                if let facts {
                    PosterFacts(text: facts)
                        .padding(.horizontal, 8).padding(.bottom, card.progress?.isResumable == true ? 14 : 8)
                }
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    if let hint = card.hint {
                        Text(hint).font(.caption2.weight(.bold)).padding(.horizontal, 8).padding(.vertical, 3)
                            .background(Theme.accent, in: Capsule()).foregroundStyle(.black)
                    }
                    if let facts { PosterFacts(text: facts) }
                    VersionBadges(quality: card.qualityBadge, languages: card.languages, compact: true)
                        .scaleEffect(0.85, anchor: .bottomLeading)
                }
                .padding(12)
            }
            if let p = card.progress, p.isResumable {
                ProgressBar(fraction: p.fraction, height: metrics.compact ? 3 : 5).padding(.horizontal, metrics.compact ? 8 : 12).padding(.bottom, 6)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel([card.title, facts].compactMap { $0 }.joined(separator: ", "))
    }

    /// "2024 · ★ 7.4", nil when neither is known.
    private var facts: String? {
        let parts = [card.year.map { String($0) }, card.rating.map { String(format: "★ %.1f", $0) }].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

/// Landscape 16:9 card for the "Reprendre" row, all on the picture: version badges at the top, then
/// the title's logo (or the title), the episode and the time left, and the progress. Nothing under it.
struct ResumeCard: View {
    @Environment(\.metrics) private var metrics
    let card: Card
    var width: CGFloat? = nil
    /// The line under the title; the episode and the time left by default.
    var caption: String? = nil
    /// The player's « Similaires »: the same card without the progress.
    var showsProgress = true
    let action: () -> Void

    var body: some View {
        let width = width ?? metrics.resumeWidth
        let pad = width * 0.04
        Button(action: action) {
            ZStack(alignment: .bottomLeading) {
                ArtView(id: card.id, url: card.backdrop ?? card.poster)
                    .frame(width: width, height: width * 9 / 16)
                    .overlay {
                        // The lower half darkens under the title and the time left.
                        LinearGradient(stops: [.init(color: .clear, location: 0.35), .init(color: .black.opacity(0.85), location: 1)],
                                       startPoint: .top, endPoint: .bottom)
                    }
                HStack(spacing: 6) {
                    if let q = card.qualityBadge { Badge(q) }
                    if let l = card.languages.first { Badge(l.rawValue) }
                }
                .padding(pad)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                VStack(alignment: .leading, spacing: pad * 0.6) {
                    CardTitle(title: card.title, logo: card.logo, box: CGSize(width: width * 0.6, height: width * 0.14))
                    Text(meta).font(metrics.compact ? .caption2.weight(.semibold) : .caption.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.85)).lineLimit(1)
                    if showsProgress { ProgressBar(fraction: card.progress?.fraction ?? 0, height: metrics.compact ? 4 : 6) }
                }
                .padding(pad)
            }
            .frame(width: width, height: width * 9 / 16)
            .clipShape(RoundedRectangle(cornerRadius: metrics.wideRadius))
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(card.title), \(meta)")
        }
        .cardButtonStyle()
    }

    /// « S2 · É4 · 1 h 08 restantes », « 1 h 42 restantes ».
    private var meta: String {
        if let caption { return caption }
        var parts: [String] = []
        if let e = card.episode { parts.append(e.code) }
        if let p = card.progress { parts.append(Format.remaining(p.remaining)) }
        return parts.joined(separator: " · ")
    }
}

/// An episode's still, 16:9: its progress at the bottom, a check once seen. Shared by the sheet's rows and the
/// player's « Épisodes »; `playing` is the progress of the episode on screen, which hides the check.
struct EpisodeStill: View {
    @Environment(\.metrics) private var metrics
    let episode: Episode
    /// Defaults to the platform's still width.
    var width: CGFloat? = nil
    var playing: Double? = nil

    var body: some View {
        let width = width ?? metrics.stillWidth
        let progress = playing ?? episode.progress.flatMap { $0.isResumable ? $0.fraction : nil }
        ZStack(alignment: .bottomLeading) {
            ArtView(id: episode.id, url: episode.still).frame(width: width, height: width * 9 / 16)
            if let progress {
                ProgressBar(fraction: progress, height: metrics.compact ? 3 : 5)
                    .padding(.horizontal, metrics.compact ? 8 : 10).padding(.bottom, metrics.compact ? 6 : 8)
            }
            if playing == nil, episode.progress?.isWatched == true {
                Image(systemName: "checkmark.circle.fill").font(metrics.compact ? .callout : .title2).padding(metrics.compact ? 6 : 10)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
            }
        }
        .frame(width: width, height: width * 9 / 16)
        .clipShape(RoundedRectangle(cornerRadius: metrics.thumbRadius))
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

/// A title on a card's picture: its logo when TMDB has one, held in `box`; the text meanwhile and otherwise.
private struct CardTitle: View {
    let title: String
    let logo: URL?
    let box: CGSize

    var body: some View {
        LogoOrTitle(title: title, logo: logo, box: box, alignment: .bottomLeading, shadowOpacity: 0.6, shadowRadius: 6) {
            Text(title).font(.system(size: box.height * 0.55, weight: .heavy)).foregroundStyle(.white)
                .lineLimit(2).minimumScaleFactor(0.7).shadow(color: .black.opacity(0.6), radius: 6)
        }
    }
}

/// iPhone: a long press on a poster offers to play it at once or to open its sheet. Nothing on tvOS.
struct PosterMenu: ViewModifier {
    @Environment(AppEnvironment.self) private var env
    let card: Card

    func body(content: Content) -> some View {
        content.touchContextMenu {
            if card.kind != .live {
                Button { play() } label: { Label("Lecture", systemImage: "play.fill") }
                Button { env.open(card.id) } label: { Label("Voir la fiche", systemImage: "info.circle") }
            }
        }
    }

    private func play() {
        Task { if let ctx = await env.attempt("Lecture", { try await env.playbackContext(for: card) }) { env.player.play(ctx) } }
    }
}

extension View {
    func posterMenu(_ card: Card) -> some View { modifier(PosterMenu(card: card)) }
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
    let cards: [Card]
    var landscape = false
    /// The context menu of a card; none when empty.
    var actions: (Card) -> [CardAction] = { _ in [] }
    let onSelect: (Card) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(title).font(.title3.weight(.bold)).padding(.horizontal, metrics.inset)
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: metrics.cardSpacing) {
                    ForEach(cards) { c in
                        Group {
                            if landscape {
                                ResumeCard(card: c) { onSelect(c) }
                            } else if c.kind == .live {
                                ChannelCard(card: c) { onSelect(c) }
                            } else {
                                PosterCard(card: c) { onSelect(c) }
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
