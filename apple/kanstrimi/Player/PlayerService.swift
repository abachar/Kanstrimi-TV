import Foundation
import Observation
import OSLog
#if os(macOS)
import AppKit
#else
import UIKit
#endif
import VLCKit

private let log = Logger(subsystem: "dev.crafters.kanstrimi", category: "player")

/// The one player of the app. Wraps VLCKit, owns the playback context, the version and
/// source in use, the automatic source switch, the failure dialog and the next-episode countdown.
@Observable
final class PlayerService: NSObject {
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
    var hasImage: Bool { player.hasVideoOut }

    // MARK: - Dependencies

    private let client: CatalogClient
    private let preferences: Preferences
    private let failedSources: FailedSourcesStore
    private let progressQueue: ProgressQueue
    let player: VLCMediaPlayer
    /// The surface VLC draws into. Created once and attached before any playback, because a
    /// drawable set after `play()` is not always picked up by the video output. Each platform
    /// builds its own (`PlayerDrawable+iOS.swift` adds Picture-in-Picture).
    let videoView: PlatformView = PlayerService.makeDrawable()
    private let capabilities: VersionChooser.Capabilities

    private var startAttempts = 0
    private var startDeadline: Task<Void, Never>?
    /// True once the stream shows images: the start deadline hands over to the freeze watchdog.
    private var isStarted = false
    private var watchdog: Task<Void, Never>?
    private var scanTask: Task<Void, Never>?
    private var progressTicker: Task<Void, Never>?
    private var toastTask: Task<Void, Never>?
    private var countdownTask: Task<Void, Never>?
    private var zapTask: Task<Void, Never>?
    private var pendingSeek: TimeInterval?
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
        self.player = VLCMediaPlayer(options: ["--no-video-title-show"])
        super.init()
        player.delegate = self
        player.drawable = videoView
        player.timeChangeUpdateInterval = 0.5
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
        let ctx = PlaybackContext(content: PlaybackContent(id: channel.id, kind: .live, title: channel.name, subtitle: nil, episode: nil, backdrop: nil),
                                  versions: channel.versions)
        play(ctx)
        Task { [weak self] in
            guard let self else { return }
            let full = try? await client.channel(id: channel.id)
            if self.channel?.id == channel.id { epg = full.map { EPGNow(now: $0.now, next: $0.next) } ?? .empty }
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
        player.stop()
        player.media = nil
        context = nil; version = nil; source = nil; channel = nil; channels = []
        phase = .idle; time = 0; duration = 0; isMinimized = false
        failure = nil; toast = nil; nextCountdown = nil; nextContext = nil; nextTriggered = false
        audioTracks = []; textTracks = []
        epg = .empty
    }

    // MARK: - Controls

    /// Live never pauses, like a TV: only a stall or an interruption can stop it, and Play resumes it.
    func togglePlayPause() {
        switch phase {
        case .playing: if !isLive { player.pause() }
        case .paused, .ended: player.play()
        default: break
        }
    }
    func pause() { if phase == .playing, !isLive { player.pause() } }

