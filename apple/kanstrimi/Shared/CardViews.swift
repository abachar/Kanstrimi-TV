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
                if let url {
                    AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { Color.clear }
                } else if let title {
                    Text(title)
                        .font(.system(size: metrics.artTitle, weight: .heavy))
                        .foregroundStyle(.white.opacity(0.85))
                        .multilineTextAlignment(.center)
                        .padding(24)
                }
            }
            .clipped()
    }
}

/// Grid and row card: poster 2:3, title, year, quality and language badges, optional hint and progress.
struct PosterCard: View {
    @Environment(\.metrics) private var metrics
    let card: Card
    /// Defaults to the platform's poster width.
    var width: CGFloat? = nil
    let action: () -> Void

    var body: some View {
        let width = width ?? metrics.posterWidth
        Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                ZStack(alignment: .bottomLeading) {
                    ArtView(id: card.id, url: card.poster, title: card.title)
                        .frame(width: width, height: width * 1.5)
                    LinearGradient(colors: [.clear, .black.opacity(0.75)], startPoint: .center, endPoint: .bottom)
                    VStack(alignment: .leading, spacing: 6) {
                        if let hint = card.hint {
                            Text(hint).font(.caption2.weight(.bold)).padding(.horizontal, 8).padding(.vertical, 3)
                                .background(Theme.accent, in: Capsule()).foregroundStyle(.black)
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
                Text(card.title).font(.callout.weight(.semibold)).lineLimit(1)
                Text(subtitle).font(.caption).foregroundStyle(Theme.secondary).lineLimit(1)
            }
            .frame(width: width)
        }
        .cardButtonStyle()
    }

    private var subtitle: String {
        var parts: [String] = []
        if let y = card.year { parts.append(String(y)) }
        if let g = card.genres.first { parts.append(g) }
        if let r = card.rating { parts.append(String(format: "★ %.1f", r)) }
        return parts.joined(separator: " · ")
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
struct CardRow: View {
    @Environment(\.metrics) private var metrics
    let title: String
    let cards: [Card]
    var landscape = false
    let onSelect: (Card) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(title).font(.title3.weight(.bold)).padding(.horizontal, metrics.inset)
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: metrics.cardSpacing) {
                    ForEach(cards) { c in
                        if landscape {
                            ResumeCard(card: c) { onSelect(c) }
                        } else {
                            PosterCard(card: c) { onSelect(c) }
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
