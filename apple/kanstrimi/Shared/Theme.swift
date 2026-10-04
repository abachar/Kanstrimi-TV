import SwiftUI

enum Theme {
    static let background = Color(red: 0x07 / 255, green: 0x08 / 255, blue: 0x0B / 255)
    static let text = Color(red: 0xF5 / 255, green: 0xF5 / 255, blue: 0xF7 / 255)
    static let accent = Color(red: 0xF5 / 255, green: 0xB5 / 255, blue: 0x44 / 255)
    static let secondary = Color(red: 0xEB / 255, green: 0xEB / 255, blue: 0xF5 / 255).opacity(0.62)
    static let danger = Color(red: 0xFF / 255, green: 0x5E / 255, blue: 0x5E / 255)
    static let live = Color(red: 0xFF / 255, green: 0x3B / 255, blue: 0x30 / 255)
    static let success = Color.green
    // Translucent white fills for backgrounds, from the faintest to the strongest. Text and icons keep their own opacity.
    /// A code cell that has expired.
    static let surfaceDim = Color.white.opacity(0.05)
    /// A panel holding several controls (pairing).
    static let surfacePanel = Color.white.opacity(0.06)
    /// A card on the page: a programme, a channel on the phone.
    static let surface = Color.white.opacity(0.08)
    /// A tile or a settings row at rest.
    static let surfaceControl = Color.white.opacity(0.1)
    /// A round button, a chip, a photo disc, a code cell.
    static let surfaceButton = Color.white.opacity(0.12)
    /// An unselected chip of the tvOS player.
    static let surfaceChip = Color.white.opacity(0.14)
    /// A raised control: the detail icons, the iPhone player buttons and chips.
    static let surfaceRaised = Color.white.opacity(0.16)
    /// The play disc over a paused tvOS player.
    static let surfaceOverlay = Color.white.opacity(0.18)
    /// The iPhone player's scrubber track.
    static let track = Color.white.opacity(0.28)
    /// A selected chip of the tvOS player; the track of a progress bar.
    static let surfaceStrong = Color.white.opacity(0.3)
    /// The veil over an expired QR code.
    static let veil = Color.white.opacity(0.85)
    /// The light tile a channel logo sits on.
    static let logoTile = Color.white.opacity(0.92)
    /// Deterministic gradient standing in for a poster or backdrop the mock does not have.
    static func art(for id: ContentID) -> LinearGradient {
        let h = id.rawValue.unicodeScalars.reduce(5381) { ($0 << 5) &+ $0 &+ Int($1.value) }
        let hue = Double(abs(h) % 360) / 360
        let hue2 = (hue + 0.08).truncatingRemainder(dividingBy: 1)
        return LinearGradient(colors: [Color(hue: hue, saturation: 0.55, brightness: 0.55),
                                       Color(hue: hue2, saturation: 0.65, brightness: 0.18)],
                              startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}

/// Small bordered badge: "4K", "DOLBY VISION", "FR".
struct Badge: View {
    @Environment(\.metrics) private var metrics
    let text: String
    var filled = false
    var color: Color = Theme.text
    var small = false
    /// As written, for the texts capitals would distort: "24 i/s", "23 Mb/s".
    var verbatim = false

    init(_ text: String, filled: Bool = false, color: Color = Theme.text, small: Bool = false, verbatim: Bool = false) {
        self.text = text; self.filled = filled; self.color = color; self.small = small; self.verbatim = verbatim
    }

    var body: some View {
        let size = small ? metrics.badgeSmall : metrics.badge
        Text(verbatim ? text : text.uppercased())
            .font(.system(size: size, weight: .bold))
            .tracking(small ? 0.2 : 0.6)
            .padding(.horizontal, size / 2)
            .frame(height: size * 1.65)
            .foregroundStyle(filled ? Theme.background : color)
            .background {
                RoundedRectangle(cornerRadius: 6)
                    .fill(filled ? color : .clear)
                    .strokeBorder(color.opacity(0.6), lineWidth: 1.5)
            }
    }
}

/// The red « EN DIRECT » / « DIRECT » tag. One text, three sizes the screens already used.
struct LiveTag: View {
    enum Size {
        /// tvOS: the Direct screen and the player bar.
        case large
        /// iPhone player bar.
        case small
        /// Over a poster, sized like a badge.
        case poster
    }

    @Environment(\.metrics) private var metrics
    let text: String
    var size: Size = .large

    init(_ text: String, size: Size = .large) { self.text = text; self.size = size }

    var body: some View {
        switch size {
        case .large:
            Text(text).font(.caption.weight(.bold)).tracking(1.5)
                .padding(.horizontal, 8).padding(.vertical, 3).background(Theme.live, in: RoundedRectangle(cornerRadius: 5))
        case .small:
            Text(text).font(.caption2.weight(.bold)).tracking(1.2)
                .padding(.horizontal, 6).padding(.vertical, 2).background(Theme.live, in: RoundedRectangle(cornerRadius: 4))
        case .poster:
            Text(text).font(.system(size: metrics.badge, weight: .bold)).tracking(1)
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background(Theme.live, in: RoundedRectangle(cornerRadius: 4)).foregroundStyle(.white)
        }
    }
}

/// The amber tag on a capsule: a hint, a warning, « RECOMMANDÉ ».
struct AccentTag: View {
    enum Style {
        /// Sized by the platform: tighter on the phone.
        case standard
        /// The phone poster's corner tag.
        case mini
        /// Spaced capitals, for a word like « RECOMMANDÉ ».
        case spaced
    }

    @Environment(\.metrics) private var metrics
    let text: String
    var style: Style = .standard

    init(_ text: String, style: Style = .standard) { self.text = text; self.style = style }

    var body: some View {
        Group {
            switch style {
            case .standard:
                Text(text).font(.caption2.weight(.bold))
                    .padding(.horizontal, metrics.compact ? 6 : 8).padding(.vertical, metrics.compact ? 2 : 3)
            case .mini:
                Text(text).font(.system(size: 9, weight: .bold)).lineLimit(1)
                    .padding(.horizontal, 6).padding(.vertical, 2)
            case .spaced:
                Text(text).font(.caption2.weight(.bold)).tracking(1).padding(.horizontal, 8).padding(.vertical, 4)
            }
        }
        .background(Theme.accent, in: Capsule()).foregroundStyle(.black)
    }
}

/// « EN COURS » over a programme or a channel.
struct OnAirLabel: View {
    var body: some View {
        Text("EN COURS").font(.caption2.weight(.bold)).tracking(1).foregroundStyle(Theme.accent)
    }
}

/// The tick on a poster or a wide card already watched.
struct WatchedCheck: View {
    @Environment(\.metrics) private var metrics
    var body: some View {
        Image(systemName: "checkmark.circle.fill").font(metrics.compact ? .callout : .title2).foregroundStyle(.white)
            .shadow(color: .black.opacity(0.5), radius: 4)
            .padding(metrics.compact ? 6 : 10)
    }
}

/// The first letters of the first two words of a name, in capitals: shown while a photo or a logo is missing.
func initials(of name: String) -> String {
    name.split(separator: " ").prefix(2).compactMap { $0.first.map(String.init) }.joined().uppercased()
}

/// The veil that fades a backdrop into the page's background, top to bottom.
struct BackdropFade: View {
    var body: some View {
        LinearGradient(colors: [.clear, Theme.background.opacity(0.9), Theme.background], startPoint: .top, endPoint: .bottom)
    }
}

/// « Kanstrimi » in the accent colour, spaced capitals; the size and tracking tell the screen.
struct Wordmark: View {
    let size: CGFloat
    let tracking: CGFloat
    var body: some View {
        Text("Kanstrimi").font(.system(size: size, weight: .bold)).tracking(tracking).foregroundStyle(Theme.accent)
    }
}

/// Thin progress bar drawn on cards and episodes.
struct ProgressBar: View {
    let fraction: Double
    var height: CGFloat = 6
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.surfaceStrong)
                Capsule().fill(Theme.text).frame(width: max(0, geo.size.width * fraction))
            }
        }
        .frame(height: height)
    }
}

