import SwiftUI

/// A slide of the home carousel: the backdrop (whole on a phone, in the top right corner on TV), the tagline,
/// the logo or the title, the facts and the certification (with the badges and the overview on TV), then `buttons`. The
/// carousel, its timer, the focus and the actions stay with the home: they come in `buttons` and `onTapPicture`.
/// `slideID` marks a new slide, which fades in.
struct HeroBanner<Buttons: View>: View {
    @Environment(\.metrics) private var metrics
    let item: ContentItem
    /// « FILM · N° 1 CETTE SEMAINE ».
    let tagline: String
    var certification: String? = nil
    let slideID: ContentID
    /// iPhone: a tap on the picture (the sheet).
    var onTapPicture: () -> Void = {}
    @ViewBuilder var buttons: () -> Buttons

    var body: some View {
        if metrics.compact { phone } else { tv }
    }

    /// iPhone, like the sheet: the backdrop from the very top of the screen, under the status bar and the buttons of the
    /// bar, as tall as the sheet's (`phoneBackdrop`), fading into the background; the logo (or the title) over its faded
    /// end, one line of facts and the buttons below. The sides of a 16:9 picture are cut a little, never its middle.
    private var phoneBackdrop: CGFloat { 320 }

    private var phone: some View {
        VStack(spacing: 0) {
            ZStack {
                ArtView(id: item.id, url: item.picture ?? item.poster)
                    .id(slideID).transition(.opacity)
                // A layer of its own above the pictures, as on TV: no edge shows while a slide fades into the next.
                LinearGradient(stops: [.init(color: .clear, location: 0.55), .init(color: Theme.background, location: 1)],
                               startPoint: .top, endPoint: .bottom)
            }
            .frame(maxWidth: .infinity)
            .frame(height: phoneBackdrop)
            .clipped()
            .contentShape(Rectangle())
            .onTapGesture(perform: onTapPicture)
            VStack(spacing: 12) {
                VStack(spacing: 12) {
                    Text(tagline).font(.caption2.weight(.bold)).tracking(2).foregroundStyle(Theme.accent)
                    TitleLogo(title: item.title, logo: item.logo, centered: true)
                    HStack(spacing: 8) {
                        if let facts = item.facts { Text(facts).foregroundStyle(Theme.secondary).lineLimit(1) }
                        if let certification { Badge(certification, small: true) }
                    }
                    .font(.subheadline)
                }
                .id(slideID).transition(.opacity)
                HStack(spacing: 14) { buttons() }.padding(.top, 4)
            }
            .padding(.horizontal, metrics.inset + 8)
            .padding(.top, -44) // over the faded end of the picture, as the sheet's title
            .padding(.bottom, 28)
        }
    }

    /// TV, after Prime Video: the backdrop held in the top right corner over four fifths of the width, fading into a
    /// black halo on its left and its bottom; the text and the buttons stand on that halo, bottom left. Only the text
    /// counts in the layout (`heroHeight`): the picture runs on under the first row and scrolls away with the page.
    private var tv: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 16) {
                Text(tagline).font(.caption.weight(.bold)).tracking(2.5).foregroundStyle(Theme.accent)
                if item.logo != nil {
                    // As high as the two lines of title it replaces: the slide keeps its height under the tab bar.
                    TitleLogo(title: item.title, logo: item.logo, maxSize: CGSize(width: metrics.textWidth * 0.6, height: metrics.heroTitle * 2.1))
                } else {
                    // Wider than running text: a long title keeps two lines instead of being cut.
                    Text(item.title).font(.system(size: metrics.heroTitle, weight: .heavy)).lineLimit(2).minimumScaleFactor(0.85)
                        .frame(maxWidth: metrics.textWidth * 1.4, alignment: .leading)
                }
                HStack(spacing: 12) {
                    if let facts = item.facts { Text(facts).font(.callout).foregroundStyle(Theme.secondary) }
                    if let certification { Badge(certification) }
                    ForEach(item.badges, id: \.self) { Badge($0) }
                }
                if let overview = item.overview {
                    Text(overview).font(.callout).foregroundStyle(Theme.secondary).lineLimit(2)
                        .frame(maxWidth: metrics.textWidth * 0.75, alignment: .leading)
                }
            }
            .id(slideID).transition(.opacity)
            HStack(spacing: 0) { buttons() }.fixedSize().padding(.top, 8)
        }
        .padding(.horizontal, metrics.inset)
        .padding(.bottom, 40)
        .frame(maxWidth: .infinity, minHeight: metrics.heroHeight, alignment: .bottomLeading)
        .background(alignment: .topLeading) {
            GeometryReader { geo in
                let width = geo.size.width * 0.8
                // The halo is a layer of its own above the pictures, not a part of one: while a slide fades into the
                // next, both pictures stay under it and neither shows its edges.
                ZStack {
                    ArtView(id: item.id, url: item.picture)
                        .id(slideID).transition(.opacity)
                    // Black on the left where the text stands, then on the bottom under the rows, and a veil on top
                    // that keeps the tab bar readable over a bright picture.
                    LinearGradient(stops: [.init(color: Theme.background, location: 0),
                                           .init(color: Theme.background.opacity(0.85), location: 0.3),
                                           .init(color: Theme.background.opacity(0.4), location: 0.55),
                                           .init(color: .clear, location: 0.8)],
                                   startPoint: .leading, endPoint: .trailing)
                    LinearGradient(stops: [.init(color: .clear, location: 0.45),
                                           .init(color: Theme.background.opacity(0.7), location: 0.75),
                                           .init(color: Theme.background, location: 1)],
                                   startPoint: .top, endPoint: .bottom)
                    LinearGradient(colors: [Theme.background.opacity(0.6), .clear], startPoint: .top, endPoint: .init(x: 0.5, y: 0.2))
                }
                .frame(width: width, height: width * 9 / 16)
                .frame(maxWidth: .infinity, alignment: .trailing)
            }
        }
    }
}

#if DEBUG
#Preview("Héros") {
    ScrollView {
        HeroBanner(item: .sampleHero, tagline: "FILM · N° 1 CETTE SEMAINE", certification: "12", slideID: ContentItem.sampleHero.id) {
            HStack(spacing: 18) {
                Button {} label: { Label("Lecture", systemImage: "play.fill").font(.headline) }.prominentButtonStyle()
                Button {} label: { Image(systemName: "info") }.buttonStyle(RoundIconStyle(diameter: 46))
            }
        }
    }
    .ignoresSafeArea(edges: .top)
    .background(Theme.background)
    .preferredColorScheme(.dark)
}
#endif
