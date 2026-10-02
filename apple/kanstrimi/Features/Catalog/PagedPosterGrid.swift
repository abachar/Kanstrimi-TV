import SwiftUI

/// A paged grid of posters: `cell` for each item, the next page asked when a cell near the end appears,
/// then a Retry card or a spinner where the next page goes. Titles and sagas share it.
struct PagedPosterGrid<Item: Codable & Hashable & Identifiable & Sendable, Query: PageQuery, Cell: View>: View {
    @Environment(\.metrics) private var metrics
    let paginator: Paginator<Item, Query>
    @ViewBuilder let cell: (Item) -> Cell

    var body: some View {
        let p = paginator
        LazyVGrid(columns: metrics.posterColumns, alignment: .leading, spacing: metrics.cardSpacing) {
            ForEach(Array(p.items.enumerated()), id: \.element.id) { index, item in
                cell(item)
                    // A cell appearing near the end asks for the next page: works for a focus
                    // walk on TV and for a scroll on a phone alike.
                    .onAppear { Task { await p.loadMoreIfNeeded(reaching: index) } }
            }
            if let e = p.pageError {
                RetryCard(message: e.localizedDescription) { Task { await p.retry() } }
                    .frame(width: metrics.posterSize.width, height: metrics.posterSize.height)
            } else if p.isLoading {
                ProgressView().frame(width: metrics.posterSize.width, height: metrics.posterSize.height)
            }
        }
        .padding(.horizontal, metrics.inset)
        .padding(.vertical, metrics.rowPadding)
    }
}
