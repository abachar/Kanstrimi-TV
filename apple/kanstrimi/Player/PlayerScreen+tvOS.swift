#if os(tvOS)
import SwiftUI

/// The Siri Remote drives the player: clicks, swipes and long presses on an invisible focused surface.
extension PlayerScreen {
    /// Long presses on remote buttons are caught below SwiftUI, whatever has the focus.
    var host: some View {
        PressCatcher(pressTypes: [.leftArrow, .rightArrow], onLongPress: { type in
            guard sheet == .none, !player.isLive else { return }
            player.startScan(forward: type == .rightArrow)
            showControls(autoHide: false)
        }, onRelease: { type in
            guard type == .leftArrow || type == .rightArrow, player.scanTarget != nil else { return }
            player.stopScan()
            showControls()
        }) {
            content.environment(env)
        }
    }

    /// The one bar, for a film, an episode or a channel.
    var controls: some View {
        PlayerBar(interactive: barFocused, onActivity: { armSheetTimer() }, onLeave: { leaveBar(hide: $0) })
    }

    /// Invisible focus surface that receives the remote when nothing else is focused.
    var surface: some View {
        Color.clear
            .contentShape(Rectangle())
            .focusable(true)
            .focused($surfaceFocused)
            .onAppear { surfaceFocused = true }
            .onTapGesture { select() }
            .onPlayPauseCommand { player.togglePlayPause(); showControls() }
            .onMoveCommand { direction in handleMove(direction) }
            .onLongPressGesture(minimumDuration: 0.6) { focusBar() }
    }

    private func handleMove(_ direction: MoveCommandDirection) {
        if direction == .down { focusBar(); return }
        showControls()
        if player.isLive {
            // No zapping on the arrows: without channel numbers to learn, the order means nothing.
            // ▲ and ▶ do nothing: the recent channels and the programme are in the bar (▼).
            if direction == .left { sheet = .channels }
        } else {
            switch direction {
            case .left: player.seek(by: -10)
            case .right: player.seek(by: 10)
            default: break
            }
        }
    }
}
#endif
