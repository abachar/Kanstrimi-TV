#if os(iOS)
import SwiftUI

/// Touch drives the player: a tap shows or hides the controls, a double tap on a side seeks
/// ±10 s, a horizontal drag scrubs, a vertical swipe zaps in live, a long press opens the
/// panel. The screen is landscape while it is up and can leave for Picture-in-Picture.
extension PlayerScreen {
    var host: some View {
        content
            .environment(env)
            .statusBarHidden()
            .persistentSystemOverlays(.hidden)
            .lockLandscape()
            .onAppear {
                player.activateAudioSession()
                player.attachPictureInPicture()
            }
    }

    var surface: some View {
        GeometryReader { geo in
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture(count: 2) { point in
                    guard !player.isLive else { return }
                    player.seek(by: point.x < geo.size.width / 2 ? -10 : 10)
                    showControls()
                }
                .onTapGesture { select() }
                .onLongPressGesture(minimumDuration: 0.6) { sheet = .panel }
                .gesture(drag(width: geo.size.width))
        }
    }

    /// One drag, its axis decided by the dominant direction: scrub in VOD, zap in live.
    private func drag(width: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 24)
            .onChanged { value in
                let dx = value.translation.width, dy = value.translation.height
                guard !player.isLive, abs(dx) > abs(dy), player.duration > 0 else { return }
                // Half the width sweeps half the file: fine enough for a two-hour film on a phone.
                let target = player.time + Double(dx / width) * player.duration * 0.5
                scrubTime = min(max(0, target), player.duration - 1)
                showControls(autoHide: false)
            }
            .onEnded { value in
                let dx = value.translation.width, dy = value.translation.height
                if player.isLive {
                    if abs(dy) > abs(dx), abs(dy) > 60 { player.zap(offset: dy < 0 ? 1 : -1) }
                } else if let t = scrubTime {
                    player.seek(to: t)
                }
                scrubTime = nil
                showControls()
            }
    }

    var controls: some View { PlayerControls(scrubTime: scrubTime, onExit: { exit() }, onSheet: { sheet = $0 }) }
}
#endif
