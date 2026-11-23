import SwiftUI

/// The player minimized (Apple TV): its video in the bottom-right corner above every screen, with what it plays and
/// how to bring it back. Drawn in a window of its own (`miniPlayer`), which never takes the focus.
struct MiniPlayerView: View {
    @Environment(AppEnvironment.self) private var env
    private var player: PlayerService { env.player }

    var body: some View {
        if player.isMinimized {
            VignetteFrame(view: player.videoView, title: player.channel?.name ?? player.context?.content.title ?? "",
                          variant: player.variant, hint: Text("\(Image(systemName: "playpause.fill"))  Plein écran"))
                .playerChromeInsets()
        }
    }
}

extension View {
    /// Apple TV: the minimized player above every screen, in a window that never takes the focus.
    @ViewBuilder func miniPlayer() -> some View {
        #if os(tvOS)
        modifier(MiniPlayerWindow())
        #else
        self
        #endif
    }

    /// Apple TV: ⏯ on any screen brings the minimized player back in full.
    @ViewBuilder func restoresMiniPlayer(_ env: AppEnvironment) -> some View {
        #if os(tvOS)
        onPlayPauseCommand { if env.player.isMinimized { env.player.restore() } }
        #else
        self
        #endif
    }
}

#if os(tvOS)
private struct MiniPlayerWindow: ViewModifier {
    @Environment(AppEnvironment.self) private var env
    @State private var window: UIWindow?

    func body(content: Content) -> some View {
        content.onChange(of: env.player.isMinimized) { _, minimized in
            if minimized { show() } else { hide() }
        }
    }

    private func show() {
        guard window == nil,
              let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first else { return }
        let host = UIHostingController(rootView: MiniPlayerView().environment(env).adaptiveMetrics())
        host.view.backgroundColor = .clear
        let window = UIWindow(windowScene: scene)
        window.windowLevel = .normal + 1
        window.backgroundColor = .clear
        // Seen, never touched: the focus stays on the screen under it.
        window.isUserInteractionEnabled = false
        window.rootViewController = host
        window.isHidden = false
        self.window = window
    }

    private func hide() {
        window?.isHidden = true
        window = nil
    }
}
#endif
