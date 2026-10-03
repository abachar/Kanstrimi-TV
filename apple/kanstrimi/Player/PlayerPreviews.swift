#if DEBUG
import SwiftUI

@MainActor
enum PreviewData {
    /// A fresh environment per preview, so states never bleed between them.
    static func makeEnv() -> AppEnvironment {
        let e = AppEnvironment(forceMock: true)
        e.scenario.latency = 0
        return e
    }
    static func movieContext(_ env: AppEnvironment) async -> PlaybackContext {
        try! await env.playbackContext(for: env.client.detail(id: ContentID("tmdb:movie:535544")))
    }
    static func episodeContext(_ env: AppEnvironment) async -> PlaybackContext {
        let series = try! await env.client.detail(id: ContentID("tmdb:tv:300388"))
        let ep = series.allEpisodes.first { $0.id == ContentID("tmdb:tv:300388:s01e02") }!
        return try! await env.playbackContext(for: ep, of: series)
    }
    /// The last episode of the demo series: what follows is another series.
    static func lastEpisodeContext(_ env: AppEnvironment) async -> PlaybackContext {
        let series = try! await env.client.detail(id: ContentID("tmdb:tv:300388"))
        return try! await env.playbackContext(for: series.allEpisodes.last!, of: series)
    }
    static func channels(_ env: AppEnvironment) async -> [Channel] {
        (try! await env.client.channels()).flatMap(\.channels)
    }
}

/// A stand-in for a video picture: bright and dark areas, hard edges and fine detail, so every
/// overlay shows what it lets through (materials blur it, gradients darken it).
struct PreviewFrame: View {
    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            ZStack {
                LinearGradient(colors: [Color(red: 0.98, green: 0.62, blue: 0.25), Color(red: 0.85, green: 0.25, blue: 0.35),
                                        Color(red: 0.2, green: 0.12, blue: 0.4)],
                               startPoint: .top, endPoint: .bottom)
                Circle().fill(Color(red: 1, green: 0.93, blue: 0.6)).frame(width: h * 0.32).position(x: w * 0.68, y: h * 0.4)
                // Hills: dark masses under the bottom controls.
                Ellipse().fill(Color(red: 0.12, green: 0.1, blue: 0.22)).frame(width: w * 0.9, height: h * 0.5).position(x: w * 0.25, y: h * 0.95)
                Ellipse().fill(Color(red: 0.06, green: 0.18, blue: 0.2)).frame(width: w * 1.1, height: h * 0.45).position(x: w * 0.8, y: h * 1.02)
                // White stripes: fine detail that a blur or a scrim visibly changes.
                HStack(spacing: w * 0.02) {
                    ForEach(0..<12, id: \.self) { _ in Rectangle().fill(.white.opacity(0.85)).frame(width: w * 0.012) }
                }
                .frame(height: h * 0.22).position(x: w * 0.3, y: h * 0.3)
            }
        }
    }
}

private struct PlayerPreviewHost: View {
    let state: PlayerService.PreviewState
    /// `.nextTitle`: after the last episode of a series rather than after a movie.
    var lastEpisode = false
    @State private var env = PreviewData.makeEnv()
    @State private var ready = false
    var body: some View {
        Group {
            if ready { PlayerScreen() } else { Color.black }
        }
        .environment(env)
        .preferredColorScheme(.dark)
        .task {
            switch state {
            case .livePlaying:
                let list = await PreviewData.channels(env)
                let ctx = PlaybackContext(content: PlaybackContent(id: list[0].id, kind: .live, title: list[0].name, subtitle: nil, episode: nil, backdrop: nil),
                                          playback: try! await env.client.playback(id: list[0].id))
                env.player.debugPut(ctx, state: state, channels: list)
            case .nextEpisode:
                env.player.debugPut(await PreviewData.episodeContext(env), state: state)
            case .nextTitle where lastEpisode:
                let ctx = await PreviewData.lastEpisodeContext(env)
                env.player.debugPut(ctx, state: state, suggestions: try? await env.client.suggestions(id: ctx.content.id))
            default:
                let ctx = await PreviewData.movieContext(env)
                env.player.debugPut(ctx, state: state, suggestions: try? await env.client.suggestions(id: ctx.content.id))
            }
            ready = true
        }
    }
}

/// Similaires on its own over a picture, laid out as in the panel: both platforms.
private struct RelatedStripPreviewHost: View {
    @State private var env = PreviewData.makeEnv()
    @State private var ready = false
    var body: some View {
        ZStack(alignment: .bottomLeading) {
            PreviewFrame().ignoresSafeArea()
            LinearGradient(colors: [.clear, .black.opacity(0.85)], startPoint: .top, endPoint: .bottom).ignoresSafeArea()
            if ready { RelatedStrip(onPick: {}).padding(.horizontal, 40).padding(.bottom, 30) }
        }
        .environment(env)
        .preferredColorScheme(.dark)
        .task {
            let ctx = await PreviewData.movieContext(env)
            env.player.debugPut(ctx, state: .panel, suggestions: try? await env.client.suggestions(id: ctx.content.id))
            ready = true
        }
    }
}

