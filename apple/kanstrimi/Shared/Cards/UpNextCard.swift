import SwiftUI

/// What follows the end of a title, the same for the next episode and the suggested title: the heading (with its
/// countdown), the picture and its logo, the facts and badges, the overview, a language warning, then Lire
/// maintenant and Annuler. iPhone: a small picture beside the title and the facts. As wide as its parent makes it.
/// `playFocus` is the focus of Lire maintenant, which the player gives it on arrival.
struct UpNextCard: View {
    @Environment(\.metrics) private var metrics
    /// « ÉPISODE SUIVANT · 7 s ».
    let heading: String
    let item: ContentItem
    var warning: String? = nil
    var playFocus: FocusState<Bool>.Binding
    let onPlay: () -> Void
    let onCancel: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: metrics.compact ? 8 : 14) {
            Text(heading).font(metrics.compact ? .caption2.weight(.bold) : .caption.weight(.bold))
                .tracking(metrics.compact ? 1.2 : 1.5).foregroundStyle(Theme.accent)
            if metrics.compact { compactContent } else { tvContent }
            if let warning {
                Text(warning).font(metrics.compact ? .caption : .callout).foregroundStyle(Theme.accent).lineLimit(2)
            }
            HStack(spacing: metrics.compact ? 10 : 16) {
                Button(action: onPlay) {
                    Label("Lire maintenant", systemImage: "play.fill").font(metrics.compact ? .footnote.weight(.semibold) : .body)
                }
                .prominentButtonStyle()
                .focused(playFocus)
                Button("Annuler", role: .cancel, action: onCancel).font(metrics.compact ? .footnote : .body)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(metrics.compact ? 14 : metrics.panelPadding * 0.6)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: metrics.compact ? 20 : 26))
    }

    private var compactContent: some View {
        HStack(spacing: 10) {
            ArtView(id: item.id, url: item.picture ?? item.poster).frame(width: 96, height: 54)
                .clipShape(RoundedRectangle(cornerRadius: 6))
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title).font(.subheadline.weight(.semibold)).lineLimit(2)
                if let facts = item.facts { Text(facts).font(.caption).foregroundStyle(Theme.secondary).lineLimit(1) }
            }
        }
    }

    @ViewBuilder private var tvContent: some View {
        ArtView(id: item.id, url: item.picture ?? item.poster)
            .aspectRatio(16 / 9, contentMode: .fit)
            .fixedSize(horizontal: false, vertical: true)
            .overlay { LinearGradient(colors: [.clear, .black.opacity(0.5)], startPoint: .center, endPoint: .bottom) }
            .overlay(alignment: .bottomLeading) {
                TitleLogo(title: item.title, logo: item.logo, maxSize: CGSize(width: 300, height: 90)).padding(18)
            }
            .clipShape(RoundedRectangle(cornerRadius: 14))
        // The facts on their own line: a series' name and its episode code do not leave room for the badges.
        if let facts = item.facts { Text(facts).font(.callout).foregroundStyle(Theme.secondary).lineLimit(1) }
        if !item.badges.isEmpty { HStack(spacing: 6) { ForEach(item.badges, id: \.self) { Badge($0) } } }
        if let o = item.overview { Text(o).font(.callout).foregroundStyle(Theme.text.opacity(0.85)).lineLimit(3) }
    }
}

#if DEBUG
/// The next episode and the suggested title, side by side on TV, stacked on a phone.
private struct UpNextCardPreview: View {
    @Environment(\.metrics) private var metrics
    @FocusState private var focused: Bool
    var body: some View {
        let layout = metrics.compact ? AnyLayout(VStackLayout(alignment: .leading, spacing: 24)) : AnyLayout(HStackLayout(alignment: .top, spacing: 40))
        layout {
            UpNextCard(heading: "ÉPISODE SUIVANT · 7 s", item: .sampleNextEpisode,
                       warning: "Pas de FR pour cet épisode : lecture en VOSTF, retour en FR ensuite.", playFocus: $focused, onPlay: {}, onCancel: {})
                .frame(width: metrics.upNextWidth)
            UpNextCard(heading: "À SUIVRE · SUITE DE LA SAGA · 7 s", item: .sampleNextTitle, playFocus: $focused, onPlay: {}, onCancel: {})
                .frame(width: metrics.upNextWidth)
        }
        .padding(metrics.inset)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Theme.background)
        .preferredColorScheme(.dark)
    }
}

#Preview("À suivre") { UpNextCardPreview() }
#endif
