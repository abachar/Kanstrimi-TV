import SwiftUI

/// The one player screen, parameterised by the content kind. Full screen over the tabs.
/// The video, the overlays and the panels are shared; how the user drives them is not:
/// `PlayerScreen+tvOS.swift` listens to the Siri Remote, `PlayerScreen+iOS.swift` to touches.
/// Each provides `host` (the wrapper around `content`) and `surface` (the invisible layer
/// that receives the input when no panel is open).
struct PlayerScreen: View {
    enum Sheet: Equatable { case none, panel, programme, channels, recents }

    @Environment(AppEnvironment.self) var env
    @State var controlsVisible = true
    @State var sheet: Sheet = .none
    /// tvOS: the bar's buttons hold the focus (after ▼).
    @State var barFocused = false
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
            #if DEBUG
            if player.debugFrame { PreviewFrame().ignoresSafeArea() }
            #endif

            // The surface steps aside while the failure dialog is up, otherwise it keeps the
            // focus and every press lands on it instead of on the dialog's buttons.
            // Same while the next-episode card asks for the focus.
            // Same while the tvOS bar's buttons hold it.
            if sheet == .none, !barFocused, player.failure == nil, player.nextCountdown == nil {
                surface
            }

            // On iOS the touch top bar (close, panel) sits above the banner. tvOS has its bar.
            if player.isLive, !Platform.isTV { LiveBanner(visible: controlsVisible || player.zapBanner).padding(.top, 64) }

            if controlsVisible || barFocused, sheet == .none, player.failure == nil {
                controls.transition(.opacity)
            }

            switch sheet {
            case .panel: PlayerPanel(onClose: { closeSheet() }, onActivity: { armSheetTimer() })
            case .programme: PlayerPanel(opening: .programme, onClose: { closeSheet() }, onActivity: { armSheetTimer() })
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
        .onChange(of: barFocused) { _, focused in
            if focused { armSheetTimer() } else { sheetTimer?.cancel() }
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
        if barFocused { leaveBar(hide: true); return }
        player.stop()
    }

    /// tvOS: ▼ hands the focus to the bar's buttons; it stays up until they let it go.
    func focusBar() {
        hideTask?.cancel()
        controlsVisible = true
        barFocused = true
    }

    /// tvOS: the focus goes back to the video, the bar with it when `hide`, else a few seconds more.
    func leaveBar(hide: Bool) {
        barFocused = false
        surfaceFocused = true
        if hide { hideTask?.cancel(); controlsVisible = false } else { showControls() }
    }

    func closeSheet() {
        sheetTimer?.cancel()
        sheet = .none
        surfaceFocused = true
        showControls()
    }

    /// (Re)starts the inactivity countdown of the open panel, or of the tvOS bar holding the focus.
    func armSheetTimer() {
        sheetTimer?.cancel()
        sheetTimer = Task {
            try? await Task.sleep(for: Self.sheetTimeout)
            guard !Task.isCancelled else { return }
            if sheet != .none { closeSheet() } else if barFocused { leaveBar(hide: true) }
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
