#if os(iOS) || os(macOS)
import SwiftUI

/// Shared player controls for touch (iOS) and mouse (macOS) interfaces.
struct PlayerControls: View {
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
            if !player.isLive {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.headline).lineLimit(1)
                    if let v = player.version { Text(v.longLabel).font(.caption).foregroundStyle(Theme.secondary) }
                }
            }
            Spacer()
            
            #if os(iOS)
            if player.isPictureInPictureAvailable {
                control("pip.enter", label: "Image dans l'image") { player.startPictureInPicture() }
            }
            #elseif os(macOS)
            control("arrow.up.left.and.arrow.down.right", label: "Plein écran") {
                if let window = NSApp.keyWindow {
                    window.toggleFullScreen(nil)
                }
            }
            #endif
            
            control("ellipsis.circle", label: "Infos, versions, audio et sous-titres") { onSheet(.panel) }
        }
    }

    private var transport: some View {
        HStack(spacing: 56) {
            skip(forward: false)
            control(player.phase == .playing ? "pause.fill" : "play.fill", size: 44, label: player.phase == .playing ? "Pause" : "Lecture") {
                player.togglePlayPause()
            }
            skip(forward: true)
        }
    }

    private var progress: some View {
        VStack(spacing: 8) {
            GeometryReader { geo in
                let fraction = player.duration > 0 ? (scrubTime ?? player.shownTime) / player.duration : 0
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
                Text(scanLabel + Format.clock(scrubTime ?? player.shownTime)).monospacedDigit()
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
            control("chevron.down", label: "Chaîne suivante") { player.zap(offset: 1) }
            Spacer()
            Group {
                Button { onSheet(.channels) } label: { Label("Chaînes", systemImage: "list.bullet") }
                Button { onSheet(.recents) } label: { Label("Récentes", systemImage: "clock") }
                Button { onSheet(.panel) } label: { Label("Programme", systemImage: "list.bullet.rectangle") }
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

    /// ±10 s on a tap; held, fast forward or rewind until released.
    private func skip(forward: Bool) -> some View {
        Image(systemName: forward ? "goforward.10" : "gobackward.10")
            .font(.system(size: 30, weight: .semibold))
            .frame(width: 54, height: 54)
            .background(.white.opacity(0.14), in: Circle())
            .contentShape(Circle())
            .onTapGesture { player.seek(by: forward ? 10 : -10) }
            .onLongPressGesture(minimumDuration: 0.4) {
                player.startScan(forward: forward)
            } onPressingChanged: { pressing in
                if !pressing { player.stopScan() }
            }
            .accessibilityLabel(forward ? "Avancer de 10 secondes, maintenir pour l'avance rapide" : "Reculer de 10 secondes, maintenir pour le retour rapide")
            .accessibilityAddTraits(.isButton)
    }

    private var scanLabel: String {
        guard player.scanRate != 0 else { return "" }
        return "\(player.scanRate > 0 ? "▶▶" : "◀◀") ×\(Int(abs(player.scanRate)))  "
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
