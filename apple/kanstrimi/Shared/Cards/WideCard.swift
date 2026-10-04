import SwiftUI

/// A 16:9 picture with, drawn on it, two badges at the top, the title (its logo) and the caption at the bottom, the
/// progress, and a check once seen: « Reprendre », the player's « Similaires », an episode. `showsTitle: false` when
/// the text sits beside or under it (the sheet's episodes, the player's season); `playing`, the progress of the
/// episode on screen, which hides the check. As wide as its parent makes it; its height, its margins and its title
/// follow. Without `action` it is a bare label.
struct WideCard: View {
    @Environment(\.metrics) private var metrics
    let item: ContentItem
    var showsTitle = true
    var playing: Double? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        if let action { button(action) } else { label }
    }

    private func button(_ action: @escaping () -> Void) -> some View {
        Button(action: action) { label }.cardButtonStyle()
    }

    private var label: some View {
        Color.clear
            .aspectRatio(16 / 9, contentMode: .fit)
            .fixedSize(horizontal: false, vertical: true)
            .overlay { GeometryReader { geo in content(width: geo.size.width) } }
            .clipShape(RoundedRectangle(cornerRadius: metrics.wideRadius))
            .accessibilityElement(children: .combine)
            .accessibilityLabel([item.title, item.caption].compactMap { $0 }.joined(separator: ", "))
    }

    private func content(width: CGFloat) -> some View {
        let pad = max(8, width * 0.04)
        let progress = playing ?? item.progress
        return ZStack(alignment: .bottomLeading) {
            ArtView(id: item.id, url: item.picture ?? item.poster)
                .frame(width: width, height: width * 9 / 16)
                .overlay {
                    // The lower half darkens under the title and the caption.
                    if showsTitle {
                        LinearGradient(stops: [.init(color: .clear, location: 0.35), .init(color: .black.opacity(0.85), location: 1)],
                                       startPoint: .top, endPoint: .bottom)
                    }
                }
            if showsTitle, !item.badges.isEmpty {
                // On a dark plate: the picture behind can be bright (a sky), and white on it is unreadable.
                HStack(spacing: 6) { ForEach(item.badges.prefix(2), id: \.self) { Badge($0) } }
                    .padding(4)
                    .background(.black.opacity(0.5), in: RoundedRectangle(cornerRadius: 6))
                    .padding(pad)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
            if playing == nil, item.watched {
                WatchedCheck()
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
            }
            VStack(alignment: .leading, spacing: pad * 0.6) {
                if showsTitle {
                    LogoOrTitle(title: item.title, logo: item.logo, box: CGSize(width: width * 0.6, height: width * 0.14),
                                alignment: .bottomLeading, shadowOpacity: 0.6, shadowRadius: 6) {
                        Text(item.title).font(.system(size: width * 0.14 * 0.55, weight: .heavy)).foregroundStyle(.white)
                            .lineLimit(2).minimumScaleFactor(0.7).shadow(color: .black.opacity(0.6), radius: 6)
                    }
                    if let caption = item.caption {
                        Text(caption).font(metrics.compact ? .caption2.weight(.semibold) : .caption.weight(.semibold))
                            .foregroundStyle(.white.opacity(0.85)).lineLimit(1)
                    }
                }
                if let progress { ProgressBar(fraction: progress, height: metrics.compact ? 3 : 5) }
            }
            .padding(pad)
        }
        .frame(width: width, height: width * 9 / 16)
    }
}

#if DEBUG
/// Every use side by side: « Reprendre », « Similaires », the sheet's episode, the player's episode on screen.
private struct WideCardPreview: View {
    @Environment(\.metrics) private var metrics
    var body: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: metrics.resumeWidth), spacing: metrics.cardSpacing, alignment: .topLeading)],
                      alignment: .leading, spacing: metrics.cardSpacing) {
                WideCard(item: .sampleResume) {}.frame(width: metrics.resumeWidth)
                WideCard(item: .sampleRelated) {}.frame(width: metrics.resumeWidth)
                WideCard(item: .sampleEpisode, showsTitle: false).frame(width: metrics.stillWidth)
                WideCard(item: .sampleWatchedEpisode, showsTitle: false).frame(width: metrics.stillWidth)
                WideCard(item: .sampleEpisode, showsTitle: false, playing: 0.4) {}.frame(width: metrics.stillWidth * 1.3)
            }
            .padding(metrics.inset)
        }
        .background(Theme.background)
        .preferredColorScheme(.dark)
    }
}

#Preview("Grande carte 16:9") { WideCardPreview() }
#endif
