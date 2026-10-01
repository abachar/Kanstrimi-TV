#if os(iOS)
import SwiftUI

/// Touch drives the player, upright or sideways (it follows the phone):
/// - a tap shows or hides the controls (or closes the open panel);
/// - a double tap on a side seeks ±10 s, a horizontal drag scrubs (films, episodes);
/// - live: a swipe to the right sideways, or upwards upright, brings the channels;
/// - upright, a swipe upwards opens the first panel of a film or an episode, a swipe down closes the player.
/// The player can leave for Picture-in-Picture.
extension PlayerScreen {
    var host: some View {
        content
            .environment(env)
            .statusBarHidden()
            .persistentSystemOverlays(.hidden)
            .allowsRotation()
            .onGeometryChange(for: Bool.self) { $0.size.height > $0.size.width } action: { isPortrait = $0 }
            .onAppear {
                player.attachPictureInPicture()
                #if DEBUG
                // scripts/shot.sh with LANDSCAPE=1: the player sideways, as after the full-screen button. Read once.
                if UserDefaults.standard.bool(forKey: "debug.landscape") {
                    UserDefaults.standard.removeObject(forKey: "debug.landscape")
                    Task { try? await Task.sleep(for: .seconds(1.2)); OrientationLock.rotate(to: .landscapeRight) }
                }
                // PANEL=<Programme|Récentes|Épisodes|Infos|Chaînes>: that panel open, or the channel list.
                if let name = UserDefaults.standard.string(forKey: "debug.panel") {
                    UserDefaults.standard.removeObject(forKey: "debug.panel")
                    Task {
                        try? await Task.sleep(for: .seconds(1.5))
                        if name == "Chaînes" { sheet = .channels } else { barPanel = BarPanel(rawValue: name); showControls(autoHide: false) }
                    }
                }
                #endif
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
                .onTapGesture { tap() }
                .gesture(drag(width: geo.size.width))
        }
        .ignoresSafeArea()
    }

    private func tap() {
        if barPanel != nil { barPanel = nil; showControls(); return }
        if controlsVisible { hideControls() } else { showControls() }
    }

    /// One drag, its axis decided by the dominant direction.
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
                let vertical = abs(dy) > abs(dx)
                if let t = scrubTime {
                    player.seek(to: t)
                } else if player.isLive, !isPortrait, !vertical, dx > 60 {
                    sheet = .channels
                } else if isPortrait, vertical, dy < -60 {
                    if player.isLive { sheet = .channels } else { barPanel = firstPanel }
                } else if isPortrait, vertical, dy > 100 {
                    exit()
                    return
                }
                scrubTime = nil
                showControls(autoHide: barPanel == nil)
            }
    }

    private var firstPanel: BarPanel { player.context?.content.kind == .episode ? .episodes : .infos }

    var controls: some View {
        PlayerControls(scrubTime: scrubTime, isPortrait: isPortrait, panel: $barPanel, onExit: { exit() }, onActivity: { showControls(autoHide: barPanel == nil) })
    }
}
#endif
