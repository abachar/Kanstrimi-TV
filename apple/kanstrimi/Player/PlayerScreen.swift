import SwiftUI

/// The one player screen, parameterised by the content kind. Full screen over the tabs.
/// The video, the overlays and the panels are shared; how the user drives them is not:
/// `PlayerScreen+tvOS.swift` listens to the Siri Remote, `PlayerScreen+iOS.swift` to touches.
/// Each provides `host` (the wrapper around `content`) and `surface` (the invisible layer
/// that receives the input when no panel is open).
struct PlayerScreen: View {
    enum Sheet: Equatable { case none, channels }
    /// iPhone: what the bar of the touch controls opens above its buttons, like the tvOS bar's panels.
    enum BarPanel: String, Hashable { case programme = "Programme", recents = "Récentes", episodes = "Épisodes", related = "Similaires", cast = "Distribution", infos = "Infos" }

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
    /// iOS: the panel open in the touch controls, and whether the phone is held upright.
    @State var barPanel: BarPanel?
    @State var isPortrait = false
    /// A panel closes by itself after this long without any move inside it.
    static let sheetTimeout: Duration = .seconds(10)

    var player: PlayerService { env.player }

    var body: some View {
        host
            .playerIgnoresSafeArea()
            .background(.black)
            // Back (Menu on older remotes) closes the open panel first, then quits the player.
            // Attached outside the nested hosting controller so the outer SwiftUI hierarchy sees it;
            // the cover itself has interactive dismissal disabled.
            .onBackCommand { exit() }
    }

    var content: some View {
        ZStack {
            VideoSurface(view: player.videoView).ignoresSafeArea()
            #if DEBUG
            if player.debugFrame {
                // iPhone: a 16:9 picture, fitted like the video, centred with black around when upright.
                if Platform.isTV { PreviewFrame().ignoresSafeArea() } else { Color.clear.ignoresSafeArea().overlay { PreviewFrame().aspectRatio(16 / 9, contentMode: .fit) } }
            }
            #endif
            // Edge to edge like the video: a bitmap subtitle is placed against the picture's frame.
            SubtitleOverlay(engine: player.engine).ignoresSafeArea()

            // The surface steps aside while the failure dialog is up, otherwise it keeps the
            // focus and every press lands on it instead of on the dialog's buttons.
            // Same while the next-episode card asks for the focus.
            // Same while the tvOS bar's buttons hold it.
            if sheet == .none, !barFocused, player.failure == nil, player.nextCountdown == nil {
                surface
            }

            if controlsVisible || barFocused, sheet == .none, player.failure == nil, !player.isChangingTitle {
                controls.transition(.opacity)
            }

            // Above the controls: on iPhone it is a button to tap, whether they show or not.
            if let offer = player.skipOffer, sheet == .none, barPanel == nil, !barFocused, player.failure == nil,
               player.nextCountdown == nil, !player.isChangingTitle {
                SkipButton(label: offer.label, barShown: controlsVisible) { skip() }.transition(.opacity)
            }

            if sheet == .channels {
                ChannelListOverlay(onClose: { closeSheet() }, onActivity: { armSheetTimer() },
                                   touch: !Platform.isTV, fromBottom: isPortrait)
            }

            LoadingBadge()

            if let toast = player.toast { ToastView(toast: toast) }
            // The app's own notice is drawn under this cover: shown here while the player is up.
            else if let notice = env.notice { ToastView(text: notice) }
            // The second of black between a title and what follows it.
            if player.isChangingTitle { Color.black.ignoresSafeArea().transition(.opacity) }
            if player.nextCountdown != nil { NextEpisodeCard(barShown: (controlsVisible || barFocused) && sheet == .none) }
            if player.failure != nil { StreamFailureDialog() }
        }
        .animation(.easeInOut(duration: 0.25), value: controlsVisible)
        .animation(.easeInOut(duration: 0.25), value: player.isChangingTitle)
        .animation(.easeInOut(duration: 0.25), value: player.skipOffer)
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

    /// tvOS: the click on the video. While « Passer le récap » or « Passer l'intro » shows, drawn as the focused
    /// button, it is its click.
    func select() {
        if player.skipOffer != nil { return skip() }
        if controlsVisible { player.togglePlayPause() }
        showControls()
    }

    func skip() {
        player.skip()
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

    /// iOS: a tap on the video hides the controls at once.
    func hideControls() {
        hideTask?.cancel()
        controlsVisible = false
    }

    func showControls(autoHide: Bool = true) {
        controlsVisible = true
        if autoHide, player.phase == .playing { scheduleHide() } else { hideTask?.cancel() }
    }

    private func scheduleHide() {
        hideTask?.cancel()
        hideTask = Task {
            try? await Task.sleep(for: .seconds(4))
            if !Task.isCancelled, player.phase == .playing, barPanel == nil { controlsVisible = false }
        }
    }
}

// MARK: - Loading badge

/// Its own zone at the top right: opening, then buffering with its percentage.
struct LoadingBadge: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics
    private var player: PlayerService { env.player }
    private var isLoading: Bool { player.phase == .opening || player.phase == .buffering }
    private var caption: String {
        player.phase == .opening ? "Ouverture du flux…" : "Chargement · \(Int(player.bufferingProgress)) %"
    }

    var body: some View {
        if metrics.compact { centred } else { corner }
    }

    /// iPhone: in the middle of the video, where the play button stands otherwise (the corner holds buttons).
    private var centred: some View {
        VStack(spacing: 12) {
            if isLoading {
                ProgressView().controlSize(.large).tint(.white)
                Text(caption)
                    .font(.footnote.weight(.semibold)).foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.6), radius: 4)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .animation(.easeInOut(duration: 0.2), value: player.phase)
        .allowsHitTesting(false)
    }

    private var corner: some View {
        VStack {
            HStack {
                Spacer()
                if isLoading {
                    HStack(spacing: 12) {
                        ProgressView().controlSize(.small)
                        Text(caption)
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
    let text: String
    var detail: String? = nil
    var icon = "arrow.triangle.2.circlepath"

    init(toast: PlayerService.Toast) { text = toast.text; detail = toast.detail }
    init(text: String) { self.text = text; icon = "exclamationmark.triangle" }
    init(text: String, detail: String? = nil, icon: String) { self.text = text; self.detail = detail; self.icon = icon }

    var body: some View {
        VStack {
            Spacer()
            HStack(spacing: 16) {
                Image(systemName: icon).font(.title2).foregroundStyle(Theme.accent)
                VStack(alignment: .leading, spacing: 4) {
                    Text(text).font(.headline)
                    if let d = detail { Text(d).font(.callout).foregroundStyle(Theme.secondary) }
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
