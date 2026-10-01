import AVFoundation
import AetherEngine
import Combine
import Foundation
import Observation
import OSLog

private let log = Logger(subsystem: "dev.crafters.kanstrimi", category: "player")

/// The one player of the app. Wraps AetherEngine, owns the playback context, the version and
/// source in use, the automatic source switch, the failure dialog and the next-episode countdown.
@Observable
final class PlayerService {
    enum Phase: Equatable {
        case idle, opening, buffering, playing, paused, ended
        case failed
    }

    struct Track: Identifiable, Hashable {
        let id: String
        let name: String
        let language: String?
        let isSelected: Bool
    }

    struct Toast: Equatable {
        let text: String
        let detail: String?
    }

    struct EPGNow: Equatable {
        let now: Programme?
        let next: Programme?
        static let empty = EPGNow(now: nil, next: nil)
    }

    struct Failure: Equatable {
        let attempts: Int
        let sourceLabel: String
        let hadAlternativeSource: Bool
    }

    // MARK: - Public state

    private(set) var context: PlaybackContext?
    private(set) var version: Version?
    private(set) var source: Source?
    private(set) var choiceReason: VersionChooser.Choice.Reason?
    private(set) var phase: Phase = .idle
    private(set) var time: TimeInterval = 0
    private(set) var duration: TimeInterval = 0
    private(set) var bufferingProgress: Float = 0
    private(set) var audioTracks: [Track] = []
    private(set) var textTracks: [Track] = []
    private(set) var toast: Toast?
    private(set) var failure: Failure?
    /// Set when the next-episode card is showing; counts down to 0.
    private(set) var nextCountdown: Int?
    #if DEBUG
    /// Previews and debug states: a fake picture stands in for the video, so the overlays' transparency shows.
    private(set) var debugFrame = false
    #endif
    private(set) var nextContext: PlaybackContext?
    /// Live: the ordered channel list to zap through, and the current one.
    private(set) var channels: [Channel] = []
    private(set) var channel: Channel?
    private(set) var epg: EPGNow = .empty
    /// Live: banner "previous / current / next" after a zap.
    private(set) var zapBanner: Bool = false
    /// Fast forward / rewind while a direction is held: where the seek lands on release, and the
    /// signed rate (seconds of film per second of hold) shown next to the time.
    private(set) var scanTarget: TimeInterval?
    private(set) var scanRate: Double = 0
    var isPresented: Bool { context != nil }
    /// True while playback goes on with the player screen hidden (Picture-in-Picture on iOS).
    var isMinimized = false
    var isLive: Bool { context?.content.kind == .live }

    // MARK: - Dependencies

    private let client: CatalogClient
    private let preferences: Preferences
    private let failedSources: FailedSourcesStore
    private let progressQueue: ProgressQueue
    let engine: AetherEngine
    /// The surface the engine draws into. Kept by the service, because the engine holds its views weakly:
    /// it outlives the player screen, which hides while Picture-in-Picture runs.
    let videoView = AetherPlayerView(frame: .zero)
    let pictureInPicture = PictureInPicture()
    private let nowPlaying = NowPlaying()
    private let capabilities: VersionChooser.Capabilities
    @ObservationIgnored private var cancellables = Set<AnyCancellable>()

    private var startAttempts = 0
    private var startDeadline: Task<Void, Never>?
    /// True once the stream shows images: the start deadline hands over to the freeze watchdog.
    private var isStarted = false
    /// True once the session has been `.playing`: before that, rebuffering and seeking still read as opening.
    private var hasPlayed = false
    /// Last seek: the image stands still while the engine fetches the new position, not a freeze.
    private var lastSeek: Date?
    /// Seeks issued and not yet landed: the clock's ticks would show the old position meanwhile.
    private var pendingSeeks = 0
    private var loadTask: Task<Void, Never>?
    /// Live: restarts asked by the source itself on the chosen channel, and when the last one ran.
    private var liveResets = 0
    private var lastLiveReset: Date?
    private var deferredReset: Task<Void, Never>?
    private var watchdog: Task<Void, Never>?
    private var scanTask: Task<Void, Never>?
    private var progressTicker: Task<Void, Never>?
    private var toastTask: Task<Void, Never>?
    private var countdownTask: Task<Void, Never>?
    private var zapTask: Task<Void, Never>?
    private var nextTriggered = false
    var onExit: (() -> Void)?
    /// Bumped once the final report of a playback has reached the server (or the offline queue):
    /// the screens that show progress (home, sheet) reload on it.
    private(set) var progressRevision = 0
    /// Called after every state, time or seek change: what mirrors playback elsewhere (PiP) listens here.
    var onPlaybackChanged: (() -> Void)?