/// Generic empty / error state with a single Retry action.
struct StatePanel: View {
    @Environment(\.metrics) private var metrics
    let icon: String
    let title: String
    let message: String
    var actionTitle: String? = "Réessayer"
    var action: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: icon).font(.system(size: metrics.stateIcon)).foregroundStyle(Theme.secondary)
            Text(title).font(.title2.weight(.bold)).multilineTextAlignment(.center)
            Text(message).font(.body).foregroundStyle(Theme.secondary).multilineTextAlignment(.center).frame(maxWidth: min(760, metrics.textWidth))
            if let actionTitle, let action {
                Button(actionTitle, action: action).padding(.top, 8)
            }
        }
        .padding(metrics.statePadding)
        .frame(maxWidth: .infinity)
    }
}

/// A screen that loads one thing (an actor, a saga): a spinner, then `content`, or a state panel whose
/// Retry loads again.
struct LoadedScreen<Value, Content: View>: View {
    let errorTitle: String
    let load: () async throws -> Value
    @ViewBuilder let content: (Value) -> Content
    @State private var value: Value?
    @State private var error: CatalogError?

    var body: some View {
        Group {
            if let value {
                content(value)
            } else if let error {
                StatePanel(icon: "exclamationmark.triangle", title: errorTitle, message: error.localizedDescription) {
                    Task { await run() }
                }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Theme.background)
        .task { if value == nil { await run() } }
    }

    private func run() async {
        do {
            value = try await load()
            error = nil
        } catch {
            self.error = (error as? CatalogError) ?? .server(error.localizedDescription)
        }
    }
}

/// "Serveur injoignable · accueil du 25 sept. à 21:14 affiché" banner.
struct OfflineBanner: View {
    let detail: String
    let retry: () -> Void
    var body: some View {
        HStack(spacing: 20) {
            Image(systemName: "wifi.exclamationmark").font(.title2)
            VStack(alignment: .leading, spacing: 4) {
                Text("Serveur injoignable").font(.headline)
                Text(detail).font(.callout).foregroundStyle(Theme.secondary)
            }
            Spacer()
            Button("Réessayer", action: retry)
        }
        .padding(.horizontal, 28).padding(.vertical, 18)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22))
    }
}

#Preview("Petites briques") {
    VStack(alignment: .leading, spacing: 20) {
        HStack(spacing: 12) {
            LiveTag("EN DIRECT")
            LiveTag("EN DIRECT", size: .small)
            LiveTag("DIRECT", size: .poster)
        }
        HStack(spacing: 12) {
            AccentTag("FR SEUL")
            AccentTag("NOUVEAU", style: .mini)
            AccentTag("RECOMMANDÉ", style: .spaced)
            OnAirLabel()
        }
        HStack(spacing: 20) {
            WatchedCheck()
            Text(initials(of: "Jean Dujardin")).font(.title2.weight(.bold))
            Wordmark(size: 30, tracking: 4)
        }
        ZStack {
            Theme.art(for: ContentID("preview"))
            BackdropFade()
        }
        .frame(height: 160)
    }
    .padding(40)
    .background(Theme.background)
    .environment(\.metrics, .tv)
}
