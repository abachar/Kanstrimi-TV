import SwiftUI

/// The one player screen, parameterised by the content kind. Full screen over the tabs.
struct PlayerScreen: View {
    enum Sheet: Equatable { case none, panel, channels, recents }

    @Environment(AppEnvironment.self) private var env
    @State private var controlsVisible = true
    @State private var sheet: Sheet = .none
    @State private var hideTask: Task<Void, Never>?
    @State private var sheetTimer: Task<Void, Never>?
    @FocusState private var surfaceFocused: Bool
    /// A panel closes by itself after this long without any move inside it.
    static let sheetTimeout: Duration = .seconds(10)

    private var player: PlayerService { env.player }

    var body: some View {
        PressCatcher(pressTypes: [.downArrow], onLongPress: { _ in
            if player.isLive, sheet == .none { sheet = .channels }
        }) {
            content.environment(env)
        }
        .ignoresSafeArea()
        .background(.black)
    }

    private var content: some View {
        ZStack {
            VLCVideoView(view: player.videoView).ignoresSafeArea()

            if sheet == .none {
                surface
            }

            if player.isLive { LiveBanner(visible: controlsVisible || player.zapBanner) }

            if controlsVisible, sheet == .none, !player.isLive {
                VODOverlay()
                    .transition(.opacity)
            }

            switch sheet {
            case .panel: PlayerPanel(onClose: { closeSheet() }, onActivity: { armSheetTimer() })
            case .channels: ChannelListOverlay(onClose: { closeSheet() }, onActivity: { armSheetTimer() })
            case .recents: RecentChannelsOverlay(onClose: { closeSheet() }, onActivity: { armSheetTimer() })
            case .none: EmptyView()
            }

            LoadingBadge()

            if let toast = player.toast { ToastView(toast: toast) }
            if player.nextCountdown != nil { NextEpisodeCard() }
            if player.failure != nil { StreamFailureDialog() }
        }
        .animation(.easeInOut(duration: 0.25), value: controlsVisible)
        .animation(.easeInOut(duration: 0.25), value: sheet)
        // Back (Menu on older remotes) closes the open panel first, then quits the player. Handled here so it works
        // whatever element inside the panel has focus.
        .onExitCommand { exit() }
        .onChange(of: sheet) { _, s in
            if s == .none { sheetTimer?.cancel() } else { armSheetTimer() }
        }
        .onChange(of: player.phase) { _, phase in
            if phase == .playing { scheduleHide() } else { showControls(autoHide: false) }
        }
        .onChange(of: player.channel?.id) { _, _ in showControls() }
        .onAppear { showControls() }
        .onDisappear { hideTask?.cancel(); sheetTimer?.cancel() }
    }

