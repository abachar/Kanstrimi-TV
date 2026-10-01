#if os(tvOS)
import SwiftUI

/// tvOS: the one bar over the video, for a film, an episode or a channel. A press shows it a few seconds;
/// ▼ hands the focus to its buttons. On top the title and the progress (the programme's in live); below,
/// on the left the text buttons that open a panel above the bar, on the right the icons whose menu picks
/// a version, an audio track or the subtitles.
struct PlayerBar: View {
    enum Panel: String, Hashable { case programme = "Programme", recents = "Récentes", episodes = "Épisodes", infos = "Infos" }
    private enum Focus: Hashable { case panel(Panel), versions, audio, subtitles }

    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics
    /// The buttons hold the focus (after ▼); otherwise the bar only shows and the remote drives the video.
    let interactive: Bool
    /// Any move inside the bar: the inactivity countdown starts again.
    let onActivity: () -> Void
    /// ▲ from the buttons with no panel open, or Back: the focus goes back to the video.
    let onLeave: (_ hide: Bool) -> Void
    /// Previews: the panel open from the start.
    var initialPanel: Panel? = nil
    @State private var panel: Panel?
    @FocusState private var focus: Focus?
    private var player: PlayerService { env.player }

    private var panels: [Panel] {
        if player.isLive { return [.programme, .recents, .infos] }
        if player.context?.content.kind == .episode { return [.episodes, .infos] }
        return [.infos]
    }

