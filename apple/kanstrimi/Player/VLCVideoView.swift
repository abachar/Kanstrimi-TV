import SwiftUI
import UIKit

/// Hosts the player's persistent drawable view. VLC was attached to it at init.
struct VLCVideoView: UIViewRepresentable {
    let view: UIView

    func makeUIView(context: Context) -> UIView { view }
    func updateUIView(_ uiView: UIView, context: Context) { }
}
