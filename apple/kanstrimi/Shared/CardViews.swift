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

/// The poster card without its button: rows wrap it in `PosterCard`, grids in their own button.
struct PosterCardLabel: View {
    @Environment(\.metrics) private var metrics
    let card: Card
    var width: CGFloat? = nil

    var body: some View {
        let width = width ?? metrics.posterWidth
        ZStack(alignment: .bottomLeading) {
            ArtView(id: card.id, url: card.poster, title: card.title)
                .frame(width: width, height: width * 1.5)
            LinearGradient(colors: [.clear, .black.opacity(0.75)], startPoint: .center, endPoint: .bottom)
            VStack(alignment: .leading, spacing: 6) {
                if let hint = card.hint {
                    Text(hint).font(.caption2.weight(.bold)).padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Theme.accent, in: Capsule()).foregroundStyle(.black)
                }
                if let facts {
                    Text(facts).font(.system(size: metrics.badge, weight: .semibold)).foregroundStyle(.white).lineLimit(1)
                        .shadow(color: .black.opacity(0.6), radius: 3)
                }
                VersionBadges(quality: card.qualityBadge, languages: card.languages, compact: true)
                    .scaleEffect(0.85, anchor: .bottomLeading)
            }
            .padding(12)
            if let p = card.progress, p.isResumable {
                ProgressBar(fraction: p.fraction, height: 5).padding(.horizontal, 12).padding(.bottom, 6)
            }
        }
        .frame(width: width, height: width * 1.5)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .accessibilityElement(children: .combine)
        .accessibilityLabel([card.title, facts].compactMap { $0 }.joined(separator: ", "))
    }

    /// "2024 · ★ 7.4", nil when neither is known.
    private var facts: String? {
        let parts = [card.year.map { String($0) }, card.rating.map { String(format: "★ %.1f", $0) }].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

/// Landscape 16:9 card for the "Reprendre" row: version badge, progress, remaining time.
struct ResumeCard: View {
    @Environment(\.metrics) private var metrics
    let card: Card
    var width: CGFloat? = nil
    let action: () -> Void

    var body: some View {
        let width = width ?? metrics.resumeWidth
        Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                ZStack(alignment: .topLeading) {
                    ArtView(id: card.id, url: card.backdrop ?? card.poster)
                        .frame(width: width, height: width * 9 / 16)
                    HStack(spacing: 6) {
                        if let q = card.qualityBadge { Badge(q) }
                        if let l = card.languages.first { Badge(l.rawValue) }
                    }
                    .padding(12)
                    VStack {
                        Spacer()
                        ProgressBar(fraction: card.progress?.fraction ?? 0).padding(.horizontal, 16).padding(.bottom, 14)
                    }
                }
                .frame(width: width, height: width * 9 / 16)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                Text(card.title).font(.callout.weight(.semibold)).lineLimit(1)
                Text(meta).font(.caption).foregroundStyle(Theme.secondary).lineLimit(1)
            }
            .frame(width: width)
        }
        .cardButtonStyle()
    }

    private var meta: String {
        var parts: [String] = []
        if let e = card.episode { parts.append(e.code) } else { parts.append(card.kind.label) }
        if let p = card.progress { parts.append(Format.remaining(p.remaining)) }
        return parts.joined(separator: " · ")
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
