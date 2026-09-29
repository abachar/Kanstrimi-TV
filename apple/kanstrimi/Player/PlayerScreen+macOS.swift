#if os(macOS)
import SwiftUI

/// Keyboard and mouse drive the player on macOS: space = pause, arrows = seek (held: fast forward)/zap,
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
            // Pressed: ±10 s; held (key repeat): fast forward or rewind until the key goes up.
            .onKeyPress(keys: [.leftArrow, .rightArrow], phases: [.down, .repeat, .up]) { press in
                guard !player.isLive else { return .ignored }
                let forward = press.key == .rightArrow
                switch press.phase {
                case .down: player.seek(by: forward ? 10 : -10)
                case .repeat: player.startScan(forward: forward)
                case .up: player.stopScan()
                default: break
                }
                showControls()
                return .handled
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
