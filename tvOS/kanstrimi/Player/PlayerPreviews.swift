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
        try! await env.playbackContext(for: env.client.detail(id: ContentID("tmdb:movie:100000")))
    }
    static func episodeContext(_ env: AppEnvironment) async -> PlaybackContext {
        let series = try! await env.client.detail(id: ContentID("tmdb:tv:20000"))
        let ep = series.allEpisodes.first { $0.id == ContentID("tmdb:tv:20000:s02e04") }!
        return try! await env.playbackContext(for: ep, of: series)
    }
    static func channels(_ env: AppEnvironment) async -> [Channel] {
        (try! await env.client.channels()).flatMap(\.channels)
    }
}

private struct PlayerPreviewHost: View {
    let state: PlayerService.PreviewState
    @State private var env = PreviewData.makeEnv()
    @State private var ready = false
    var body: some View {
        Group {
            if ready { PlayerScreen() } else { Color.black }
        }
        .environment(env)
        .task {
            switch state {
            case .livePlaying:
                let list = await PreviewData.channels(env)
                let ctx = PlaybackContext(content: PlaybackContent(id: list[0].id, kind: .live, title: list[0].name, subtitle: nil, episode: nil, backdrop: nil),
                                          playback: try! await env.client.playback(id: list[0].id))
                env.player.debugPut(ctx, state: state, channels: list)
            case .nextEpisode:
                env.player.debugPut(await PreviewData.episodeContext(env), state: state)
            default:
                env.player.debugPut(await PreviewData.movieContext(env), state: state)
            }
            ready = true
        }
    }
}

#Preview("VOD au repos") { PlayerPreviewHost(state: .vodPaused) }
#Preview("Flux en échec") { PlayerPreviewHost(state: .failure) }
#Preview("Épisode suivant") { PlayerPreviewHost(state: .nextEpisode) }
#Preview("Direct + zapping") { PlayerPreviewHost(state: .livePlaying) }
#Preview("Chargement") { PlayerPreviewHost(state: .opening) }
#Preview("Panneau") {
    let env = PreviewData.makeEnv()
    PlayerPanel(onClose: {})
        .environment(env)
        .task { env.player.debugPut(await PreviewData.movieContext(env), state: .panel) }
}
#endif
