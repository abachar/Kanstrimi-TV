#if os(iOS)
import SwiftUI

/// The touch controls (iOS), laid out like the tvOS bar. At the top: close, Picture-in-Picture and the
/// rotation. In the middle (films, episodes): −10 s, play/pause, +10 s. At the bottom: the title, the
/// progress (the programme's in live), then on the left the buttons that open a panel above them
/// (live: Programme · Récentes · Infos; episode: Épisodes · Similaires · Distribution · Infos; film: Similaires · Distribution · Infos,
/// Similaires and Distribution only when the title has some) and on the right
/// the Versions, Audio and Sous-titres menus. A panel open hides the title and the progress.
struct PlayerControls: View {
    typealias Panel = PlayerScreen.BarPanel

    @Environment(AppEnvironment.self) private var env
    let scrubTime: TimeInterval?
    let isPortrait: Bool
    @Binding var panel: Panel?
    let onExit: () -> Void
    /// Any touch in the controls: they stay up a while longer.
    let onActivity: () -> Void
    private var player: PlayerService { env.player }

    var body: some View {
        ZStack {
            LinearGradient(stops: panel != nil
                           ? [.init(color: .black.opacity(0.5), location: 0), .init(color: .black.opacity(0.35), location: 0.3), .init(color: .black.opacity(0.88), location: 0.55)]
                           : [.init(color: .black.opacity(0.55), location: 0), .init(color: .clear, location: 0.25),
                              .init(color: .clear, location: 0.5), .init(color: .black.opacity(0.8), location: 1)],
                           startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
                .allowsHitTesting(false)
            if !player.isLive, panel == nil { transport }
            VStack(alignment: .leading, spacing: 14) {
                topBar
                Spacer(minLength: 0)
                if let panel {
                    buttons
                    panelContent(panel)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .transition(.opacity)
                } else {
                    PlayerHeader()
                    progress
                    buttons
                }
            }
            .playerChromeInsets()
        }
        .foregroundStyle(.white)
        .animation(.easeInOut(duration: 0.2), value: panel)
        .touchActivity(onActivity)
    }

    // MARK: - Top

    private var topBar: some View {
        HStack(spacing: 14) {
            round("xmark", label: "Fermer", action: onExit)
            Spacer()
            if player.isPictureInPictureAvailable {
                round("pip.enter", label: "Image dans l'image") { player.startPictureInPicture() }
            }
            round(isPortrait ? "arrow.up.left.and.arrow.down.right" : "arrow.down.right.and.arrow.up.left",
                  label: isPortrait ? "Plein écran" : "Quitter le plein écran") {
                OrientationLock.rotate(to: isPortrait ? .landscapeRight : .portrait)
            }
        }
    }

    // MARK: - Middle

    private var transport: some View {
        HStack(spacing: isPortrait ? 44 : 64) {
            skip(forward: false)
            Group {
                if player.phase == .opening || player.phase == .buffering {
                    // The loading indicator (`LoadingBadge`) stands here.
                    Color.clear
                } else {
                    Button { player.togglePlayPause(); onActivity() } label: {
                        Image(systemName: player.phase == .playing ? "pause.fill" : "play.fill")
                            .font(.system(size: 38, weight: .semibold))
                            .frame(width: 76, height: 76)
                            .background(Theme.surfaceRaised, in: Circle())
                            .contentShape(Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(player.phase == .playing ? "Pause" : "Lecture")
                }
            }
            .frame(width: 76, height: 76)
            skip(forward: true)
        }
    }

    /// ±10 s on a tap; held, fast forward or rewind until released.
    private func skip(forward: Bool) -> some View {
        Image(systemName: forward ? "goforward.10" : "gobackward.10")
            .font(.system(size: 26, weight: .semibold))
            .frame(width: 54, height: 54)
            .background(Theme.surfaceButton, in: Circle())
            .contentShape(Circle())
            .onTapGesture { player.seek(by: forward ? 10 : -10); onActivity() }
            .onLongPressGesture(minimumDuration: 0.4) {
                player.startScan(forward: forward)
            } onPressingChanged: { pressing in
                if !pressing { player.stopScan() }
            }
            .accessibilityLabel(forward ? "Avancer de 10 secondes, maintenir pour l'avance rapide" : "Reculer de 10 secondes, maintenir pour le retour rapide")
            .accessibilityAddTraits(.isButton)
    }

    // MARK: - Bottom

    @ViewBuilder private var progress: some View {
        if player.isLive {
            PlayerLiveProgress()
        } else {
            VStack(spacing: 6) {
                GeometryReader { geo in
                    let fraction = player.duration > 0 ? (scrubTime ?? player.shownTime) / player.duration : 0
                    ZStack(alignment: .leading) {
                        Capsule().fill(Theme.track).frame(height: 5)
                        Capsule().fill(.white).frame(width: max(0, geo.size.width * fraction), height: 5)
                        Circle().fill(.white).frame(width: 14, height: 14).offset(x: max(0, geo.size.width * fraction - 7))
                    }
                    .frame(height: 22)
                    .contentShape(Rectangle())
                    .gesture(DragGesture(minimumDistance: 0).onEnded { value in
                        guard player.duration > 0 else { return }
                        player.seek(to: min(max(0, Double(value.location.x / geo.size.width)), 1) * player.duration)
                        onActivity()
                    })
                }
                .frame(height: 22)
                PlayerTimeLine(elapsed: player.scanLabel + Format.clock(scrubTime ?? player.shownTime))
            }
        }
    }

    /// Panels on the left, menus on the right; upright and short of room, the three menus fold into one.
    private var buttons: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) {
                panelButtons
                Spacer(minLength: 8)
                if player.offersVersions { versionsMenu }
                if player.offersAudio { audioMenu }
                if player.offersSubtitles { subtitlesMenu }
            }
            HStack(spacing: 10) {
                // Too many panels for the width: the chips scroll, the menu stays fixed on the right.
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) { panelButtons }
                }
                Spacer(minLength: 8)
                if player.offersVersions || player.offersAudio || player.offersSubtitles {
                    Menu {
                        if player.offersVersions { Menu { VersionMenuItems() } label: { Label("Versions", systemImage: "rectangle.stack.badge.play") } }
                        if player.offersAudio { Menu { AudioMenuItems() } label: { Label("Audio", systemImage: "waveform") } }
                        if player.offersSubtitles { Menu { SubtitleMenuItems() } label: { Label("Sous-titres", systemImage: "captions.bubble") } }
                    } label: {
                        roundLabel("ellipsis")
                    }
                    .accessibilityLabel("Versions, audio et sous-titres")
                }
            }
        }
    }

    private var panelButtons: some View {
        ForEach(player.panels, id: \.self) { p in
            Button { panel = panel == p ? nil : p; onActivity() } label: {
                Text(p.rawValue).font(.footnote.weight(.semibold)).lineLimit(1).fixedSize()
                    .padding(.horizontal, 14).frame(height: 36)
                    .background(Capsule().fill(panel == p ? Color.white : Theme.surfaceRaised))
                    .foregroundStyle(panel == p ? Color.black : Theme.text)
            }
            .buttonStyle(.plain)
        }
    }

    private var versionsMenu: some View {
        Menu { VersionMenuItems() } label: { roundLabel("rectangle.stack.badge.play") }.accessibilityLabel("Versions")
    }
    private var audioMenu: some View {
        Menu { AudioMenuItems() } label: { roundLabel("waveform") }.accessibilityLabel("Audio")
    }
    private var subtitlesMenu: some View {
        Menu { SubtitleMenuItems() } label: { roundLabel("captions.bubble") }.accessibilityLabel("Sous-titres")
    }

    // MARK: - Panels

    @ViewBuilder private func panelContent(_ p: Panel) -> some View {
        switch p {
        case .programme: ProgrammeStrip(onActivity: onActivity)
        case .recents: RecentChannelsStrip(onActivity: onActivity) { panel = nil }
        case .episodes: SeasonEpisodesStrip(onActivity: onActivity) { panel = nil }
        case .related: RelatedStrip(onActivity: onActivity) { panel = nil }
        case .cast: PlayerCastStrip(onActivity: onActivity)
        case .infos: PlayerInfos(logoSize: 64).padding(.bottom, 8)
        }
    }

    // MARK: - Pieces

    private func roundLabel(_ symbol: String) -> some View {
        Image(systemName: symbol)
            .font(.system(size: 17, weight: .semibold))
            .frame(width: 40, height: 40)
            .background(Theme.surfaceRaised, in: Circle())
            .contentShape(Circle())
    }

    private func round(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { roundLabel(symbol) }
            .buttonStyle(.plain)
            .accessibilityLabel(label)
    }
}

#endif
