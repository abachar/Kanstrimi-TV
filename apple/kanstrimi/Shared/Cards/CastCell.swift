import SwiftUI

/// A round photo (initials while it loads or when there is none), the name under it, then the role.
struct CastCell: View {
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

#if DEBUG
#Preview("Distribution") {
    HStack(alignment: .top, spacing: 20) {
        CastCell(person: Person(id: "person:1", name: "Hugh Bonneville", role: "Robert Crawley", photo: nil))
        CastCell(person: Person(id: "person:2", name: "Michelle Dockery", role: "Mary Crawley", photo: nil))
        CastCell(person: Person(id: nil, name: "Jim Carter", role: nil, photo: nil))
    }
    .padding(40)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(Theme.background)
    .preferredColorScheme(.dark)
}
#endif
