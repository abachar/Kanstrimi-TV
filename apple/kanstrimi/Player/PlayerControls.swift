#if os(iOS)
import SwiftUI

/// The touch controls (iOS), laid out like the tvOS bar. At the top: close, Picture-in-Picture and the
/// rotation. In the middle (films, episodes): −10 s, play/pause, +10 s. At the bottom: the title, the
/// progress (the programme's in live), then on the left the buttons that open a panel above them
/// (live: Programme · Récentes · Infos; episode: Épisodes · Infos; film: Infos) and on the right
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

    private var panels: [Panel] {
        if player.isLive { return [.programme, .recents, .infos] }
        if player.context?.content.kind == .episode { return [.episodes, .infos] }
        return [.infos]
    }

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
                    header
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
                            .background(.white.opacity(0.16), in: Circle())
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
            .background(.white.opacity(0.12), in: Circle())
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

    @ViewBuilder private var header: some View {
        if player.isLive {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 10) {
                    Text("EN DIRECT").font(.caption2.weight(.bold)).tracking(1.2)
                        .padding(.horizontal, 6).padding(.vertical, 2).background(Theme.live, in: RoundedRectangle(cornerRadius: 4))
                    Text(player.channel?.name ?? "").font(.headline).lineLimit(1)
                }
                if let now = player.epg.now { Text(now.title).font(.subheadline).foregroundStyle(Theme.secondary).lineLimit(1) }
            }
        } else if let c = player.context?.content {
            VStack(alignment: .leading, spacing: 2) {
                if let ep = c.episode, let s = c.subtitle {
                    Text("\(s) · \(ep.shortCode)").font(.subheadline).foregroundStyle(Theme.secondary).lineLimit(1)
                }
                Text(c.title).font(.headline).lineLimit(1)
            }
        }
    }

    @ViewBuilder private var progress: some View {
        if player.isLive {
            let now = player.epg.now
            VStack(spacing: 6) {
                // Without a guide the bar is full: a live is always at its end.
                ProgressBar(fraction: now?.fraction() ?? 1, height: 4)
                HStack {
                    if let now {
                        Text(Format.hour(now.start))
                        Spacer()
                        Text(player.epg.next.map { "Ensuite : \($0.title) · \(Format.hour($0.start))" } ?? Format.hour(now.end)).lineLimit(1)
                    } else {
                        Text("Programme inconnu")
                        Spacer()
                    }
                }
                .font(.caption.monospacedDigit()).foregroundStyle(Theme.secondary)
            }
        } else {
            VStack(spacing: 6) {
                GeometryReader { geo in
                    let fraction = player.duration > 0 ? (scrubTime ?? player.shownTime) / player.duration : 0
                    ZStack(alignment: .leading) {
                        Capsule().fill(.white.opacity(0.28)).frame(height: 5)
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
                HStack {
                    Text(scanLabel + Format.clock(scrubTime ?? player.shownTime)).foregroundStyle(Theme.text)
                    Spacer()
                    Text("−\(Format.clock(player.remaining)) · fin à \(Format.hour(player.endDate))")
                }
                .font(.caption.monospacedDigit()).foregroundStyle(Theme.secondary)
            }
        }
    }

    private var scanLabel: String {
        guard player.scanRate != 0 else { return "" }
        return "\(player.scanRate > 0 ? "▶▶" : "◀◀") ×\(Int(abs(player.scanRate)))  "
    }

    /// Panels on the left, menus on the right; upright and short of room, the three menus fold into one.
    private var buttons: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) {
                panelButtons
                Spacer(minLength: 8)
                if hasVersions { versionsMenu }
                if hasAudio { audioMenu }
                if hasSubtitles { subtitlesMenu }
            }
            HStack(spacing: 10) {
                panelButtons
                Spacer(minLength: 8)
                if hasVersions || hasAudio || hasSubtitles {
                    Menu {
                        if hasVersions { Menu { versionItems } label: { Label("Versions", systemImage: "rectangle.stack.badge.play") } }
                        if hasAudio { Menu { audioItems } label: { Label("Audio", systemImage: "waveform") } }
                        if hasSubtitles { Menu { subtitleItems } label: { Label("Sous-titres", systemImage: "captions.bubble") } }
                    } label: {
                        roundLabel("ellipsis")
                    }
                    .accessibilityLabel("Versions, audio et sous-titres")
                }
            }
        }
    }

    // Each menu only when it offers a choice; the tracks are known once VLC has read the stream.
    private var hasVersions: Bool { (player.context?.versions.count ?? 0) > 1 }
    private var hasAudio: Bool { player.audioTracks.count > 1 }
    private var hasSubtitles: Bool { !player.textTracks.isEmpty }

    private var panelButtons: some View {
        ForEach(panels, id: \.self) { p in
            Button { panel = panel == p ? nil : p; onActivity() } label: {
                Text(p.rawValue).font(.footnote.weight(.semibold)).lineLimit(1).fixedSize()
                    .padding(.horizontal, 14).frame(height: 36)
                    .background(Capsule().fill(panel == p ? Color.white : Color.white.opacity(0.16)))
                    .foregroundStyle(panel == p ? Color.black : Theme.text)
            }
            .buttonStyle(.plain)
        }
    }

    private var versionsMenu: some View {
        Menu { versionItems } label: { roundLabel("rectangle.stack.badge.play") }.accessibilityLabel("Versions")
    }
    private var audioMenu: some View {
        Menu { audioItems } label: { roundLabel("waveform") }.accessibilityLabel("Audio")
    }
    private var subtitlesMenu: some View {
        Menu { subtitleItems } label: { roundLabel("captions.bubble") }.accessibilityLabel("Sous-titres")
    }

    @ViewBuilder private var versionItems: some View {
        let versions = player.context?.versions ?? []
        let languages = versions.map(\.language).reduce(into: [Language]()) { if !$0.contains($1) { $0.append($1) } }
        ForEach(languages, id: \.self) { language in
            Section(language.label) {
                ForEach(versions.filter { $0.language == language }) { v in
                    Button { player.switchVersion(v) } label: {
                        if v.id == player.version?.id { Label(v.qualityLabel, systemImage: "checkmark") } else { Text(v.qualityLabel) }
                    }
                }
            }
        }
    }

    @ViewBuilder private var audioItems: some View {
        if player.audioTracks.isEmpty { Text("Pistes audio connues au démarrage de la lecture") }
        ForEach(player.audioTracks) { t in
            Button { player.select(audio: t) } label: { trackLabel(t) }
        }
    }

    @ViewBuilder private var subtitleItems: some View {
        Button { player.select(text: nil) } label: {
            if player.textTracks.contains(where: \.isSelected) { Text("Désactivés") } else { Label("Désactivés", systemImage: "checkmark") }
        }
        ForEach(player.textTracks) { t in
            Button { player.select(text: t) } label: { trackLabel(t) }
        }
    }

    @ViewBuilder private func trackLabel(_ t: PlayerService.Track) -> some View {
        let name = t.name + (t.language.map { " · \($0)" } ?? "")
        if t.isSelected { Label(name, systemImage: "checkmark") } else { Text(name) }
    }

    // MARK: - Panels

    @ViewBuilder private func panelContent(_ p: Panel) -> some View {
        switch p {
        case .programme: ProgrammeStrip(onActivity: onActivity)
        case .recents: RecentChannelsStrip(onActivity: onActivity) { panel = nil }
        case .episodes: SeasonEpisodesStrip(onActivity: onActivity) { panel = nil }
        case .infos: PlayerInfos(logoSize: 64).padding(.bottom, 8)
        }
    }

    // MARK: - Pieces

    private func roundLabel(_ symbol: String) -> some View {
        Image(systemName: symbol)
            .font(.system(size: 17, weight: .semibold))
            .frame(width: 40, height: 40)
            .background(.white.opacity(0.16), in: Circle())
            .contentShape(Circle())
    }

    private func round(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { roundLabel(symbol) }
            .buttonStyle(.plain)
            .accessibilityLabel(label)
    }
}

#endif
