import SwiftUI

/// A studio logo on a light tile (TMDB logos are drawn for a light background), its name when there
/// is no logo. Nothing else, on it or under it. As wide as its parent makes it, half as high.
struct StudioTile: View {
    @Environment(\.metrics) private var metrics
    let studio: Studio

    var body: some View {
        ZStack {
            // Phone: without a logo the name sits on a dark tile, a white block glares on the dark screen.
            RoundedRectangle(cornerRadius: metrics.cardRadius).fill(darkTile ? Color.white.opacity(0.1) : .white)
            Group {
                if let logo = studio.logo {
                    AsyncImage(url: logo) { image in
                        image.resizable().scaledToFit()
                    } placeholder: {
                        name
                    }
                    .padding(metrics.posterWidth * 0.12)
                } else {
                    name
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .aspectRatio(2, contentMode: .fit)
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(studio.name)
    }

    private var darkTile: Bool { metrics.compact && studio.logo == nil }

    private var name: some View {
        Text(studio.name).font(.headline).foregroundStyle(darkTile ? Theme.text : .black).multilineTextAlignment(.center).padding(8)
    }
}

#if DEBUG
#Preview("Studio") {
    HStack(spacing: 30) {
        StudioTile(studio: Studio(id: "company:3", name: "Pixar", logo: nil, count: 3)).frame(width: Metrics.current.studioWidth)
        StudioTile(studio: Studio(id: "company:420", name: "Marvel Studios", logo: nil, count: 2)).frame(width: Metrics.current.studioWidth)
    }
    .padding(40)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(Theme.background)
    .preferredColorScheme(.dark)
}
#endif