    static let startTimeout: Duration = .seconds(10)
    static let progressInterval: Duration = .seconds(30)
    static let nextEpisodeLead: TimeInterval = 30
    static let nextEpisodeCountdown = 10
    /// Live: no new picture for this long means the source froze.
    static let freezeTimeout: TimeInterval = 4
    /// Films and episodes: longer, a seek in a remote MKV can hold the image for a few seconds.
    static let vodFreezeTimeout: TimeInterval = 15
    /// Live: at most this many source restarts per chosen channel, at least `liveResetGap` apart.
    static let maxLiveResets = 3
    static let liveResetGap: TimeInterval = 5
    /// Films and episodes: a stop further than this from the end is a cut, not the end of the file.
    static let endMargin: TimeInterval = 60
    /// Fast forward / rewind speeds, one more level every 2 s of hold.
    static let scanRates: [TimeInterval] = [10, 30, 60, 120, 300]

    init(client: CatalogClient, preferences: Preferences, failedSources: FailedSourcesStore, progressQueue: ProgressQueue,
         capabilities: VersionChooser.Capabilities = .current) {
        self.client = client
        self.preferences = preferences
        self.failedSources = failedSources
        self.progressQueue = progressQueue
        self.capabilities = capabilities
        do { self.engine = try AetherEngine() } catch { fatalError("AetherEngine failed to start: \(error)") }
        // The app plays no other sound: give the audio session back when the player stops.
        engine.deactivatesAudioSessionOnStop = true
        engine.bind(view: videoView)
        observeEngine()
    }

    var chooser: VersionChooser {
        VersionChooser(languageOrder: preferences.languageOrder, maxQuality: preferences.maxQuality, capabilities: capabilities,
                       isSourceFailed: { [failedSources] in failedSources.isFailed($0) })
    }

    // MARK: - Entry points

    /// Chooses the version with the engine and starts. Called by every "Lecture".
    func play(_ context: PlaybackContext) {
        let remembered = preferences.rememberVersionPerTitle ? preferences.rememberedVersion(for: context.content.id) : nil
        let series = context.seriesID.flatMap { preferences.seriesChoice(for: $0) }
        guard let choice = chooser.choose(from: context.versions, remembered: remembered, seriesChoice: series) else { return }
        start(context, version: choice.version, source: choice.source, reason: choice.reason, at: context.resumeAt)
    }

    /// Plays an explicit version (picker, panel). Keeps the position when already playing the same content.
    func play(_ context: PlaybackContext, version: Version, source: Source? = nil) {
        let src = source ?? chooser.bestSource(of: version) ?? version.sources.first
        guard let src else { return }
        let samePlayback = self.context?.content.id == context.content.id && phase != .idle
        let at = samePlayback ? time : context.resumeAt
        start(context, version: version, source: src, reason: nil, at: at)
    }

    /// Live: play a channel out of an ordered list.
    func play(channel: Channel, in list: [Channel]) {
        channels = list
        self.channel = channel
        epg = .empty
        liveResets = 0
        let ctx = PlaybackContext(content: PlaybackContent(id: channel.id, kind: .live, title: channel.name, subtitle: nil, episode: nil, backdrop: nil),
                                  versions: channel.versions)
        play(ctx)
        Task { [weak self] in
            guard let self else { return }
            let full = try? await client.channel(id: channel.id)
            if self.channel?.id == channel.id {
                epg = full.map { EPGNow(now: $0.now, next: $0.next) } ?? .empty
                nowPlaying.update()
            }
        }
    }

