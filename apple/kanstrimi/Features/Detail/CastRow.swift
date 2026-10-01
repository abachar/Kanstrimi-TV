import SwiftUI

/// The « Distribution » row of the sheet: round photos with name and role. An actor with an `id`
/// opens their screen; one without is the same cell, not clickable.
struct CastRow: View {
    @Environment(\.metrics) private var metrics
    let cast: [Person]
    let onSelect: (PersonRef) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: metrics.compact ? 10 : 14) {
            Text("Distribution").font(metrics.compact ? .headline : .title3.weight(.bold))
            // Scrolls to the screen edge: the parent's margin moves inside the scroll content.
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: metrics.compact ? 8 : 24) {
                    ForEach(Array(cast.enumerated()), id: \.offset) { _, person in
                        if let ref = person.ref {
                            Button { onSelect(ref) } label: { CastCell(person: person) }
                                .buttonStyle(CastButtonStyle())
                        } else {
                            CastCell(person: person)
                        }
                    }
                }
                .padding(.horizontal, metrics.inset)
                .padding(.vertical, metrics.compact ? 4 : 28)
            }
            .scrollClipDisabled()
            .padding(.horizontal, -metrics.inset)
            .padding(.vertical, metrics.compact ? 0 : -28)
        }
    }
}

/// A round photo (initials while it loads or when there is none), the name under it, then the role.
private struct CastCell: View {
    @Environment(\.metrics) private var metrics
    @Environment(\.isFocused) private var focused
    let person: Person

    var body: some View {
        VStack(spacing: metrics.compact ? 6 : 12) {
            CastPhoto(name: person.name, url: person.photo, diameter: metrics.castPhoto)
                .modifier(CastFocus(focused: focused))
            VStack(spacing: 2) {
                Text(person.name).font(metrics.compact ? .caption.weight(.semibold) : .callout.weight(.semibold))
                    .lineLimit(2).multilineTextAlignment(.center)
                if let role = person.role {
                    Text(role).font(metrics.compact ? .caption2 : .caption).foregroundStyle(Theme.secondary).lineLimit(1)
                }
            }
        }
        .frame(width: metrics.castPhoto + (metrics.compact ? 12 : 30), alignment: .top)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel([person.name, person.role].compactMap { $0 }.joined(separator: ", "))
    }
}

/// Focus on tvOS: the photo grows with a white ring and a shadow.
private struct CastFocus: ViewModifier {
    let focused: Bool
    func body(content: Content) -> some View {
        content
            .overlay { Circle().strokeBorder(.white, lineWidth: 4).opacity(focused ? 1 : 0) }
            .scaleEffect(focused ? 1.1 : 1)
            .shadow(color: .black.opacity(focused ? 0.5 : 0), radius: 16, y: 10)
            .animation(.easeOut(duration: 0.15), value: focused)
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
                    if let image = phase.image { image.resizable().scaledToFill() }
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
