import SwiftUI

/// The channel's logo (iptv-org's, served by our server, else the provider's) on a light tile:
/// most logos are drawn for a light background. Initials on the channel's colour meanwhile or without one.
struct ChannelLogo: View {
    let channel: Channel
    var size: CGFloat = 64
    var body: some View {
        ZStack {
            if let url = channel.logo {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        ZStack {
                            RoundedRectangle(cornerRadius: size * 0.22).fill(.white.opacity(0.92))
                            image.resizable().scaledToFit().padding(size * 0.12)
                        }
                    } else {
                        initialsTile
                    }
                }
            } else {
                initialsTile
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: size * 0.22))
    }
    private var initialsTile: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.22).fill(Theme.art(for: channel.id))
            Text(initials).font(.system(size: size * 0.36, weight: .heavy)).foregroundStyle(.white)
        }
    }
    private var initials: String {
        let words = channel.name.split(separator: " ")
        return words.prefix(2).compactMap { $0.first.map(String.init) }.joined().uppercased()
    }
}

/// What a channel shows now, under its name, the same everywhere (`env.nowPlaying`): the programme's title,
/// its progress when `bar` gives the bar's width, and its hours with `hours`; `fallback` while nothing is known.
/// Asks the channel's detail when needed, unless `loads` is off (tvOS Direct rows: only what is already known).
struct ChannelNow: View {
    enum Fallback {
        /// « Pas de programme » when the server says the channel has no guide, else a blank line that keeps the height.
        case guideState
        case text(String)
    }

    @Environment(AppEnvironment.self) private var env
    let channel: Channel
    var font: Font = .caption
    /// The title's colour; nil keeps the surrounding one.
    var color: Color? = Theme.secondary
    var spacing: CGFloat = 6
    var bar: CGFloat? = nil
    var barHeight: CGFloat = 4
    var hours = false
    var fallback: Fallback = .guideState
    var loads = true

    var body: some View {
        VStack(alignment: .leading, spacing: spacing) {
            if let now = env.nowPlaying(on: channel) {
                Text(now.title).font(font).foregroundStyle(color.map(AnyShapeStyle.init) ?? AnyShapeStyle(.primary)).lineLimit(1)
                if let bar {
                    HStack(spacing: 8) {
                        ProgressBar(fraction: now.fraction(), height: barHeight).frame(maxWidth: bar)
                        if hours {
                            Text("\(Format.hour(now.start)) – \(Format.hour(now.end))").font(.caption.monospacedDigit()).foregroundStyle(Theme.secondary)
                        }
                    }
                }
            } else {
                switch fallback {
                case .guideState:
                    Text(env.guide(of: channel).hasEPG == false ? "Pas de programme" : " ").font(font).foregroundStyle(Theme.secondary)
                case .text(let text):
                    Text(text).font(font).foregroundStyle(Theme.secondary).lineLimit(1)
                }
            }
        }
        .task(id: channel.id) { if loads { await env.loadNowPlaying(on: channel) } }
    }
}

/// A channel in a row of cards (« Chaînes les plus regardées », « Ma liste »): its logo on a 16:9 tile, its name
/// and the programme on air.
struct ChannelCard: View {
    @Environment(\.metrics) private var metrics
    let card: Card
    let action: () -> Void

    var body: some View {
        let width = metrics.resumeWidth
        let channel = Channel(id: card.id, name: card.title, logo: card.poster)
        Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                ZStack {
                    Theme.art(for: card.id).opacity(0.35)
                    ChannelLogo(channel: channel, size: width * 9 / 16 * 0.6)
                }
                .frame(width: width, height: width * 9 / 16)
                .clipShape(RoundedRectangle(cornerRadius: metrics.wideRadius))
                Text(card.title).font(.callout.weight(.semibold)).lineLimit(1)
                ChannelNow(channel: channel, fallback: .text("En direct"))
            }
            .frame(width: width)
        }
        .cardButtonStyle()
    }
}