    /// Invisible focus surface that receives the remote when nothing else is focused.
    private var surface: some View {
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

    private func select() {
        if controlsVisible { player.togglePlayPause() }
        showControls()
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

    private func exit() {
        if sheet != .none { closeSheet(); return }
        if player.failure != nil { player.stop(); return }
        player.stop()
    }

    private func closeSheet() {
        sheetTimer?.cancel()
        sheet = .none
        surfaceFocused = true
        showControls()
    }

    /// (Re)starts the inactivity countdown of the open panel.
    private func armSheetTimer() {
        sheetTimer?.cancel()
        sheetTimer = Task {
            try? await Task.sleep(for: Self.sheetTimeout)
            if !Task.isCancelled, sheet != .none { closeSheet() }
        }
    }

    private func showControls(autoHide: Bool = true) {
        controlsVisible = true
        if autoHide, player.phase == .playing { scheduleHide() } else { hideTask?.cancel() }
    }

    private func scheduleHide() {
        hideTask?.cancel()
        hideTask = Task {
            try? await Task.sleep(for: .seconds(4))
            if !Task.isCancelled, player.phase == .playing { controlsVisible = false }
        }
    }
}

// MARK: - VOD overlay at rest [15]

struct VODOverlay: View {
    @Environment(AppEnvironment.self) private var env
    private var player: PlayerService { env.player }

    var body: some View {
        ZStack {
            LinearGradient(colors: [.black.opacity(0.55), .clear, .clear, .black.opacity(0.7)], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()

            VStack {
                HStack {
                    statusPill
                    Spacer()
                }
                Spacer()
                if player.phase == .paused {
                    Image(systemName: "play.fill").font(.system(size: 64)).foregroundStyle(.white)
                        .padding(36).background(Circle().fill(.white.opacity(0.18)))
                }
                Spacer()
                bottomBar
            }
            .padding(.horizontal, 90)
            .padding(.vertical, 60)
        }
        .allowsHitTesting(false)
    }

    private var statusPill: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 12) {
                if player.phase == .paused {
                    Text("PAUSE").font(.caption.weight(.bold)).tracking(1.5).foregroundStyle(Theme.accent)
                }
                Text(title).font(.title3.weight(.bold))
            }
            if let v = player.version { Text(v.longLabel).font(.callout).foregroundStyle(Theme.secondary) }
            Text("Audio \(player.selectedAudioLabel) · Sous-titres \(player.selectedTextLabel)")
                .font(.callout).foregroundStyle(Theme.secondary)
        }
        .padding(.horizontal, 24).padding(.vertical, 16)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20))
    }

    private var title: String {
        guard let c = player.context?.content else { return "" }
        if let ep = c.episode, let s = c.subtitle { return "\(s) · \(ep.shortCode) · \(c.title)" }
        return c.title
    }

    private var bottomBar: some View {
        VStack(spacing: 14) {
            GeometryReader { geo in
                let x = geo.size.width * player.fraction
                ZStack(alignment: .leading) {
                    Capsule().fill(.white.opacity(0.28)).frame(height: 8)
                    Capsule().fill(.white).frame(width: max(0, x), height: 8)
                    Text(Format.clock(player.time))
                        .font(.callout.weight(.semibold))
                        .padding(.horizontal, 12).padding(.vertical, 6)
                        .background(.white, in: Capsule()).foregroundStyle(.black)
                        .offset(x: min(max(0, x - 40), geo.size.width - 90), y: -40)
                }
            }
            .frame(height: 8)
            .padding(.top, 40)
            HStack {
                Text("−\(Format.clock(player.remaining)) · fin à \(Format.hour(player.endDate))")
                Spacer()
                hint("◀ ▶", "±10 s")
                hint("▼", "Infos · Versions · Audio · Sous-titres")
            }
            .font(.callout).foregroundStyle(Theme.secondary)
        }
    }

    private func hint(_ key: String, _ text: String) -> some View {
        HStack(spacing: 8) {
            Text(key).font(.callout.weight(.bold)).padding(.horizontal, 8).padding(.vertical, 2)
                .background(RoundedRectangle(cornerRadius: 6).fill(.white.opacity(0.14)))
            Text(text)
        }
        .padding(.leading, 24)
    }
}

// MARK: - Loading badge

/// Its own zone at the top right: opening, then buffering with its percentage.
struct LoadingBadge: View {
    @Environment(AppEnvironment.self) private var env
    private var player: PlayerService { env.player }

    var body: some View {
        VStack {
            HStack {
                Spacer()
                if player.phase == .opening || player.phase == .buffering {
                    HStack(spacing: 12) {
                        ProgressView().controlSize(.small)
                        Text(player.phase == .opening ? "Ouverture du flux…" : "Chargement · \(Int(player.bufferingProgress)) %")
                            .font(.callout.weight(.semibold))
                    }
                    .padding(.horizontal, 20).padding(.vertical, 12)
                    .background(.regularMaterial, in: Capsule())
                    .transition(.opacity)
                }
            }
            Spacer()
        }
        .padding(.horizontal, 90).padding(.vertical, 60)
        .animation(.easeInOut(duration: 0.2), value: player.phase)
        .allowsHitTesting(false)
    }
}

// MARK: - Toast [12]

struct ToastView: View {
    let toast: PlayerService.Toast
    var body: some View {
        VStack {
            Spacer()
            HStack(spacing: 16) {
                Image(systemName: "arrow.triangle.2.circlepath").font(.title2).foregroundStyle(Theme.accent)
                VStack(alignment: .leading, spacing: 4) {
                    Text(toast.text).font(.headline)
                    if let d = toast.detail { Text(d).font(.callout).foregroundStyle(Theme.secondary) }
                }
            }
            .padding(.horizontal, 26).padding(.vertical, 18)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22))
            .padding(.bottom, 140)
        }
        .transition(.move(edge: .bottom).combined(with: .opacity))
        .allowsHitTesting(false)
    }
}
