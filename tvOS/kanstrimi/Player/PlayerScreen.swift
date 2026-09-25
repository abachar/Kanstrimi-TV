import SwiftUI

struct PlayerScreen: View {
    @Environment(AppEnvironment.self) private var env
    var body: some View {
        ZStack {
            VLCVideoView(player: env.player.player).ignoresSafeArea()
            Text(env.player.context?.content.title ?? "").font(.title)
        }
        .onExitCommand { env.player.stop() }
    }
}