    var body: some View {
        let open = interactive ? panel : nil
        ZStack {
            // At the bottom for the title and the progress; with a panel open, a veil behind the
            // buttons and the detail, which take the place of the title and the progress.
            LinearGradient(stops: open != nil
                           ? [.init(color: .clear, location: 0.3), .init(color: .black.opacity(0.85), location: 0.48)]
                           : [.init(color: .clear, location: 0.4), .init(color: .black.opacity(0.85), location: 1)],
                           startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
                .allowsHitTesting(false)
            if !player.isLive, player.phase == .paused, open == nil {
                Image(systemName: "play.fill").font(.system(size: 64)).foregroundStyle(.white)
                    .padding(36).background(Circle().fill(.white.opacity(0.18)))
            }
            VStack(alignment: .leading, spacing: 28) {
                Spacer(minLength: 0)
                if open == nil {
                    header
                    progress
                }
                // One place for the buttons, panel open or not: rebuilt, they would lose the focus to the first one.
                buttons
                if let open {
                    panelContent(open)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .transition(.opacity)
                }
            }
            .playerChromeInsets()
        }
        .animation(.easeInOut(duration: 0.2), value: panel)
        .animation(.easeInOut(duration: 0.2), value: interactive)
        .onChange(of: interactive) { _, now in
            if now { focus = .panel(panels[0]) } else { panel = nil }
        }
        .onAppear {
            panel = initialPanel
            if interactive { focus = .panel(initialPanel ?? panels[0]) }
        }
        .onChange(of: focus) { _, _ in onActivity() }
        // Innermost: Back closes the open panel first, then gives the video back.
        .onExitCommand {
            if let open = panel { panel = nil; focus = .panel(open) } else { onLeave(true) }
        }
    }

    // MARK: - Header and progress

    @ViewBuilder private var header: some View {
        if player.isLive {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 14) {
                    Text("EN DIRECT").font(.caption.weight(.bold)).tracking(1.5)
                        .padding(.horizontal, 8).padding(.vertical, 3).background(Theme.live, in: RoundedRectangle(cornerRadius: 5))
                    Text(player.channel?.name ?? "").font(.title3.weight(.bold))
                }
                if let now = player.epg.now { Text(now.title).font(.headline).foregroundStyle(Theme.secondary) }
            }
        } else if let c = player.context?.content {
            VStack(alignment: .leading, spacing: 6) {
                if let ep = c.episode, let s = c.subtitle {
                    Text("\(s) · \(ep.shortCode)").font(.headline).foregroundStyle(Theme.secondary)
                }
                Text(c.title).font(.title3.weight(.bold))
            }
        }
    }

    @ViewBuilder private var progress: some View {
        if player.isLive {
            let now = player.epg.now
            VStack(spacing: 12) {
                // Without a guide the bar is full: a live is always at its end.
                ProgressBar(fraction: now?.fraction() ?? 1, height: 8)
                HStack {
                    if let now {
                        Text(Format.hour(now.start))
                        Spacer()
                        Text(player.epg.next.map { "Ensuite : \($0.title) · \(Format.hour($0.start))" } ?? Format.hour(now.end))
                    } else {
                        Text("Programme inconnu")
                        Spacer()
                    }
                }
                .font(.callout.monospacedDigit()).foregroundStyle(Theme.secondary)
            }
        } else {
            VStack(spacing: 12) {
                GeometryReader { geo in
                    let x = geo.size.width * player.fraction
                    ProgressBar(fraction: player.fraction, height: 8)
                        // "▶▶ ×30  1:02:14" above the playhead while a direction is held.
                        .overlay(alignment: .bottomLeading) {
                            if player.scanRate != 0 {
                                Text(scanLabel + Format.clock(player.shownTime))
                                    .font(.callout.weight(.semibold))
                                    .padding(.horizontal, 12).padding(.vertical, 6)
                                    .background(.white, in: Capsule()).foregroundStyle(.black)
                                    .offset(x: min(max(0, x - 40), geo.size.width - 90), y: -16)
                            }
                        }
                }
                .frame(height: 8)
                HStack {
                    Text(Format.clock(player.shownTime)).foregroundStyle(Theme.text)
                    Spacer()
                    Text("−\(Format.clock(player.remaining)) · fin à \(Format.hour(player.endDate))")
                }
                .font(.callout.monospacedDigit()).foregroundStyle(Theme.secondary)
            }
        }
    }

    private var scanLabel: String {
        guard player.scanRate != 0 else { return "" }
        return "\(player.scanRate > 0 ? "▶▶" : "◀◀") ×\(Int(abs(player.scanRate)))  "
    }

    // MARK: - Buttons

    private var buttons: some View {
        HStack(spacing: 16) {
            ForEach(panels, id: \.self) { p in
                Button { panel = panel == p ? nil : p } label: { Text(p.rawValue) }
                    .buttonStyle(BarButtonStyle(selected: panel == p && interactive))
                    .focused($focus, equals: .panel(p))
            }
            Spacer()
            // Each menu only when it offers a choice; the tracks are known once the player has read the stream.
            if (player.context?.versions.count ?? 0) > 1 { versionsMenu }
            if player.audioTracks.count > 1 { audioMenu }
            if !player.textTracks.isEmpty { subtitlesMenu }
        }
        // Not reachable while the bar only shows: the remote keeps driving the video.
        .disabled(!interactive)
        // ▲ gives the video back; with a panel open the detail is below (▼), nothing is above.
        .onMoveCommand { direction in
            if direction == .up, panel == nil { onLeave(false) }
        }
    }

    private var versionsMenu: some View {
        let versions = player.context?.versions ?? []
        let languages = versions.map(\.language).reduce(into: [Language]()) { if !$0.contains($1) { $0.append($1) } }
        return Menu {
            ForEach(languages, id: \.self) { language in
                Section(language.label) {
                    ForEach(versions.filter { $0.language == language }) { v in
                        Button { player.switchVersion(v) } label: {
                            if v.id == player.version?.id { Label(v.qualityLabel, systemImage: "checkmark") } else { Text(v.qualityLabel) }
                        }
                    }
                }
            }
        } label: {
            Image(systemName: "rectangle.stack.badge.play").accessibilityLabel("Versions")
        }
        .menuStyle(.button)
        .buttonStyle(BarButtonStyle(round: true))
        .focused($focus, equals: .versions)
    }

    private var audioMenu: some View {
        Menu {
            if player.audioTracks.isEmpty { Text("Pistes audio connues au démarrage de la lecture") }
            ForEach(player.audioTracks) { t in
                Button { player.select(audio: t) } label: { trackLabel(t) }
            }
        } label: {
            Image(systemName: "waveform").accessibilityLabel("Audio")
        }
        .menuStyle(.button)
        .buttonStyle(BarButtonStyle(round: true))
        .focused($focus, equals: .audio)
    }

    private var subtitlesMenu: some View {
        Menu {
            Button { player.select(text: nil) } label: {
                if player.textTracks.contains(where: \.isSelected) { Text("Désactivés") } else { Label("Désactivés", systemImage: "checkmark") }
            }
            ForEach(player.textTracks) { t in
                Button { player.select(text: t) } label: { trackLabel(t) }
            }
        } label: {
            Image(systemName: "captions.bubble").accessibilityLabel("Sous-titres")
        }
        .menuStyle(.button)
        .buttonStyle(BarButtonStyle(round: true))
        .focused($focus, equals: .subtitles)
    }

    @ViewBuilder private func trackLabel(_ t: PlayerService.Track) -> some View {
        let name = t.name + (t.language.map { " · \($0)" } ?? "")
        if t.isSelected { Label(name, systemImage: "checkmark") } else { Text(name) }
    }

    // MARK: - Panels

    @ViewBuilder private func panelContent(_ p: Panel) -> some View {
        switch p {
        case .programme: ProgrammeStrip(onActivity: onActivity)
        case .recents: RecentChannelsStrip(onActivity: onActivity) { onLeave(true) }
        case .episodes: SeasonEpisodesStrip(onActivity: onActivity) { onLeave(true) }
        case .infos: PlayerInfos()
        }
    }
}

/// A text button or a round icon of the bar: white on the video, dark on white while focused.
private struct BarButtonStyle: ButtonStyle {
    var round = false
    var selected = false

    func makeBody(configuration: Configuration) -> some View { Styled(configuration: configuration, round: round, selected: selected) }

    private struct Styled: View {
        let configuration: Configuration
        let round: Bool
        let selected: Bool
        @Environment(\.isFocused) private var isFocused

        var body: some View {
            configuration.label
                .font(round ? .body.weight(.medium) : .callout.weight(.semibold))
                .foregroundStyle(isFocused ? Color.black : Theme.text)
                .padding(.horizontal, round ? 0 : 28)
                .frame(width: round ? 72 : nil, height: 72)
                .background(
                    Capsule().fill(isFocused ? Color.white : Color.white.opacity(selected ? 0.3 : 0.14))
                )
                .scaleEffect(isFocused ? (configuration.isPressed ? 1.02 : 1.1) : 1)
                .shadow(color: .black.opacity(isFocused ? 0.35 : 0), radius: 12, y: 6)
                .animation(.easeOut(duration: 0.15), value: isFocused)
                .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
        }
    }
}

#endif
