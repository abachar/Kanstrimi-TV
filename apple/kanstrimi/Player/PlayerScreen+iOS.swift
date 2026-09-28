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

    var controls: some View { PlayerControlsIOS(scrubTime: scrubTime, onExit: { exit() }, onSheet: { sheet = $0 }) }
}

/// The touch controls over the video: top bar, transport, progress and the live shortcuts.
struct PlayerControlsIOS: View {
    @Environment(AppEnvironment.self) private var env
    let scrubTime: TimeInterval?
    let onExit: () -> Void
    let onSheet: (PlayerScreen.Sheet) -> Void
    private var player: PlayerService { env.player }

    var body: some View {
        ZStack {
            LinearGradient(colors: [.black.opacity(0.6), .clear, .clear, .black.opacity(0.7)], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
                .allowsHitTesting(false)
            VStack {
                topBar
                Spacer()
                // Live keeps the middle for its banner: its transport sits in the bottom bar.
                if !player.isLive { transport }
                Spacer()
                if player.isLive { liveBar } else { progress }
            }
            .playerChromeInsets()
        }
        .buttonStyle(.plain)
        .foregroundStyle(.white)
    }

    private var topBar: some View {
        HStack(spacing: 18) {
            control("xmark", label: "Fermer", action: onExit)
            // Live has its banner with the channel and the programme.
            if !player.isLive {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.headline).lineLimit(1)
                    if let v = player.version { Text(v.longLabel).font(.caption).foregroundStyle(Theme.secondary) }
                }
            }
            Spacer()
            if player.isPictureInPictureAvailable {
                control("pip.enter", label: "Image dans l'image") { player.startPictureInPicture() }
            }
            control("ellipsis.circle", label: "Infos, versions, audio et sous-titres") { onSheet(.panel) }
        }
    }

    private var transport: some View {
        HStack(spacing: 56) {
            if player.isLive {
                control("chevron.up", size: 30, label: "Chaîne précédente") { player.zap(offset: -1) }
            } else {
                control("gobackward.10", size: 30, label: "Reculer de 10 secondes") { player.seek(by: -10) }
            }
            control(player.phase == .playing ? "pause.fill" : "play.fill", size: 44, label: player.phase == .playing ? "Pause" : "Lecture") {
                player.togglePlayPause()
            }
            if player.isLive {
                control("chevron.down", size: 30, label: "Chaîne suivante") { player.zap(offset: 1) }
            } else {
                control("goforward.10", size: 30, label: "Avancer de 10 secondes") { player.seek(by: 10) }
            }
        }
    }

    private var progress: some View {
        VStack(spacing: 8) {
            GeometryReader { geo in
                let fraction = player.duration > 0 ? (scrubTime ?? player.time) / player.duration : 0
                ZStack(alignment: .leading) {
                    Capsule().fill(.white.opacity(0.28)).frame(height: 6)
                    Capsule().fill(.white).frame(width: max(0, geo.size.width * fraction), height: 6)
                    Circle().fill(.white).frame(width: 14, height: 14).offset(x: max(0, geo.size.width * fraction - 7))
                }
                .frame(height: 14)
                .contentShape(Rectangle())
                .gesture(DragGesture(minimumDistance: 0).onEnded { value in
                    guard player.duration > 0 else { return }
                    player.seek(to: Double(value.location.x / geo.size.width) * player.duration)
                })
            }
            .frame(height: 14)
            HStack {
                Text(Format.clock(scrubTime ?? player.time)).monospacedDigit()
                Spacer()
                if player.context?.next != nil {
                    Button { player.playNextNow() } label: { Label("Épisode suivant", systemImage: "forward.end") }
                        .padding(.horizontal, 12).padding(.vertical, 6)
                        .background(.white.opacity(0.14), in: Capsule())
                }
                Spacer()
                Text("−\(Format.clock(player.remaining))").monospacedDigit()
            }
            .font(.footnote).foregroundStyle(Theme.secondary)
        }
    }

    private var liveBar: some View {
        HStack(spacing: 16) {
            control("chevron.up", label: "Chaîne précédente") { player.zap(offset: -1) }
            control(player.phase == .playing ? "pause.fill" : "play.fill", label: player.phase == .playing ? "Pause" : "Lecture") {
                player.togglePlayPause()
            }
            control("chevron.down", label: "Chaîne suivante") { player.zap(offset: 1) }
            Spacer()
            Group {
                Button { onSheet(.channels) } label: { Label("Chaînes", systemImage: "list.bullet") }
                Button { onSheet(.recents) } label: { Label("Récentes", systemImage: "clock") }
            }
            .font(.footnote.weight(.semibold))
            .buttonStyle(.bordered)
        }
    }

    private var title: String {
        guard let c = player.context?.content else { return "" }
        if let ep = c.episode, let s = c.subtitle { return "\(s) · \(ep.shortCode) · \(c.title)" }
        return c.title
    }

    private func control(_ symbol: String, size: CGFloat = 20, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: size, weight: .semibold))
                .frame(width: size + 24, height: size + 24)
                .background(.white.opacity(0.14), in: Circle())
        }
        .accessibilityLabel(label)
    }
}
#endif