#Preview("Lecteur · VOD en pause") { PlayerPreviewHost(state: .vodPaused) }
#Preview("Lecteur · échec") { PlayerPreviewHost(state: .failure) }
#Preview("Lecteur · épisode suivant") { PlayerPreviewHost(state: .nextEpisode) }
#Preview("Lecteur · film suivant") { PlayerPreviewHost(state: .nextTitle) }
#Preview("Lecteur · série suivante") { PlayerPreviewHost(state: .nextTitle, lastEpisode: true) }
#Preview("Lecteur · Similaires") { RelatedStripPreviewHost() }
#Preview("Lecteur · direct") { PlayerPreviewHost(state: .livePlaying) }
#Preview("Lecteur · chargement") { PlayerPreviewHost(state: .opening) }

#if os(tvOS)
/// tvOS bar with its buttons in hand, a panel open or not. Focus does not show in a preview.
private struct BarPreviewHost: View {
    enum Kind { case live, movie, episode }
    let kind: Kind
    var panel: PlayerBar.Panel? = nil
    @State private var env = PreviewData.makeEnv()
    @State private var ready = false
    var body: some View {
        ZStack {
            PreviewFrame().ignoresSafeArea()
            if ready { PlayerBar(interactive: true, onActivity: {}, onLeave: { _ in }, initialPanel: panel) }
        }
        .environment(env)
        .task {
            switch kind {
            case .live:
                let list = await PreviewData.channels(env)
                for c in list.prefix(5).reversed() { env.recentChannels.record(c.id) }
                let ctx = PlaybackContext(content: PlaybackContent(id: list[0].id, kind: .live, title: list[0].name, subtitle: nil, episode: nil, backdrop: nil),
                                          playback: try! await env.client.playback(id: list[0].id))
                env.player.debugPut(ctx, state: .livePlaying, channels: list)
            case .movie:
                let ctx = await PreviewData.movieContext(env)
                env.player.debugPut(ctx, state: .panel, suggestions: try? await env.client.suggestions(id: ctx.content.id))
            case .episode:
                let ctx = await PreviewData.episodeContext(env)
                env.player.debugPut(ctx, state: .panel, suggestions: try? await env.client.suggestions(id: ctx.content.id))
            }
            ready = true
        }
    }
}

/// ◀ in live: the channels of the group.
private struct ChannelListPreviewHost: View {
    @State private var env = PreviewData.makeEnv()
    @State private var ready = false
    var body: some View {
        ZStack {
            PreviewFrame().ignoresSafeArea()
            if ready { ChannelListOverlay(onClose: {}) }
        }
        .environment(env)
        .task {
            // A programme on air for most channels, none for a few: both kinds of rows show.
            let titles = ["Journal de 20 h", "Ligue · Lyon – Nantes", "Cinéma du dimanche", "Série du soir", "Météo", "Grand débat", "Magazine santé"]
            let start = Date.now.addingTimeInterval(-1500)
            let list = await PreviewData.channels(env).enumerated().map { i, c in
                Channel(id: c.id, name: c.name, number: c.number, logo: c.logo, maxQuality: c.maxQuality, hasEPG: i % 5 != 4,
                        isFavorite: c.isFavorite, versions: c.versions,
                        now: i % 5 == 4 ? nil : Programme(title: titles[i % titles.count], start: start.addingTimeInterval(Double(i) * -300),
                                                          end: start.addingTimeInterval(3600), overview: nil))
            }
            let ctx = PlaybackContext(content: PlaybackContent(id: list[0].id, kind: .live, title: list[0].name, subtitle: nil, episode: nil, backdrop: nil),
                                      playback: try! await env.client.playback(id: list[0].id))
            env.player.debugPut(ctx, state: .livePlaying, channels: list)
            ready = true
        }
    }
}

#Preview("Barre · direct · Programme") { BarPreviewHost(kind: .live, panel: .programme) }
#Preview("Barre · direct · Récentes") { BarPreviewHost(kind: .live, panel: .recents) }
#Preview("Barre · direct · Infos") { BarPreviewHost(kind: .live, panel: .infos) }
#Preview("Barre · film") { BarPreviewHost(kind: .movie) }
#Preview("Barre · film · Infos") { BarPreviewHost(kind: .movie, panel: .infos) }
#Preview("Barre · film · Similaires") { BarPreviewHost(kind: .movie, panel: .related) }
#Preview("Barre · film · Distribution") { BarPreviewHost(kind: .movie, panel: .cast) }
#Preview("Barre · série · Épisodes") { BarPreviewHost(kind: .episode, panel: .episodes) }
#Preview("Direct · chaînes ◀") { ChannelListPreviewHost() }
#endif
#endif
