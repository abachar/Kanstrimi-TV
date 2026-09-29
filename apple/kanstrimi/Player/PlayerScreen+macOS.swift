#if os(macOS)
import SwiftUI

/// Keyboard and mouse drive the player on macOS: space = pause, arrows = seek/zap,
/// F = fullscreen, Esc = close. Controls appear on hover.
extension PlayerScreen {
    var host: some View {
        content
            .environment(env)
    }

    var surface: some View {
        Color.clear
            .contentShape(Rectangle())
            .focusable()
            .focused($surfaceFocused)
            .onKeyPress(.space) {
                player.togglePlayPause()
                return .handled
            }
            .onKeyPress(.leftArrow) {
                if !player.isLive { player.seek(by: -10); showControls(); return .handled }
                return .ignored
            }
            .onKeyPress(.rightArrow) {
                if !player.isLive { player.seek(by: 10); showControls(); return .handled }
                return .ignored
            }
            .onKeyPress(.upArrow) {
                if player.isLive { player.zap(offset: -1); showControls(); return .handled }
                return .ignored
            }
            .onKeyPress(.downArrow) {
                if player.isLive { player.zap(offset: 1); showControls(); return .handled }
                return .ignored
            }
            .onKeyPress { event in
                if event.key == KeyEquivalent("f") || event.key == KeyEquivalent("F") {
                    if let window = NSApp.keyWindow {
                        window.toggleFullScreen(nil)
                    }
                    return .handled
                }
                return .ignored
            }
            .onContinuousHover { phase in
                switch phase {
                case .active(_): showControls()
                case .ended: break
                }
            }
            .onTapGesture {
                select()
            }
            .onAppear {
                surfaceFocused = true
            }
    }

    var controls: some View {
        PlayerControls(scrubTime: nil, onExit: { exit() }, onSheet: { sheet = $0 })
    }
}
#endif
