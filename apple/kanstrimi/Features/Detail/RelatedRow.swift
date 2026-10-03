import SwiftUI

/// « Titres similaires » at the bottom of the sheet: TMDB's recommendations that the catalogue holds,
/// nothing already seen. A poster opens its own sheet.
struct RelatedRow: View {
    @Environment(\.metrics) private var metrics
    let cards: [ContentItem]
    let onSelect: (ContentID) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: metrics.compact ? 10 : 14) {
            Text("Titres similaires").font(metrics.compact ? .headline : .title3.weight(.bold))
            // Scrolls to the screen edge: the parent's margin moves inside the scroll content, as in the cast row.
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: metrics.cardSpacing) {
                    ForEach(cards) { c in PosterCard(item: c) { onSelect(c.id) } }
                }
                .padding(.horizontal, metrics.inset)
                .padding(.vertical, metrics.rowPadding)
            }
            .scrollClipDisabled()
            .padding(.horizontal, -metrics.inset)
            .padding(.vertical, -metrics.rowPadding)
        }
    }
}
