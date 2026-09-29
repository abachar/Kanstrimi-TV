import SwiftUI

enum Theme {
    static let background = Color(red: 0x07 / 255, green: 0x08 / 255, blue: 0x0B / 255)
    static let text = Color(red: 0xF5 / 255, green: 0xF5 / 255, blue: 0xF7 / 255)
    static let accent = Color(red: 0xF5 / 255, green: 0xB5 / 255, blue: 0x44 / 255)
    static let secondary = Color(red: 0xEB / 255, green: 0xEB / 255, blue: 0xF5 / 255).opacity(0.62)
    static let danger = Color(red: 0xFF / 255, green: 0x5E / 255, blue: 0x5E / 255)
    static let live = Color(red: 0xFF / 255, green: 0x3B / 255, blue: 0x30 / 255)
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

/// Small bordered badge: "4K", "DOLBY VISION", "VF".
struct Badge: View {
    @Environment(\.metrics) private var metrics
    let text: String
    var filled = false
    var color: Color = Theme.text
    var small = false

    init(_ text: String, filled: Bool = false, color: Color = Theme.text, small: Bool = false) {
        self.text = text; self.filled = filled; self.color = color; self.small = small
    }

    var body: some View {
        let size = small ? metrics.badgeSmall : metrics.badge
        Text(text.uppercased())
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

/// Row of quality and language badges a card or a sheet shows.
struct VersionBadges: View {
    let quality: String?
    let languages: [Language]
    var compact = false

    var body: some View {
        HStack(spacing: compact ? 4 : 6) {
            if let quality { Badge(quality, small: compact) }
            ForEach(compact ? Array(languages.prefix(2)) : languages, id: \.self) { Badge($0.rawValue, small: compact) }
            if compact, languages.count > 2 { Badge("+\(languages.count - 2)", small: compact) }
        }
    }
}

/// Thin progress bar drawn on cards and episodes.
struct ProgressBar: View {
    let fraction: Double
    var height: CGFloat = 6
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.3))
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

/// Card that takes the place of a page that failed to load, in a grid or a row.
struct RetryCard: View {
    let message: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            VStack(spacing: 12) {
                Image(systemName: "arrow.clockwise").font(.system(size: 40))
                Text("Suite non chargée").font(.headline)
                Text(message).font(.caption).foregroundStyle(Theme.secondary).multilineTextAlignment(.center).lineLimit(3)
                Text("Réessayer").font(.callout.weight(.semibold)).foregroundStyle(Theme.accent)
            }
            .padding(20)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .cardButtonStyle()
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

enum Format {
    static let iso = ISO8601DateFormatter()

    /// "2 h 07", "48 min".
    static func runtime(minutes: Int) -> String {
        minutes >= 60 ? "\(minutes / 60) h \(String(format: "%02d", minutes % 60))" : "\(minutes) min"
    }
    /// "1:12:48" or "12:48".
    static func clock(_ seconds: TimeInterval) -> String {
        let s = Int(max(0, seconds.rounded()))
        return s >= 3600 ? String(format: "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60) : String(format: "%d:%02d", s / 60, s % 60)
    }
    /// "32 min restantes".
    static func remaining(_ seconds: TimeInterval) -> String {
        let m = Int(seconds / 60)
        return m >= 60 ? "\(m / 60) h \(String(format: "%02d", m % 60)) restantes" : "\(max(1, m)) min restantes"
    }
    /// "20:45".
    static func hour(_ date: Date) -> String {
        date.formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits))
    }
    /// "25 sept. à 21:14".
    static func dayHour(_ date: Date) -> String {
        date.formatted(.dateTime.day().month(.abbreviated)) + " à " + hour(date)
    }
    /// "il y a 2 min".
    static func ago(_ date: Date) -> String {
        let s = Date.now.timeIntervalSince(date)
        if s < 60 { return "à l'instant" }
        if s < 3600 { return "il y a \(Int(s / 60)) min" }
        if s < 86400 { return "il y a \(Int(s / 3600)) h" }
        return "il y a \(Int(s / 86400)) j"
    }
    /// "1,5 s", "3 s".
    static func seconds(ms: Int) -> String {
        (Double(ms) / 1000).formatted(.number.precision(.fractionLength(0...1)).locale(Locale(identifier: "fr_FR"))) + " s"
    }
    /// "35 219".
    static func count(_ n: Int) -> String { n.formatted(.number.grouping(.automatic)) }
}
