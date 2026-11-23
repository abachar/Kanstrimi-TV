import AetherEngine
import SwiftUI

/// Hosts a video view the service keeps and the engine is bound to. The player's view moves between the player
/// screen and its minimized window (Apple TV): the host `active` takes it back whenever it shows, the screen it
/// came from letting go of it after a moment; an inactive host leaves it where it is.
struct VideoSurface: UIViewRepresentable {
    let view: AetherPlayerView
    var active = true

    final class Coordinator {
        var active = true
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> UIView {
        let host = UIView()
        host.backgroundColor = .clear
        context.coordinator.active = active
        if active { adopt(into: host) }
        // The screen it came from may tear its own host down after this one appeared.
        let coordinator = context.coordinator
        for delay in [0.3, 0.8] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak host] in
                if let host, host.window != nil, coordinator.active { adopt(into: host) }
            }
        }
        return host
    }

    func updateUIView(_ host: UIView, context: Context) {
        context.coordinator.active = active
        if active { adopt(into: host) }
    }

    private func adopt(into host: UIView) {
        guard view.superview !== host else { return }
        view.removeFromSuperview()
        view.frame = host.bounds
        view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        host.addSubview(view)
    }
}
