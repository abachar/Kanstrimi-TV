import SwiftUI

/// The best search result: the wide picture is the button (the sheet, or the channel). On TV the title, facts, badges
/// and overview beside it, so the next row shows under it; on a phone the facts alone, below it. A channel shows its
/// logo on its colour.
struct BestResult: View {
    @Environment(\.metrics) private var metrics
    let item: ContentItem
    let action: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: metrics.compact ? 12 : 18) {
            Text("MEILLEUR RÉSULTAT").font(.caption.weight(.bold)).tracking(1.5).foregroundStyle(Theme.secondary)
            if let width = metrics.searchBest {
                HStack(alignment: .top, spacing: 40) {
                    button.frame(width: width)
                    facts
                }
            } else {
                button
                facts
            }
        }
        .padding(.trailing, metrics.inset)
    }

    private var button: some View {
        Button(action: action) { picture }.cardButtonStyle()
    }

    private var facts: some View {
        VStack(alignment: .leading, spacing: 14) {
            if !metrics.compact { Text(item.title).font(.title2.weight(.bold)).lineLimit(2) }
            HStack(spacing: 12) {
                if let facts = item.facts { Text(facts).foregroundStyle(Theme.secondary).lineLimit(1) }
                HStack(spacing: 6) { ForEach(item.badges, id: \.self) { Badge($0) } }
            }
            if !metrics.compact, let overview = item.overview, !overview.isEmpty {
                Text(overview).font(.callout).foregroundStyle(Theme.secondary).lineLimit(4)
            }
        }
    }

    private var picture: some View {
        ZStack(alignment: .bottomLeading) {
            if item.kind == .live {
                Rectangle().fill(Theme.art(for: item.id))
                    .overlay {
                        AsyncImage(url: item.poster) { phase in
                            if let image = phase.image { image.resizable().scaledToFit() }
                        }
                        .padding(metrics.compact ? 40 : 70)
                    }
            } else {
                ArtView(id: item.id, url: item.picture ?? item.poster)
                    .overlay {
                        LinearGradient(colors: [.clear, .clear, Theme.background.opacity(0.85)], startPoint: .top, endPoint: .bottom)
                    }
                // The title's logo over the picture; else the title, on a phone only: on TV it is written beside.
                LogoOrTitle(title: item.title, logo: item.logo,
                            box: metrics.compact ? CGSize(width: 180, height: 60) : CGSize(width: 320, height: 110), alignment: .bottomLeading) {
                    if metrics.compact {
                        Text(item.title).font(.title3.weight(.bold)).lineLimit(2).shadow(color: .black.opacity(0.6), radius: 8)
                    }
                }
                .padding(metrics.compact ? 14 : 24)
            }
        }
        .aspectRatio(16 / 9, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: metrics.wideRadius))
    }
}

#if DEBUG
#Preview("Meilleur résultat") {
    ScrollView {
        VStack(alignment: .leading, spacing: 40) {
            BestResult(item: .sampleBest) {}
            BestResult(item: .sampleBestChannel) {}
        }
        .padding(.leading, 40).padding(.vertical, 40)
    }
    .background(Theme.background)
    .preferredColorScheme(.dark)
}
#endif
