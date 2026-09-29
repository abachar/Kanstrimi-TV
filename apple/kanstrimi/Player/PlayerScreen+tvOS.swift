#if os(tvOS)
import SwiftUI

/// The Siri Remote drives the player: clicks, swipes and long presses on an invisible focused surface.
extension PlayerScreen {
    /// Long presses on remote buttons are caught below SwiftUI, whatever has the focus.
    var host: some View {
        PressCatcher(pressTypes: [.downArrow, .leftArrow, .rightArrow], onLongPress: { type in
            guard sheet == .none else { return }
            switch type {
            case .downArrow: if player.isLive { sheet = .channels }
            case .leftArrow, .rightArrow: player.startScan(forward: type == .rightArrow); showControls(autoHide: false)
            default: break
            }
        }, onRelease: { type in
            guard type == .leftArrow || type == .rightArrow, player.scanTarget != nil else { return }
            player.stopScan()
            showControls()
        }) {
            content.environment(env)
        }
    }

    /// At rest, the VOD overlay shows the state and the remote hints; live has its banner.
    @ViewBuilder var controls: some View {
        if !player.isLive { VODOverlay() }
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
            .onLongPressGesture(minimumDuration: 0.6) { if !player.isLive { sheet = .panel } }
    }

    private func handleMove(_ direction: MoveCommandDirection) {
        showControls()
        if player.isLive {
            switch direction {
            case .up: player.zap(offset: -1)
            case .down: player.zap(offset: 1)
            case .left: sheet = .recents
            case .right: sheet = .panel
            @unknown default: break
            }
        } else {
            switch direction {
            case .left: player.seek(by: -10)
            case .right: player.seek(by: 10)
            case .down: sheet = .panel
            case .up: sheet = .panel
            @unknown default: break
            }
        }
    }
}
#endif