    func zap(offset: Int) {
        guard isLive, let channel, let idx = channels.firstIndex(of: channel), !channels.isEmpty else { return }
        let next = channels[(idx + offset + channels.count) % channels.count]
        play(channel: next, in: channels)
        zapBanner = true
        zapTask?.cancel()
        zapTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(4))
            if !Task.isCancelled { self?.zapBanner = false }
        }
    }

    var neighbours: (previous: Channel?, next: Channel?) {
        guard let channel, let idx = channels.firstIndex(of: channel), channels.count > 1 else { return (nil, nil) }
        return (channels[(idx - 1 + channels.count) % channels.count], channels[(idx + 1) % channels.count])
    }

    func stop() {
        sendProgress(final: true)
        cancelTimers()
        loadTask?.cancel(); loadTask = nil
        engine.stop()
        context = nil; version = nil; source = nil; channel = nil; channels = []
        phase = .idle; time = 0; duration = 0; isMinimized = false
        failure = nil; toast = nil; nextCountdown = nil; nextContext = nil; nextTriggered = false
        audioTracks = []; textTracks = []
        epg = .empty
        nowPlaying.clear()
    }

    // MARK: - Controls

    /// Live never pauses, like a TV: only a stall or an interruption can stop it, and Play resumes it.
    func togglePlayPause() {
        switch phase {
        case .playing: if !isLive { engine.pause() }
        case .paused: engine.play()
        // `.ended` is terminal for the engine: playing again is a new load from the start.
        case .ended:
            guard let context, let version, let source else { return }
            start(context, version: version, source: source, reason: choiceReason, at: 0)
        default: break
        }
    }
    func pause() { if phase == .playing, !isLive { engine.pause() } }

    func seek(by delta: TimeInterval) {
        guard !isLive, duration > 0 else { return }
        seek(to: time + delta)
    }
    func seek(to seconds: TimeInterval) {
        guard !isLive, duration > 0 else { return }
        let target = min(max(0, seconds), duration - 1)
        time = target
        lastSeek = .now
        pendingSeeks += 1
        Task { [engine] in
            await engine.seek(to: target)
            pendingSeeks -= 1
        }
        log.info("seek to \(target, format: .fixed(precision: 0))")
        nowPlaying.update()
        onPlaybackChanged?()
    }

    /// Starts sweeping the film while a direction is held; the image keeps playing, one seek on release.
    func startScan(forward: Bool) {
        guard !isLive, duration > 0, scanTask == nil else { return }
        let sign: Double = forward ? 1 : -1
        scanTarget = time
        scanTask = Task { [weak self] in
            let began = ContinuousClock.now
            while !Task.isCancelled {
                guard let self else { return }
                let level = min(Int((ContinuousClock.now - began) / .seconds(2)), Self.scanRates.count - 1)
                scanRate = sign * Self.scanRates[level]
                scanTarget = min(max(0, (scanTarget ?? time) + scanRate / 4), duration - 1)
                onPlaybackChanged?()
                try? await Task.sleep(for: .milliseconds(250))
            }
        }
    }

    /// Release: jump to where the sweep got to.
    func stopScan() {
        guard let target = scanTarget else { return }
        cancelScan()
        seek(to: target)
    }

    private func cancelScan() {
        scanTask?.cancel(); scanTask = nil
        scanTarget = nil; scanRate = 0
    }

    /// The time the chrome shows: the sweep's target while scanning.
    var shownTime: TimeInterval { scanTarget ?? time }

    var remaining: TimeInterval { max(0, duration - shownTime) }
    var endDate: Date { .now.addingTimeInterval(remaining) }
    var fraction: Double { duration > 0 ? shownTime / duration : 0 }

    /// A short reload with a black picture for about a second: the engine rebuilds the session on the new track.
    func select(audio track: Track) {
        guard let index = Int(track.id) else { return }
        engine.selectAudioTrack(index: index)
    }
    func select(text track: Track?) {
        if let track, let index = Int(track.id) { engine.selectSubtitleTrack(index: index) } else { engine.clearSubtitle() }
    }

    // MARK: - Picture-in-Picture

    var isPictureInPictureAvailable: Bool { pictureInPicture.isAvailable }
    func startPictureInPicture() { pictureInPicture.start() }
    /// Wires Picture-in-Picture to this service once; safe to call at every appearance of the player.
    func attachPictureInPicture() { pictureInPicture.attach(to: self) }

    /// The app activates the session; the engine declares its category and route policy, which a `setCategory` would override.
    private func activateAudioSession() {
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    // MARK: - Versions while playing

    /// Switches version, same position, and remembers it for the title when the preference says so.
    func switchVersion(_ v: Version) {
        guard let context else { return }
        if preferences.rememberVersionPerTitle {
            if context.content.kind == .episode, let sid = context.seriesID {
                preferences.setSeriesChoice(VersionChoiceKey(v), for: sid)
            } else {
                preferences.remember(versionID: v.id, for: context.content.id)
            }
        }
        play(context, version: v)
    }

    /// "Autre version" from the failure dialog: the next of the engine's order.
    var alternativeVersion: Version? {
        guard let context, let version else { return nil }
        return chooser.alternatives(to: version, in: context.versions).first
    }

    /// "Réessayer" from the failure dialog: ask the server for a fresh URL. The mock hands back the same context.
    func retryFromServer() {
        guard let context, let version else { return }
        failure = nil
        liveResets = 0
        Task { [weak self] in
            guard let self else { return }
            let fresh = (try? await client.playback(id: context.content.id)).map { PlaybackContext(content: context.content, playback: $0) } ?? context
            let v = fresh.versions.first { $0.id == version.id } ?? version
            let s = chooser.bestSource(of: v) ?? v.sources.first
            guard let s else { return }
            startAttempts = 0
            start(fresh, version: v, source: s, reason: choiceReason, at: time)
        }
    }

    func playAlternative() {
        if let alt = alternativeVersion { playInstead(alt) }
    }

    /// Every other version, the chooser's best first: the failure dialog offers each (tvOS).
    var alternativeVersions: [Version] {
        guard let context, let version else { return [] }
        return chooser.alternatives(to: version, in: context.versions)
    }

    /// From the failure dialog: another version, without remembering it as the title's choice.
    func playInstead(_ v: Version) {
        guard let context else { return }
        failure = nil
        startAttempts = 0
        play(context, version: v)
    }

    // MARK: - Next episode

    func playNextNow() {
        guard let next = nextContext else { return }
        countdownTask?.cancel()
        nextCountdown = nil
        nextContext = nil
        nextTriggered = true
        sendProgress(final: true)
        play(next)
    }
    func cancelNext() {
        countdownTask?.cancel()
        nextCountdown = nil
        nextTriggered = true
    }

    // MARK: - Start pipeline

    private func start(_ ctx: PlaybackContext, version v: Version, source s: Source, reason: VersionChooser.Choice.Reason?, at position: TimeInterval?) {
        if context?.content.id != ctx.content.id {
            sendProgress(final: true)
            nextTriggered = false
            nextContext = nil
            nextCountdown = nil
            countdownTask?.cancel()
            prefetchNext(ctx)
        }
        cancelTimers(keepCountdown: true)
        context = ctx
        version = v
        source = s
        choiceReason = reason
        failure = nil
        phase = .opening
        time = position ?? 0
        duration = ctx.duration ?? 0
        isStarted = false
        hasPlayed = false
        lastSeek = nil
        audioTracks = []; textTracks = []

        // One connection at most: the account allows a single stream, and this also stops the
        // speculative parallel requests. No `stop()` between two loads: `load` tears the previous session
        // down and keeps the display criteria from one episode to the next.
        var options = isLive
            ? LoadOptions(isLive: true, liveJoinProfile: .fastZap, maxConcurrentSourceRequests: 1)
            : LoadOptions(maxConcurrentSourceRequests: 1)
        // Live decodes in the app: AVPlayer, fed by the engine's local HLS, waits for three whole GOPs
        // before it starts (6 s on a channel with long GOPs), and does not deinterlace 1080i on tvOS.
        if isLive { options.preferredDecodePath = .software }
        let resume = !isLive && (position ?? 0) > 1 ? position : nil
        activateAudioSession()
        loadTask?.cancel()
        loadTask = Task { [engine] in
            do {
                _ = try await engine.load(url: s.streamURL, startPosition: resume, options: options)
            } catch is CancellationError {
                // A newer load or a stop replaced this one: not a failure.
            } catch {
                // The same failure also arrives as the engine's `.error` state, counted there only.
                log.info("load failed: \(error)")
            }
        }
        armStartDeadline()
        armWatchdog()
        startProgressTicker()
        nowPlaying.attach(to: self)
        nowPlaying.update()
    }

    private func markStarted() {
        guard !isStarted else { return }
        isStarted = true
        startAttempts = 0
        startDeadline?.cancel()
        if let source { failedSources.clear(source.id) }
    }

    /// Once started, a source that keeps rebuffering or stalling while playing is a failed source (next
    /// source, retry at the same position, then the dialog): the bandwidth at home is not the bottleneck,
    /// the source is. A source that closes the connection for good ends in `.ended` or `.error` instead,
    /// handled in `handle(enginePhase:)`.
    private func armWatchdog() {
        watchdog?.cancel()
        let timeout = isLive ? Self.freezeTimeout : Self.vodFreezeTimeout
        watchdog = Task { [weak self] in
            var still: TimeInterval = 0
            let tick: TimeInterval = 1
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(tick))
                guard let self, !Task.isCancelled else { return }
                guard isStarted, phase == .playing else { still = 0; continue }
                // Just after a seek the engine may take a few seconds to fetch the new position.
                if let lastSeek, Date.now.timeIntervalSince(lastSeek) < Self.vodFreezeTimeout { still = 0; continue }
                switch engine.playbackPhase {
                case .rebuffering, .stalled: still += tick
                default: still = 0
                }
                if still >= timeout {
                    log.info("freeze at \(self.time, format: .fixed(precision: 0))")
                    handleStreamFailure()
                    return
                }
            }
        }
    }

    private func armStartDeadline() {
        startDeadline?.cancel()
        startDeadline = Task { [weak self] in
            try? await Task.sleep(for: Self.startTimeout)
            guard let self, !Task.isCancelled else { return }
            if !engine.hasFirstFrameReadyForDisplay || engine.playbackPhase != .playing { handleStreamFailure() }
        }
    }

    /// Error or no image after 10 s: switch source, retry twice, then ask.
    private func handleStreamFailure() {
        guard let context, let version, let source else { return }
        startAttempts += 1
        failedSources.markFailed(source.id)
        if preferences.switchSourceOnFailure, let other = chooser.nextSource(after: source, in: version) {
            showToast("Source changée automatiquement", detail: "\(sourceLabel(source, in: version)) → \(sourceLabel(other, in: version)) · même version \(version.label)")
            start(context, version: version, source: other, reason: choiceReason, at: time)
            return
        }
        if startAttempts <= 2 {
            // Same URL again: the server answers 302 with a fresh upstream token.
            start(context, version: version, source: source, reason: choiceReason, at: time)
            return
        }
        presentFailure()
    }

    /// Stops and shows the failure dialog.
    private func presentFailure() {
        guard let version, let source else { return }
        cancelTimers(keepCountdown: true)
        loadTask?.cancel(); loadTask = nil
        engine.stop()
        phase = .failed
        failure = Failure(attempts: startAttempts, sourceLabel: "\(version.label) · \(sourceLabel(source, in: version))",
                          hadAlternativeSource: version.sources.count > 1)
        nowPlaying.update()
    }

    /// Live: the source restarted from its beginning (the engine parked the session). Same switch as a
    /// failure, guarded: one restart at a time, `liveResetGap` apart, `maxLiveResets` per channel, then the dialog.
    private func handleLiveSourceReset() {
        guard isLive, let source, phase != .opening, phase != .idle, phase != .failed else { return }
        if liveResets >= Self.maxLiveResets {
            log.info("live source reset: limit reached")
            failedSources.markFailed(source.id)
            presentFailure()
            return
        }
        if let lastLiveReset, Date.now.timeIntervalSince(lastLiveReset) < Self.liveResetGap {
            guard deferredReset == nil else { return }
            let wait = Self.liveResetGap - Date.now.timeIntervalSince(lastLiveReset)
            deferredReset = Task { [weak self] in
                try? await Task.sleep(for: .seconds(wait))
                guard let self, !Task.isCancelled else { return }
                deferredReset = nil
                handleLiveSourceReset()
            }
            return
        }
        liveResets += 1
        lastLiveReset = .now
        log.info("live source reset \(self.liveResets)/\(Self.maxLiveResets)")
        handleStreamFailure()
    }

    func sourceLabel(_ s: Source, in v: Version) -> String {
        guard let idx = v.sources.firstIndex(of: s) else { return "Source" }
        return "Source \(Character(UnicodeScalar(65 + idx)!))"
    }

    private func showToast(_ text: String, detail: String?) {
        toast = Toast(text: text, detail: detail)
        toastTask?.cancel()
        toastTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(4))
            if !Task.isCancelled { self?.toast = nil }
        }
    }

    private func prefetchNext(_ ctx: PlaybackContext) {
        guard let next = ctx.next else { return }
        Task { [weak self] in
            guard let self, let playback = try? await client.playback(id: next.id) else { return }
            let content = PlaybackContent(id: next.id, kind: .episode, title: next.title ?? "", subtitle: ctx.content.subtitle,
                                          episode: next.ref, backdrop: ctx.content.backdrop)
            if context?.content.id == ctx.content.id { nextContext = PlaybackContext(content: content, playback: playback) }
        }
    }

    private func maybeStartCountdown() {
        guard preferences.autoPlayNext, !nextTriggered, nextCountdown == nil, let _ = context?.next, duration > 0,
              remaining <= Self.nextEpisodeLead, phase == .playing else { return }
        nextCountdown = Self.nextEpisodeCountdown
        countdownTask?.cancel()
        countdownTask = Task { [weak self] in
            while let self, let n = nextCountdown, n > 0, !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                if Task.isCancelled { return }
                if phase == .playing { nextCountdown = n - 1 }
            }
            guard let self, !Task.isCancelled, nextCountdown == 0 else { return }
            if nextContext != nil { playNextNow() } else { nextCountdown = nil }
        }
    }

    // MARK: - Progress

    private func startProgressTicker() {
        progressTicker?.cancel()
        progressTicker = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: Self.progressInterval)
                if Task.isCancelled { return }
                self?.sendProgress(final: false)
            }
        }
    }

    private func sendProgress(final: Bool) {
        guard let context, !isLive, duration > 0, time > 0 else { return }
        let report = ProgressReport(contentID: context.content.id, position: time, duration: duration, sentAt: .now)
        Task { [weak self, client, progressQueue] in
            do {
                try await client.report(report)
                await progressQueue.flush { try await client.report($0) }
            } catch {
                progressQueue.enqueue(report)
            }
            if final { self?.progressRevision += 1 }
        }
    }

    private func cancelTimers(keepCountdown: Bool = false) {
        startDeadline?.cancel(); startDeadline = nil
        watchdog?.cancel(); watchdog = nil
        deferredReset?.cancel(); deferredReset = nil
        cancelScan()
        progressTicker?.cancel(); progressTicker = nil
        if !keepCountdown { countdownTask?.cancel(); countdownTask = nil }
    }

    var selectedAudioLabel: String { audioTracks.first(where: \.isSelected)?.name ?? "—" }
    var selectedTextLabel: String { textTracks.first(where: \.isSelected)?.name ?? "désactivés" }

    // MARK: - Engine

    /// Mirrors the engine's published state. Each sink hops to the next main-queue turn first: `@Published`
    /// emits before it stores the value, and the handlers read the engine.
    private func observeEngine() {
        engine.$playbackPhase
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.handle(enginePhase: $0) }
            .store(in: &cancellables)
        // Half a second, like the sampling the chrome has always had: every tick is a render transaction.
        engine.clock.$currentTime
            .throttle(for: .milliseconds(500), scheduler: DispatchQueue.main, latest: true)
            .sink { [weak self] in self?.handle(time: $0) }
            .store(in: &cancellables)
        engine.$duration
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in
                guard $0 > 0, let self else { return }
                duration = $0
                nowPlaying.update()
            }
            .store(in: &cancellables)
        engine.$startupProgress
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.bufferingProgress = Float(($0?.fraction ?? 0) * 100) }
            .store(in: &cancellables)
        Publishers.MergeMany([
            engine.$audioTracks.map { _ in }.eraseToAnyPublisher(),
            engine.$activeAudioTrackIndex.map { _ in }.eraseToAnyPublisher(),
            engine.$subtitleTracks.map { _ in }.eraseToAnyPublisher(),
            engine.$activeSubtitleTrackIndex.map { _ in }.eraseToAnyPublisher(),
            engine.$isSubtitleActive.map { _ in }.eraseToAnyPublisher(),
        ])
        .receive(on: DispatchQueue.main)
        .sink { [weak self] in self?.refreshTracks() }
        .store(in: &cancellables)
        engine.liveSourceReset
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.handleLiveSourceReset() }
            .store(in: &cancellables)
    }

    private func handle(enginePhase: PlaybackPhase) {
        log.info("phase \(String(describing: enginePhase)) time \(self.time, format: .fixed(precision: 0)) duration \(self.duration, format: .fixed(precision: 0))")
        // After `stop()` or a failure the engine's last events are the old session's.
        guard phase != .idle, phase != .failed else { return }
        switch enginePhase {
        case .idle:
            return
        case .loading:
            phase = .opening
        case .playing:
            phase = .playing
            hasPlayed = true
            markStartedIfReady()
        case .paused:
            phase = .paused
        case .seeking, .rebuffering, .stalled:
            phase = !hasPlayed ? .opening : engine.state == .paused ? .paused : .playing
        case .ended:
            // A live has no end, and a film ending far from its end was cut.
            if isLive || !hasPlayed || (duration > 0 && duration - time > Self.endMargin) {
                log.info("cut at \(self.time, format: .fixed(precision: 0))")
                handleStreamFailure()
                return
            }
            phase = .ended
            if context?.next != nil, nextContext != nil, !nextTriggered, preferences.autoPlayNext { playNextNow() }
        case .error:
            if let info = engine.errorInfo {
                log.info("error \(String(describing: info.kind)) \(info.underlyingDomain ?? "-") \(info.underlyingCode ?? 0)")
            }
            handleStreamFailure()
            return
        }
        nowPlaying.update()
        onPlaybackChanged?()
    }

    private func handle(time engineTime: TimeInterval) {
        guard phase != .opening, phase != .idle, !engine.isSeeking, pendingSeeks == 0 else { return }
        time = engineTime
        markStartedIfReady()
        maybeStartCountdown()
        onPlaybackChanged?()
    }

    /// Started: the first picture is on screen and the session is playing.
    private func markStartedIfReady() {
        guard phase == .playing, engine.hasFirstFrameReadyForDisplay, engine.playbackPhase == .playing else { return }
        markStarted()
    }

    private func refreshTracks() {
        let audio = engine.audioTracks.map { info in
            Track(id: String(info.id), name: Self.name(of: info, audio: true), language: info.language,
                  isSelected: info.id == engine.activeAudioTrackIndex)
        }
        let text = engine.subtitleTracks.map { info in
            Track(id: String(info.id), name: Self.name(of: info, audio: false), language: info.language,
                  isSelected: engine.isSubtitleActive && info.id == engine.activeSubtitleTrackIndex)
        }
        if audio != audioTracks { audioTracks = audio }
        if text != textTracks { textTracks = text }
    }

    /// The track's own name, else its language in full, with the codec and channels for audio: "Français (EAC3 5.1)".
    private static func name(of info: TrackInfo, audio: Bool) -> String {
        if !info.name.isEmpty { return info.name }
        let language = info.language.flatMap { Locale(identifier: "fr").localizedString(forLanguageCode: $0)?.localizedCapitalized } ?? "Piste \(info.id)"
        guard audio else { return language }
        let channels = switch info.channels { case 0: ""; case 1: "1.0"; case 2: "2.0"; case 6: "5.1"; case 8: "7.1"; default: "\(info.channels) ch" }
        let detail = [info.codec.uppercased(), channels].filter { !$0.isEmpty }.joined(separator: " ")
        return detail.isEmpty ? language : "\(language) (\(detail))"
    }
}

