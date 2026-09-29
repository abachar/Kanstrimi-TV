import SwiftUI
#if os(macOS)
import AppKit

/// Hosts the player's persistent drawable view. VLC was attached to it at init.
struct VLCVideoView: NSViewRepresentable {
    let view: NSView
    func makeNSView(context: Context) -> NSView { view }
    func updateNSView(_ nsView: NSView, context: Context) { }
}
#else
import UIKit

/// Hosts the player's persistent drawable view. VLC was attached to it at init.
struct VLCVideoView: UIViewRepresentable {
    let view: UIView

    func makeUIView(context: Context) -> UIView { view }
    func updateUIView(_ uiView: UIView, context: Context) { }
}
#endif
