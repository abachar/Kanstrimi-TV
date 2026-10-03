import SwiftUI

/// A channel as every channel card shows it, built by the screens (`channelItem`): the quality last chosen, the
/// programme on air and whether it was played belong to this device.
struct ChannelItem: Hashable {
    enum Status: Hashable {
        case playing
        case watched(Date)
    }

    let id: ContentID
    var name: String
    var logo: URL? = nil
    var status: Status? = nil
    /// The quality last chosen for it, else its best.
    var quality: String? = nil
    var isFavorite = false
    var now: Programme? = nil
    /// false: the server knows it has no guide (« Pas de programme »).
    var hasEPG: Bool? = nil
}

/// Every channel the same way: logo, name and favourite, then « EN COURS » or when it was watched, the quality last
/// chosen; under them what is on air with its progress, its hours when `hours`. As wide as its parent makes it (a
/// tile in a row, the whole width of a list): the home, the Direct screen, the player's list and its « Récentes ».
/// On iPhone it draws its own background, which the tvOS card style draws there.
struct ChannelCard: View {
    @Environment(\.metrics) private var metrics
    let item: ChannelItem
    var hours = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: metrics.compact ? 6 : 10) {
                HStack(spacing: metrics.compact ? 12 : 16) {
                    ChannelLogo(channel: Channel(id: item.id, name: item.name, logo: item.logo), size: metrics.compact ? 44 : 64)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 8) {
                            Text(item.name).font(metrics.compact ? .subheadline.weight(.semibold) : .headline).lineLimit(1)
                            if item.isFavorite { Image(systemName: "heart.fill").font(.caption).foregroundStyle(Theme.accent) }
                        }
                        status
                    }
                    Spacer(minLength: 0)
                    if let q = item.quality { Badge(q, small: metrics.compact) }
                }
                now
            }
            .padding(metrics.compact ? 12 : 18)
            .frame(maxWidth: .infinity, alignment: .leading)
            // tvOS: the card style draws the platter; touch screens have none, so the card draws its own.
            .background {
                if !Platform.isTV { RoundedRectangle(cornerRadius: metrics.cardRadius).fill(.white.opacity(0.08)) }
            }
        }
        .cardButtonStyle()
    }

    @ViewBuilder private var status: some View {
        switch item.status {
        case .playing:
            Text("EN COURS").font(.caption2.weight(.bold)).tracking(1).foregroundStyle(Theme.accent)
        case .watched(let date):
            Text(Format.ago(date)).font(.caption).foregroundStyle(Theme.secondary).lineLimit(1)
        case nil:
            EmptyView()
        }
    }

    @ViewBuilder private var now: some View {
        if let p = item.now {
            VStack(alignment: .leading, spacing: 6) {
                Text(p.title).font(metrics.compact ? .footnote : .callout).lineLimit(1)
                HStack(spacing: 8) {
                    ProgressBar(fraction: p.fraction(), height: metrics.compact ? 3 : 4)
                    if hours {
                        Text("\(Format.hour(p.start)) – \(Format.hour(p.end))").font(.caption.monospacedDigit()).foregroundStyle(Theme.secondary)
                            .fixedSize()
                    }
                }
            }
        } else {
            Text(item.hasEPG == false ? "Pas de programme" : " ").font(metrics.compact ? .footnote : .callout).foregroundStyle(Theme.secondary)
        }
    }
}

#if DEBUG
private struct ChannelCardPreview: View {
    @Environment(\.metrics) private var metrics
    var body: some View {
        let now = Date.now
        let journal = Programme(title: "Le Journal", start: now.addingTimeInterval(-1200), end: now.addingTimeInterval(2400), overview: nil)
        ScrollView {
            VStack(alignment: .leading, spacing: metrics.cardSpacing) {
                HStack(alignment: .top, spacing: metrics.cardSpacing) {
                    ChannelCard(item: ChannelItem(id: ContentID("live:fr-tf1"), name: "TF1", status: .playing, quality: "FHD", isFavorite: true, now: journal)) {}
                        .frame(width: metrics.recentCard)
                    if !metrics.compact {
                        ChannelCard(item: ChannelItem(id: ContentID("live:fr-france2"), name: "FRANCE 2", status: .watched(now.addingTimeInterval(-1800)),
                                                      quality: "4K", now: journal)) {}
                            .frame(width: metrics.recentCard)
                    }
                }
                VStack(spacing: metrics.compact ? 6 : 12) {
                    ChannelCard(item: ChannelItem(id: ContentID("live:fr-m6"), name: "M6", quality: "HD", now: journal), hours: true) {}
                    ChannelCard(item: ChannelItem(id: ContentID("live:fr-arte"), name: "ARTE", quality: "HD", hasEPG: false), hours: true) {}
                }
                .frame(maxWidth: metrics.listWidth)
            }
            .padding(metrics.inset)
        }
        .background(Theme.background)
        .preferredColorScheme(.dark)
    }
}

#Preview("Chaîne") { ChannelCardPreview() }
#endif