#if DEBUG
/// Preview scaffolding: puts the player in a given state without a stream.
extension PlayerService {
    enum PreviewState: String { case vodPaused, failure, nextEpisode, livePlaying, panel, opening }

    func debugPut(_ ctx: PlaybackContext, state: PreviewState, channels list: [Channel] = []) {
        debugFrame = true
        context = ctx
        version = ctx.versions.first
        source = ctx.versions.first?.sources.first
        duration = ctx.duration ?? 7620
        time = ctx.resumeAt ?? 4368
        audioTracks = [Track(id: "1", name: "Français (AC3 5.1)", language: "fr", isSelected: true), Track(id: "2", name: "English", language: "en", isSelected: false)]
        textTracks = [Track(id: "3", name: "Français", language: "fr", isSelected: false)]
        switch state {
        case .vodPaused: phase = .paused
        case .failure:
            phase = .failed
            failure = Failure(attempts: 2, sourceLabel: "4K Dolby Vision · VF · Source A", hadAlternativeSource: false)
        case .nextEpisode:
            phase = .playing
            time = duration - 28
            nextCountdown = 7
        case .livePlaying:
            phase = .playing
            channels = list
            channel = list.first
            let start = Date.now.addingTimeInterval(-3200)
            epg = EPGNow(now: Programme(title: "Ligue · Lyon – Nantes", start: start, end: start.addingTimeInterval(7200), overview: nil),
                         next: Programme(title: "Le Mag du foot", start: start.addingTimeInterval(7200), end: start.addingTimeInterval(9000), overview: nil))
        case .panel: phase = .playing
        case .opening: phase = .buffering; bufferingProgress = 42
        }
    }
}

#endif
