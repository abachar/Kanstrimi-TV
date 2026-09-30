import SwiftUI

/// The channel's programmes from the one on air until 6:00, one card each, the current one marked.
/// Shared by the panel (iOS) and the tvOS bar.
struct ProgrammeStrip: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics
    @FocusState private var focused: Date?
    var onActivity: () -> Void = { }
    /// nil while loading.
    @State private var programmes: [Programme]?
    private var player: PlayerService { env.player }

    var body: some View {
        Group {
            if let programmes {
                if programmes.isEmpty {
                    Text("Programme inconnu pour cette chaîne").foregroundStyle(Theme.secondary)
                } else {
                    ScrollView(.horizontal) {
                        HStack(spacing: 20) {
                            ForEach(programmes, id: \.start) { p in
                                // Focusable so the remote can scroll the day; nothing to do on select.
                                Button { onActivity() } label: { card(p) }
                                    .cardButtonStyle()
                                    .focused($focused, equals: p.start)
                            }
                        }
                        .padding(.vertical, 20)
                    }
                    .scrollClipDisabled()
                }
            } else {
                ProgressView()
            }
        }
        .onChange(of: focused) { _, _ in onActivity() }
        .task(id: player.channel?.id) { await load() }
    }

    private func load() async {
        guard player.isLive, let id = player.channel?.id else { return }
        programmes = nil
        // An unreliable guide is no reason for an error screen: a failure reads as an unknown programme.
        programmes = (try? await env.call { try await env.client.programmes(channel: id) }) ?? []
    }

    private func card(_ p: Programme) -> some View {
        let onAir = p.start <= .now && p.end > .now
        return VStack(alignment: .leading, spacing: 6) {
            Text("\(Format.hour(p.start)) – \(Format.hour(p.end))").font(.caption2.weight(.semibold)).foregroundStyle(Theme.secondary)
            Text(p.title).font(.headline).lineLimit(2)
            if let o = p.overview { Text(o).font(.caption2).foregroundStyle(Theme.secondary).lineLimit(3) }
            Spacer(minLength: 0)
            if onAir {
                Text("EN COURS").font(.caption2.weight(.bold)).tracking(1).foregroundStyle(Theme.accent)
                ProgressBar(fraction: p.fraction(), height: 4)
            }
        }
        // A fixed height: the EN COURS mark sits at the bottom of the card, not of the screen.
        .frame(width: metrics.panelCard, height: metrics.panelCard * 0.7, alignment: .topLeading)
        .padding(20)
    }
}

/// The 8 last channels, most recent first; a click switches at once. Shared by the ▲ overlay
/// (iOS) and the Récentes panel of the tvOS bar.
struct RecentChannelsStrip: View {
    @Environment(AppEnvironment.self) private var env
    @FocusState private var focused: ContentID?
    var onActivity: () -> Void = { }
    let onPick: () -> Void
    private var player: PlayerService { env.player }

    private var recents: [(entry: RecentChannelsStore.Entry, channel: Channel)] {
        env.recentChannels.entries.compactMap { e in
            player.channels.first { $0.id == e.channelID }.map { (e, $0) }
        }
    }

    var body: some View {
        Group {
            if recents.isEmpty {
                Text("Aucune chaîne regardée récemment.").foregroundStyle(Theme.secondary).padding(.vertical, 30)
            } else {
                ScrollView(.horizontal) {
                    HStack(spacing: 20) {
                        ForEach(recents, id: \.entry.channelID) { r in
                            RecentChannelCard(channel: r.channel, watchedAt: r.entry.watchedAt, isCurrent: r.channel.id == player.channel?.id) {
                                player.play(channel: r.channel, in: player.channels)
                                env.recentChannels.record(r.channel.id)
                                onPick()
                            }
                            .focused($focused, equals: r.channel.id)
                        }
                    }
                    .padding(.vertical, 24).padding(.horizontal, 8)
                }
                .scrollClipDisabled()
            }
        }
        // The previous channel first: the usual back-and-forth is one click away.
        .defaultFocus($focused, env.recentChannels.previous(excluding: player.channel?.id) ?? recents.first?.channel.id)
        .onChange(of: focused) { _, _ in onActivity() }
    }
}
