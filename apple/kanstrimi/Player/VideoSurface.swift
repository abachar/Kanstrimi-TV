import AetherEngine
import SwiftUI

/// Hosts the player's persistent video view, which the service keeps and the engine is bound to.
struct VideoSurface: UIViewRepresentable {
    let view: AetherPlayerView

    func makeUIView(context: Context) -> AetherPlayerView { view }
    func updateUIView(_ uiView: AetherPlayerView, context: Context) { }
}
