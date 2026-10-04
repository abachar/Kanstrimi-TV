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
                            RoundedRectangle(cornerRadius: size * 0.22).fill(Theme.logoTile)
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
            Text(initials(of: channel.name)).font(.system(size: size * 0.36, weight: .heavy)).foregroundStyle(.white)
        }
    }
}

/// A `ChannelCard` fed from what this device knows of the channel (`AppEnvironment.channelItem`), and that asks its
/// programme on air when `loads`: the Direct screen's rows on tvOS do not, the column beside them shows it.
struct LoadedChannelCard: View {
    @Environment(AppEnvironment.self) private var env
    let channel: Channel
    var status: ChannelItem.Status? = nil
    var hours = false
    var loads = true
    let action: () -> Void

    var body: some View {
        ChannelCard(item: env.channelItem(channel, status: status), hours: hours, action: action)
            .task(id: channel.id) { if loads { await env.loadNowPlaying(on: channel) } }
    }
}

extension AppEnvironment {
    /// A channel as its card shows it: the quality it starts in here, its programme on air, its guide state.
    func channelItem(_ channel: Channel, status: ChannelItem.Status? = nil) -> ChannelItem {
        // A channel drawn from a card of the home (no versions, no favourite) takes both from the detail that
        // `loadNowPlaying` fetched, once known; a listed channel is already complete and fresher than the cache.
        let full = channel.versions.isEmpty ? (channelCache.latest(channel.id) ?? channel) : channel
        return ChannelItem(id: channel.id, name: channel.name, logo: channel.logo, status: status,
                    quality: (liveVersion(of: full)?.quality ?? full.maxQuality)?.rawValue, isFavorite: full.isFavorite ?? false,
                    now: nowPlaying(on: channel), hasEPG: guide(of: channel).hasEPG)
    }
}