    func seek(by delta: TimeInterval) {
        guard !isLive, duration > 0 else { return }
        seek(to: time + delta)
    }
    func seek(to seconds: TimeInterval) {
        guard !isLive, duration > 0 else { return }
        let target = min(max(0, seconds), duration - 1)
        if Self.seekByPosition {
            // Fraction of the file: the fast byte-offset path of the MKV demuxer when Cues are missing.
            player.position = target / duration
        } else {
            player.time = VLCTime(int: Int32(target * 1000))
        }
        time = target
        log.info("seek to \(target, format: .fixed(precision: 0)) (\(Self.seekByPosition ? "position" : "time"))")
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

    enum ResumeStrategy { case startTime, seekAfterStart }
    /// How a resume position is applied. On the simulator, both strategies leave the video output
    /// black after a deep seek into a remote MKV (audio plays, `hasVideoOut` is true), while a
    /// resume at 120 s works: the "seek MKV" risk of ETUDE.md §3, to measure on a real Apple TV 4K.
    static var resumeStrategy: ResumeStrategy = .startTime
    static var seekByPosition = false

    var remaining: TimeInterval { max(0, duration - shownTime) }
    var endDate: Date { .now.addingTimeInterval(remaining) }
    var fraction: Double { duration > 0 ? shownTime / duration : 0 }

    func select(audio track: Track) {
        guard let t = player.audioTracks.first(where: { $0.trackId == track.id }) else { return }
        t.isSelectedExclusively = true
        refreshTracks()
    }
    func select(text track: Track?) {
        if let track, let t = player.textTracks.first(where: { $0.trackId == track.id }) {
            t.isSelectedExclusively = true
        } else {
            player.deselectAllTextTracks()
        }
        refreshTracks()
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
        guard let context, let alt = alternativeVersion else { return }
        failure = nil
        startAttempts = 0
        play(context, version: alt)
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
        pendingSeek = position
        isStarted = false
        audioTracks = []; textTracks = []

        player.stop()
        let media = VLCMedia(url: s.streamURL)
        // Per media: the live keeps a short buffer for the zap, VOD a longer one (Réglages › Lecture).
        media?.addOption(":network-caching=\(isLive ? preferences.liveBufferMs : preferences.vodBufferMs)")
        // A dropped HTTP connection is reopened by VLC (with a Range on VOD) before the watchdog steps in.
        media?.addOption(":http-reconnect")
        // Resume through the demuxer rather than a seek after `play()`: on a remote MKV the
        // early seek leaves the video output black while the Cues are fetched.
        if let position, position > 1, !isLive, Self.resumeStrategy == .startTime {
            media?.addOption(":start-time=\(Int(position))")
            pendingSeek = nil
        }
        player.media = media
        player.play()
        armStartDeadline()
        armWatchdog()
        startProgressTicker()
    }

    private func markStarted() {
        guard !isStarted else { return }
        isStarted = true
        startAttempts = 0
        startDeadline?.cancel()
        if let source { failedSources.clear(source.id) }
    }

    /// Once started, a stream whose image stops moving or disappears while playing is a failed source
    /// (next source, retry at the same position, then the dialog): the bandwidth at home is not the
    /// bottleneck, the source is. The upstream closing the connection ends in `.stopped` instead,
    /// handled in `handle(state:)`.
    private func armWatchdog() {
        watchdog?.cancel()
        let timeout = isLive ? Self.freezeTimeout : Self.vodFreezeTimeout
        watchdog = Task { [weak self] in
            var last: UInt64?
            var still: TimeInterval = 0
            let tick: TimeInterval = 1
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(tick))
                guard let self, !Task.isCancelled else { return }
                guard isStarted, phase == .playing, let stats = player.media?.statistics else { last = nil; still = 0; continue }
                let pictures = stats.displayedPictures
                // A lost video output (black screen) counts as a frozen image.
                if !player.hasVideoOut || last.map({ pictures <= $0 }) == true { still += tick } else { still = 0 }
                last = pictures
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
            if phase != .playing || !player.hasVideoOut { handleStreamFailure() }
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
        cancelTimers(keepCountdown: true)
        player.stop()
        phase = .failed
        failure = Failure(attempts: startAttempts, sourceLabel: "\(version.label) · \(sourceLabel(source, in: version))",
                          hadAlternativeSource: version.sources.count > 1)
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
        cancelScan()
        progressTicker?.cancel(); progressTicker = nil
        if !keepCountdown { countdownTask?.cancel(); countdownTask = nil }
    }

    private func refreshTracks() {
        audioTracks = player.audioTracks.map { Track(id: $0.trackId, name: $0.trackName, language: $0.language, isSelected: $0.isSelected) }
        textTracks = player.textTracks.map { Track(id: $0.trackId, name: $0.trackName, language: $0.language, isSelected: $0.isSelected) }
    }

    var selectedAudioLabel: String { audioTracks.first(where: \.isSelected)?.name ?? "—" }
    var selectedTextLabel: String { textTracks.first(where: \.isSelected)?.name ?? "désactivés" }
}

// MARK: - VLCMediaPlayerDelegate

extension PlayerService: VLCMediaPlayerDelegate {
    nonisolated func mediaPlayerStateChanged(_ newState: VLCMediaPlayerState) {
        Task { @MainActor in self.handle(state: newState) }
    }
    nonisolated func mediaPlayerTimeChanged(_ aNotification: Notification) {
        Task { @MainActor in self.handleTimeChanged() }
    }
    nonisolated func mediaPlayerBufferingChanged(_ progress: Float) {
        Task { @MainActor in self.bufferingProgress = progress }
    }
    nonisolated func mediaPlayerLengthChanged(_ length: Int64) {
        Task { @MainActor in
            log.info("length \(length) ms")
            if length > 0 { self.duration = TimeInterval(length) / 1000 }
        }
    }
    nonisolated func mediaPlayerTrackAdded(_ trackId: String, with trackType: VLCMedia.TrackType) {
        Task { @MainActor in self.refreshTracks() }
    }
    nonisolated func mediaPlayerTrackSelected(_ trackType: VLCMedia.TrackType, selectedId: String, unselectedId: String) {
        Task { @MainActor in self.refreshTracks() }
    }

    private func handle(state: VLCMediaPlayerState) {
        log.info("state \(VLCMediaPlayerStateToString(state)) time \(self.time, format: .fixed(precision: 0)) duration \(self.duration, format: .fixed(precision: 0)) videoOut \(self.player.hasVideoOut)")
        switch state {
        case .opening: phase = .opening
        case .playing:
            phase = .playing
            if let pending = pendingSeek, pending > 0, duration > 0 {
                pendingSeek = nil
                seek(to: pending)
            }
            if player.hasVideoOut { markStarted() }
            refreshTracks()
        case .paused: phase = .paused
        case .stopped:
            // The upstream closing the connection ends like the file does: live has no end, and a
            // film stopping far from its end was cut.
            if isStarted, phase == .playing, isLive || (duration > 0 && duration - time > Self.endMargin) {
                log.info("cut at \(self.time, format: .fixed(precision: 0))")
                handleStreamFailure()
            } else if phase == .playing || phase == .paused {
                phase = .ended
                if context?.next != nil, nextContext != nil, !nextTriggered, preferences.autoPlayNext { playNextNow() }
            }
        case .error: handleStreamFailure()
        default: break
        }
        onPlaybackChanged?()
    }

    private func handleTimeChanged() {
        let ms = player.time.value?.doubleValue ?? 0
        if ms >= 0 { time = ms / 1000 }
        if duration == 0, let len = player.media?.length.value?.doubleValue, len > 0 { duration = len / 1000 }
        if let pending = pendingSeek, duration > 0 {
            pendingSeek = nil
            seek(to: pending)
        }
        if phase == .playing, player.hasVideoOut { markStarted() }
        maybeStartCountdown()
        onPlaybackChanged?()
    }
}

#if DEBUG
/// Preview scaffolding: puts the player in a given state without a stream.
extension PlayerService {
    enum PreviewState: String { case vodPaused, failure, nextEpisode, livePlaying, panel, opening }

    func debugPut(_ ctx: PlaybackContext, state: PreviewState, channels list: [Channel] = []) {
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
            zapBanner = true
        case .panel: phase = .playing
        case .opening: phase = .buffering; bufferingProgress = 42
        }
    }
}

#endif
