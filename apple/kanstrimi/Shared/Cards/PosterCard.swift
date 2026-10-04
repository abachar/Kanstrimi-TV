import SwiftUI

/// A 2:3 poster with, drawn on it, the hint, the quality (TV only), the progress and a check once seen, and the facts
/// in small grey text under it: a movie, a series, a saga. A channel (the search mixes them in) takes the same shape:
/// its logo whole on its colour, « DIRECT », its group under it. The poster carries the title (`ArtView` draws it
/// until the artwork loads, or instead of it), nothing is written over it. As wide as its parent makes it (`posterWidth` in a row, the column in a grid). Without `action` it
/// is a bare label, for the grids that put their own button around it.
struct PosterCard: View {
    @Environment(\.metrics) private var metrics
    let item: ContentItem
    var action: (() -> Void)? = nil

    /// The picture, then its facts under it, outside the button: on tvOS the focus platter and lift stay on the
    /// picture, the facts on the page. A line is kept without facts, so that a row's posters stay aligned.
    var body: some View {
        VStack(alignment: .leading, spacing: metrics.factsGap) {
            if let action { Button(action: action) { picture }.cardButtonStyle() } else { picture }
            PosterFacts(text: item.facts ?? " ").opacity(item.facts == nil ? 0 : 1).accessibilityHidden(true)
        }
    }

    @ViewBuilder private var picture: some View {
        if item.kind == .live { channel } else { poster }
    }

    private var channel: some View {
        Rectangle().fill(Theme.art(for: item.id))
            .aspectRatio(2 / 3, contentMode: .fit)
            .overlay {
                AsyncImage(url: item.poster) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFit()
                    } else {
                        Text(item.title).font(.system(size: metrics.artTitle, weight: .heavy)).foregroundStyle(.white.opacity(0.85))
                            .multilineTextAlignment(.center).minimumScaleFactor(0.5)
                    }
                }
                .padding(metrics.compact ? 14 : 28)
            }
            .overlay(alignment: .topLeading) {
                LiveTag("DIRECT", size: .poster)
                    .padding(metrics.compact ? 6 : 10)
            }
            .clipShape(RoundedRectangle(cornerRadius: metrics.cardRadius))
            .accessibilityElement(children: .combine)
            .accessibilityLabel([item.title, "en direct", item.facts].compactMap { $0 }.joined(separator: ", "))
    }

    private var poster: some View {
        PosterFrame(id: item.id, url: item.poster, title: item.title, veil: !metrics.compact) {
            if metrics.compact {
                // Phone: the hint as a small tag in the top corner.
                if let hint = item.hint {
                    AccentTag(hint, style: .mini)
                        .padding(6)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                }
            } else {
                // TV: the hint, then the best quality alone at full size (the languages stay on the sheet).
                VStack(alignment: .leading, spacing: 6) {
                    if let hint = item.hint {
                        AccentTag(hint)
                    }
                    if let quality = item.quality { Badge(quality) }
                }
                .padding(12)
            }
            if let p = item.progress {
                ProgressBar(fraction: p, height: metrics.compact ? 3 : 5).padding(.horizontal, metrics.compact ? 8 : 12).padding(.bottom, 6)
            }
        }
        .overlay(alignment: .topTrailing) {
            if item.watched {
                WatchedCheck()
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel([item.title, item.facts].compactMap { $0 }.joined(separator: ", "))
    }
}

#if DEBUG
/// Every state side by side, in the platform's grid.
private struct PosterCardPreview: View {
    @Environment(\.metrics) private var metrics
    var body: some View {
        ScrollView {
            LazyVGrid(columns: metrics.posterColumns, alignment: .leading, spacing: metrics.cardSpacing) {
                PosterCard(item: .sampleMovie) {}
                PosterCard(item: .sampleInProgress) {}
                PosterCard(item: .sampleSaga) {}
                PosterCard(item: .sampleWatched) {}
                PosterCard(item: .sampleHint)
                PosterCard(item: .sampleNoPoster)
                PosterCard(item: .sampleChannel) {}
            }
            .padding(metrics.inset)
        }
        .background(Theme.background)
        .preferredColorScheme(.dark)
    }
}

#Preview("Affiche") { PosterCardPreview() }
#endif
