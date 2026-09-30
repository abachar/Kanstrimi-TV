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

// MARK: - Infos and episodes, shared by the tvOS bar and the touch controls

/// Infos: in live the channel and what it shows, the guide's summary included; otherwise the title,
/// its facts and summary, and the version playing.
struct PlayerInfos: View {
    @Environment(AppEnvironment.self) private var env
    /// The channel logo in live: large on the television, smaller on a phone.
    var logoSize: CGFloat = 120
    @State private var card: Card?
    private var player: PlayerService { env.player }

    var body: some View {
        HStack(alignment: .top, spacing: 36) {
            if player.isLive, let channel = player.channel {
                ChannelLogo(channel: channel, size: logoSize)
                VStack(alignment: .leading, spacing: 10) {
                    Text(channel.name).font(.title3.weight(.bold))
                    if let now = player.epg.now {
                        Text(now.title).font(.headline)
                        Text("\(Format.hour(now.start)) – \(Format.hour(now.end))").font(.callout).foregroundStyle(Theme.secondary)
                        if let o = now.overview { Text(o).font(.callout).lineLimit(4) }
                    } else {
                        Text("Programme inconnu pour cette chaîne").foregroundStyle(Theme.secondary)
                    }
                    if let next = player.epg.next {
                        Text("Ensuite · \(Format.hour(next.start)) · \(next.title)").font(.callout).foregroundStyle(Theme.secondary)
                    }
                    versionLine
                }
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    if !facts.isEmpty { Text(facts).font(.callout).foregroundStyle(Theme.secondary) }
                    if let o = overview { Text(o).font(.callout).lineLimit(4) }
                    versionLine
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: 1300, alignment: .leading)
        .task(id: player.context?.content.id) { await load() }
    }

    @ViewBuilder private var versionLine: some View {
        if let v = player.version, let s = player.source {
            Text("\(v.longLabel) · \(player.sourceLabel(s, in: v))").font(.caption).foregroundStyle(Theme.secondary)
        }
    }

    private var episode: Episode? {
        guard let id = player.context?.content.id else { return nil }
        return card?.allEpisodes.first { $0.id == id }
    }

    private var facts: String {
        guard let card else { return "" }
        if let episode {
            return [episode.airDate.map { String(Calendar.current.component(.year, from: $0)) }, episode.runtime.map { "\($0) min" }].compactMap { $0 }.joined(separator: " · ")
        }
        return ([card.year.map(String.init)] + card.genres.prefix(3).map(Optional.some) + [card.runtime.map { "\($0) min" }])
            .compactMap { $0 }.joined(separator: " · ")
    }

    private var overview: String? { episode?.overview ?? card?.overview }

    private func load() async {
        guard let c = player.context, !player.isLive else { return }
        card = try? await env.client.detail(id: c.seriesID ?? c.content.id)
    }
}

/// Épisodes: the season playing, the current episode marked; a click plays another.
struct SeasonEpisodesStrip: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics
    @FocusState private var focused: ContentID?
    var onActivity: () -> Void = { }
    let onPick: () -> Void
    @State private var series: Card?
    private var player: PlayerService { env.player }

    private var episodes: [Episode] {
        guard let season = player.context?.content.episode?.season else { return [] }
        return series?.allEpisodes.filter { $0.season == season } ?? []
    }

    var body: some View {
        Group {
            if series == nil {
                ProgressView()
            } else {
                ScrollView(.horizontal) {
                    HStack(spacing: 24) {
                        ForEach(episodes) { ep in
                            Button { play(ep) } label: { card(ep) }
                                .cardButtonStyle()
                                .disabled(ep.versions.isEmpty)
                                .focused($focused, equals: ep.id)
                        }
                    }
                    .padding(.vertical, 20)
                }
                .scrollClipDisabled()
            }
        }
        .defaultFocus($focused, player.context?.content.id)
        .onChange(of: focused) { _, _ in onActivity() }
        .task(id: player.context?.seriesID) {
            guard let id = player.context?.seriesID else { return }
            series = try? await env.client.detail(id: id)
        }
    }

    private func card(_ ep: Episode) -> some View {
        let isCurrent = ep.id == player.context?.content.id
        return VStack(alignment: .leading, spacing: 10) {
            ZStack(alignment: .bottomLeading) {
                ArtView(id: ep.id, url: ep.still)
                if isCurrent {
                    ProgressBar(fraction: player.fraction, height: 5).padding(.horizontal, 12).padding(.bottom, 10)
                } else if let p = ep.progress, p.isResumable {
                    ProgressBar(fraction: p.fraction, height: 5).padding(.horizontal, 12).padding(.bottom, 10)
                }
                if ep.progress?.isWatched == true, !isCurrent {
                    Image(systemName: "checkmark.circle.fill").font(.title3).padding(10).foregroundStyle(.white)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                }
            }
            .frame(width: metrics.stillWidth * 1.3, height: metrics.stillWidth * 1.3 * 9 / 16)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            HStack(spacing: 8) {
                Text("É\(ep.number)").foregroundStyle(isCurrent ? Theme.accent : Theme.secondary)
                Text(ep.title).lineLimit(1)
            }
            .font(.callout.weight(.semibold))
            .frame(width: metrics.stillWidth * 1.3, alignment: .leading)
        }
        .padding(12)
    }

    private func play(_ ep: Episode) {
        guard ep.id != player.context?.content.id, let series else { return }
        Task {
            guard let ctx = try? await env.playbackContext(for: ep, of: series) else { return }
            player.play(ctx)
            onPick()
        }
    }
}
