#if os(tvOS)
import SwiftUI

/// tvOS: the one bar over the video, for a film, an episode or a channel. A press shows it a few seconds;
/// ▼ hands the focus to its buttons. On top the title and the progress (the programme's in live); below,
/// on the left the text buttons that open a panel above the bar, on the right the icons whose menu picks
/// a version, an audio track or the subtitles.
struct PlayerBar: View {
    typealias Panel = PlayerScreen.BarPanel
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
                    .padding(36).background(Circle().fill(Theme.surfaceOverlay))
            }
            VStack(alignment: .leading, spacing: 28) {
                Spacer(minLength: 0)
                if open == nil {
                    PlayerHeader()
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
            if now { focus = .panel(player.panels[0]) } else { panel = nil }
        }
        .onAppear {
            panel = initialPanel
            if interactive { focus = .panel(initialPanel ?? player.panels[0]) }
        }
        .onChange(of: focus) { _, _ in onActivity() }
        // Innermost: Back closes the open panel first, then gives the video back.
        .onExitCommand {
            if let open = panel { panel = nil; focus = .panel(open) } else { onLeave(true) }
        }
    }

    // MARK: - Header and progress

    @ViewBuilder private var progress: some View {
        if player.isLive {
            PlayerLiveProgress()
        } else {
            VStack(spacing: 12) {
                GeometryReader { geo in
                    let x = geo.size.width * player.fraction
                    ProgressBar(fraction: player.fraction, height: 8)
                        // "▶▶ ×30  1:02:14" above the playhead while a direction is held.
                        .overlay(alignment: .bottomLeading) {
                            if player.scanRate != 0 {
                                Text(player.scanLabel + Format.clock(player.shownTime))
                                    .font(.callout.weight(.semibold))
                                    .padding(.horizontal, 12).padding(.vertical, 6)
                                    .background(.white, in: Capsule()).foregroundStyle(.black)
                                    .offset(x: min(max(0, x - 40), geo.size.width - 90), y: -16)
                            }
                        }
                }
                .frame(height: 8)
                PlayerTimeLine(elapsed: Format.clock(player.shownTime))
            }
        }
    }

    // MARK: - Buttons

    private var buttons: some View {
        HStack(spacing: 16) {
            ForEach(player.panels, id: \.self) { p in
                Button { panel = panel == p ? nil : p } label: { Text(p.rawValue) }
                    .buttonStyle(BarButtonStyle(selected: panel == p && interactive))
                    .focused($focus, equals: .panel(p))
            }
            Spacer()
            // Each menu only when it offers a choice; the tracks are known once the player has read the stream.
            if player.offersVersions { versionsMenu }
            if player.offersAudio { audioMenu }
            if player.offersSubtitles { subtitlesMenu }
        }
        // Not reachable while the bar only shows: the remote keeps driving the video.
        .disabled(!interactive)
        // ▲ gives the video back; with a panel open the detail is below (▼), nothing is above.
        .onMoveCommand { direction in
            if direction == .up, panel == nil { onLeave(false) }
        }
    }

    private var versionsMenu: some View {
        Menu {
            VersionMenuItems()
        } label: {
            Image(systemName: "rectangle.stack.badge.play").accessibilityLabel("Versions")
        }
        .menuStyle(.button)
        .buttonStyle(BarButtonStyle(round: true))
        .focused($focus, equals: .versions)
    }

    private var audioMenu: some View {
        Menu {
            AudioMenuItems()
        } label: {
            Image(systemName: "waveform").accessibilityLabel("Audio")
        }
        .menuStyle(.button)
        .buttonStyle(BarButtonStyle(round: true))
        .focused($focus, equals: .audio)
    }

    private var subtitlesMenu: some View {
        Menu {
            SubtitleMenuItems()
        } label: {
            Image(systemName: "captions.bubble").accessibilityLabel("Sous-titres")
        }
        .menuStyle(.button)
        .buttonStyle(BarButtonStyle(round: true))
        .focused($focus, equals: .subtitles)
    }

    // MARK: - Panels

    @ViewBuilder private func panelContent(_ p: Panel) -> some View {
        switch p {
        case .programme: ProgrammeStrip(onActivity: onActivity)
        case .recents: RecentChannelsStrip(onActivity: onActivity) { onLeave(true) }
        case .episodes: SeasonEpisodesStrip(onActivity: onActivity) { onLeave(true) }
        case .related: RelatedStrip(onActivity: onActivity) { onLeave(true) }
        case .cast: PlayerCastStrip(onActivity: onActivity)
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
                    Capsule().fill(isFocused ? Color.white : (selected ? Theme.surfaceStrong : Theme.surfaceChip))
                )
                .scaleEffect(isFocused ? (configuration.isPressed ? 1.02 : 1.1) : 1)
                .shadow(color: .black.opacity(isFocused ? 0.35 : 0), radius: 12, y: 6)
                .animation(.easeOut(duration: 0.15), value: isFocused)
                .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
        }
    }
}

#endif
