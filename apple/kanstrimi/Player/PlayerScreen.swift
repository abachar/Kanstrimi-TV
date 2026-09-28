import SwiftUI

/// The one player screen, parameterised by the content kind. Full screen over the tabs.
/// The video, the overlays and the panels are shared; how the user drives them is not:
/// `PlayerScreen+tvOS.swift` listens to the Siri Remote, `PlayerScreen+iOS.swift` to touches.
/// Each provides `host` (the wrapper around `content`) and `surface` (the invisible layer
/// that receives the input when no panel is open).
struct PlayerScreen: View {
    enum Sheet: Equatable { case none, panel, channels, recents }

    @Environment(AppEnvironment.self) var env
    @State var controlsVisible = true
    @State var sheet: Sheet = .none
    @State private var hideTask: Task<Void, Never>?
    @State private var sheetTimer: Task<Void, Never>?
    @FocusState var surfaceFocused: Bool
    /// iOS: the time under the finger while scrubbing, shown instead of the current time.
    @State var scrubTime: TimeInterval?
    /// A panel closes by itself after this long without any move inside it.
    static let sheetTimeout: Duration = .seconds(10)

    var player: PlayerService { env.player }

    var body: some View {
        host
            .ignoresSafeArea()
            .background(.black)
            // Back (Menu on older remotes) closes the open panel first, then quits the player.
            // Attached outside the nested hosting controller so the outer SwiftUI hierarchy sees it;
            // the cover itself has interactive dismissal disabled.
            .onBackCommand { exit() }
    }

    var content: some View {
        ZStack {
            VLCVideoView(view: player.videoView).ignoresSafeArea()

            // The surface steps aside while the failure dialog is up, otherwise it keeps the
            // focus and every press lands on it instead of on the dialog's buttons.
            if sheet == .none, player.failure == nil {
                surface
            }

            // On iOS the touch top bar (close, panel) sits above the banner.
            if player.isLive { LiveBanner(visible: controlsVisible || player.zapBanner).padding(.top, Platform.isTV ? 0 : 64) }

            if controlsVisible, sheet == .none, player.failure == nil {
                controls.transition(.opacity)
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

    // MARK: - Shared actions

    func select() {
        if controlsVisible { player.togglePlayPause() }
        showControls()
    }

    func exit() {
        if sheet != .none { closeSheet(); return }
        player.stop()
    }

    func closeSheet() {
        sheetTimer?.cancel()
        sheet = .none
        surfaceFocused = true
        showControls()
    }

    /// (Re)starts the inactivity countdown of the open panel.
    func armSheetTimer() {
        sheetTimer?.cancel()
        sheetTimer = Task {
            try? await Task.sleep(for: Self.sheetTimeout)
            if !Task.isCancelled, sheet != .none { closeSheet() }
        }
    }

    func showControls(autoHide: Bool = true) {
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
    @Environment(\.metrics) private var metrics
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
            .playerChromeInsets()
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
                }
                // An overlay, not a third layer of the stack: the pill must not count in the
                // stack's height, or the 8 pt track grows to the pill's size and spills over the hints.
                .overlay(alignment: .bottomLeading) {
                    Text(Format.clock(player.time))
                        .font(.callout.weight(.semibold))
                        .padding(.horizontal, 12).padding(.vertical, 6)
                        .background(.white, in: Capsule()).foregroundStyle(.black)
                        .offset(x: min(max(0, x - 40), geo.size.width - 90), y: -16)
                }
            }
            .frame(height: 8)
            .padding(.top, 40)
            HStack {
                Text("−\(Format.clock(player.remaining)) · fin à \(Format.hour(player.endDate))")
                Spacer()
                if Platform.isTV {
                    hint("◀ ▶", "±10 s")
                    hint("▼", "Infos · Versions · Audio · Sous-titres")
                    hint("‹", "Retour · quitter")
                }
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
        .playerChromeInsets()
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
