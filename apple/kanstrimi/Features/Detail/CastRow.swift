import SwiftUI

/// The « Distribution » row of the sheet: its title over a `CastStrip` that scrolls to the screen edge.
struct CastRow: View {
    @Environment(\.metrics) private var metrics
    let cast: [Person]
    let onSelect: (PersonRef) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: metrics.compact ? 10 : 14) {
            Text("Distribution").font(metrics.compact ? .headline : .title3.weight(.bold))
            // Scrolls to the screen edge: the parent's margin moves inside the scroll content.
            CastStrip(cast: cast, inset: metrics.inset, onSelect: onSelect)
                .padding(.horizontal, -metrics.inset)
                .padding(.vertical, metrics.compact ? 0 : -28)
        }
    }
}

/// Round photos with name and role, scrolling sideways: the sheet's « Distribution » and the player's panel. An actor
/// with an `id` is a button; one without is the same cell, not clickable. `inset`: the margin inside the scroll.
struct CastStrip: View {
    @Environment(\.metrics) private var metrics
    @FocusState private var focused: Int?
    let cast: [Person]
    var inset: CGFloat = 0
    /// The player's bar stays up while the focus moves along the strip.
    var onFocusChange: () -> Void = { }
    let onSelect: (PersonRef) -> Void

    var body: some View {
        ScrollView(.horizontal) {
            LazyHStack(alignment: .top, spacing: metrics.compact ? 8 : 24) {
                ForEach(Array(cast.enumerated()), id: \.offset) { index, person in
                    if let ref = person.ref {
                        Button { onSelect(ref) } label: { CastCell(person: person).frame(width: metrics.castCell) }
                            .buttonStyle(CastButtonStyle())
                            .focused($focused, equals: index)
                    } else {
                        CastCell(person: person).frame(width: metrics.castCell)
                    }
                }
            }
            .padding(.horizontal, inset)
            .padding(.vertical, metrics.compact ? 4 : 28)
        }
        .scrollClipDisabled()
        // As tall as the cells: a sideways scroll otherwise takes all the height it is offered, which pushed the
        // player's bar to the top of the screen.
        .fixedSize(horizontal: false, vertical: true)
        .onChange(of: focused) { _, _ in onFocusChange() }
    }
}

/// Own style instead of `.card`: no rectangular halo around a round photo. Pressed (iOS) it shrinks a little.
private struct CastButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.94 : 1)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}

/// A person's photo cropped to a circle; their initials on a plain disc without a photo or while it loads.
struct CastPhoto: View {
    let name: String
    let url: URL?
    let diameter: CGFloat

    var body: some View {
        ZStack {
            Circle().fill(Color.white.opacity(0.12))
            Text(initials).font(.system(size: diameter * 0.34, weight: .semibold)).foregroundStyle(Theme.secondary)
            if let url {
                AsyncImage(url: url) { phase in
                    // A TMDB portrait is 2:3, 1.5 diameters high. Centred, the circle cut every head at the forehead; at the
                    // top, at the chin. An eighth of a diameter off the top keeps the whole face.
                    if let image = phase.image {
                        image.resizable().scaledToFill().frame(width: diameter, height: diameter * 1.5).offset(y: diameter / 8)
                    }
                }
            }
        }
        .frame(width: diameter, height: diameter)
        .clipShape(Circle())
    }

    private var initials: String {
        name.split(separator: " ").prefix(2).compactMap(\.first).map { String($0) }.joined().uppercased()
    }
}
