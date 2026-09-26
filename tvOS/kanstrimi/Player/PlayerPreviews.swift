#if DEBUG
import SwiftUI

@MainActor
enum PreviewData {
    /// A fresh environment per preview, so states never bleed between them.
    static func makeEnv() -> AppEnvironment {
        let e = AppEnvironment()
        e.scenario.latency = 0
        return e
    }
    static func movieContext(_ env: AppEnvironment) async -> PlaybackContext {
        try! await env.client.playbackContext(id: ContentID("tmdb:movie:100000"))
    }
    static func episodeContext(_ env: AppEnvironment) async -> PlaybackContext {
        try! await env.client.playbackContext(id: ContentID("tmdb:tv:20000:s02e04"))
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
                let ctx = try! await env.client.playbackContext(id: list[0].id)
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
