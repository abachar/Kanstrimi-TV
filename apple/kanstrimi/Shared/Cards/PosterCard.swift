import SwiftUI

/// A 2:3 poster with, drawn on it, the facts, the badges, the hint, the progress and a check once seen: a movie, a
/// series, a saga. No text under it: the poster carries the title (`ArtView` draws it until the artwork loads, or
/// instead of it). As wide as its parent makes it (`posterWidth` in a row, the column in a grid). Without `action` it
/// is a bare label, for the grids that put their own button around it.
struct PosterCard: View {
    @Environment(\.metrics) private var metrics
    let item: ContentItem
    var action: (() -> Void)? = nil

    var body: some View {
        if let action { button(action) } else { label }
    }

    private func button(_ action: @escaping () -> Void) -> some View {
        Button(action: action) { label }.cardButtonStyle()
    }

    private var label: some View {
        PosterFrame(id: item.id, url: item.poster, title: item.title) {
            if metrics.compact {
                // Phone: the facts only, the hint as a small tag in the top corner.
                if let hint = item.hint {
                    Text(hint).font(.system(size: 9, weight: .bold)).lineLimit(1)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Theme.accent, in: Capsule()).foregroundStyle(.black)
                        .padding(6)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                }
                if let facts = item.facts {
                    PosterFacts(text: facts)
                        .padding(.horizontal, 8).padding(.bottom, item.progress != nil ? 14 : 8)
                }
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    if let hint = item.hint {
                        Text(hint).font(.caption2.weight(.bold)).padding(.horizontal, 8).padding(.vertical, 3)
                            .background(Theme.accent, in: Capsule()).foregroundStyle(.black)
                    }
                    if let facts = item.facts { PosterFacts(text: facts) }
                    if !item.badges.isEmpty { badges.scaleEffect(0.85, anchor: .bottomLeading) }
                }
                .padding(12)
            }
            if let p = item.progress {
                ProgressBar(fraction: p, height: metrics.compact ? 3 : 5).padding(.horizontal, metrics.compact ? 8 : 12).padding(.bottom, 6)
            }
        }
        .overlay(alignment: .topTrailing) {
            if item.watched {
                Image(systemName: "checkmark.circle.fill").font(metrics.compact ? .callout : .title2).foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.5), radius: 4)
                    .padding(metrics.compact ? 6 : 10)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel([item.title, item.facts].compactMap { $0 }.joined(separator: ", "))
    }

    /// The first three badges, then how many more.
    private var badges: some View {
        HStack(spacing: 4) {
            ForEach(item.badges.prefix(3), id: \.self) { Badge($0, small: true) }
            if item.badges.count > 3 { Badge("+\(item.badges.count - 3)", small: true) }
        }
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
            }
            .padding(metrics.inset)
        }
        .background(Theme.background)
        .preferredColorScheme(.dark)
    }
}

#Preview("Affiche") { PosterCardPreview() }
#endif
