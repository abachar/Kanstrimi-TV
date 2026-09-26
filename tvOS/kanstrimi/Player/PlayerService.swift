import Foundation
import Observation
import OSLog
import UIKit
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
    var isPresented: Bool { context != nil }
    var isLive: Bool { context?.content.kind == .live }
    var hasImage: Bool { player.hasVideoOut }

    // MARK: - Dependencies

    private let client: CatalogClient
    private let preferences: Preferences
    private let failedSources: FailedSourcesStore
    private let progressQueue: ProgressQueue
    let player: VLCMediaPlayer
    /// The surface VLC draws into. Created once and attached before any playback, because a
    /// drawable set after `play()` is not always picked up by the video output.
    let videoView: UIView = {
        let v = UIView()
        v.backgroundColor = .black
        return v
    }()
    private let capabilities: VersionChooser.Capabilities

    private var startAttempts = 0
    private var startDeadline: Task<Void, Never>?
    private var progressTicker: Task<Void, Never>?
    private var toastTask: Task<Void, Never>?
    private var countdownTask: Task<Void, Never>?
    private var zapTask: Task<Void, Never>?
    private var pendingSeek: TimeInterval?
    private var nextTriggered = false
    var onExit: (() -> Void)?

    static let startTimeout: Duration = .seconds(10)
    static let progressInterval: Duration = .seconds(30)
    static let nextEpisodeLead: TimeInterval = 30
    static let nextEpisodeCountdown = 10

    init(client: CatalogClient, preferences: Preferences, failedSources: FailedSourcesStore, progressQueue: ProgressQueue,
         capabilities: VersionChooser.Capabilities = .appleTV4K) {
        self.client = client
        self.preferences = preferences
        self.failedSources = failedSources
        self.progressQueue = progressQueue
        self.capabilities = capabilities
        self.player = VLCMediaPlayer(options: ["--network-caching=1500", "--no-video-title-show"])
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
                                  versions: channel.versions, resumeAt: nil, duration: nil, next: nil, seriesID: nil)
        play(ctx)
        Task { [weak self] in
            guard let self else { return }
            let now = try? await client.epg(channelID: channel.id)
            if self.channel?.id == channel.id { epg = now ?? .empty }
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
        phase = .idle; time = 0; duration = 0
        failure = nil; toast = nil; nextCountdown = nil; nextContext = nil; nextTriggered = false
        audioTracks = []; textTracks = []
        epg = .empty
    }

    // MARK: - Controls

    func togglePlayPause() {
        switch phase {
        case .playing: player.pause()
        case .paused, .ended: player.play()
        default: break
        }
    }
    func pause() { if phase == .playing { player.pause() } }

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
    }

    enum ResumeStrategy { case startTime, seekAfterStart }
    /// How a resume position is applied. On the simulator, both strategies leave the video output
    /// black after a deep seek into a remote MKV (audio plays, `hasVideoOut` is true), while a
    /// resume at 120 s works: the "seek MKV" risk of ETUDE.md §3, to measure on a real Apple TV 4K.
    static var resumeStrategy: ResumeStrategy = .startTime
    static var seekByPosition = false

    var remaining: TimeInterval { max(0, duration - time) }
    var endDate: Date { .now.addingTimeInterval(remaining) }
    var fraction: Double { duration > 0 ? time / duration : 0 }

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
            let fresh = (try? await client.playbackContext(id: context.content.id)) ?? context
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
        audioTracks = []; textTracks = []

        player.stop()
        let media = VLCMedia(url: s.streamURL)
        // Resume through the demuxer rather than a seek after `play()`: on a remote MKV the
        // early seek leaves the video output black while the Cues are fetched.
        if let position, position > 1, !isLive, Self.resumeStrategy == .startTime {
            media?.addOption(":start-time=\(Int(position))")
            pendingSeek = nil
        }
        player.media = media
        player.play()
        armStartDeadline()
        startProgressTicker()
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
            let c = try? await self?.client.playbackContext(id: next.id)
            if self?.context?.content.id == ctx.content.id { self?.nextContext = c }
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
        Task { [client, progressQueue] in
            do {
                try await client.report(report)
                await progressQueue.flush { try await client.report($0) }
            } catch {
                progressQueue.enqueue(report)
            }
        }
    }

    private func cancelTimers(keepCountdown: Bool = false) {
        startDeadline?.cancel(); startDeadline = nil
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
            if let source, player.hasVideoOut {
                failedSources.clear(source.id)
                startDeadline?.cancel()
            }
            refreshTracks()
        case .paused: phase = .paused
        case .stopped:
            if phase == .playing || phase == .paused {
                phase = .ended
                if context?.next != nil, nextContext != nil, !nextTriggered, preferences.autoPlayNext { playNextNow() }
            }
        case .error: handleStreamFailure()
        default: break
        }
    }

    private func handleTimeChanged() {
        let ms = player.time.value?.doubleValue ?? 0
        if ms >= 0 { time = ms / 1000 }
        if duration == 0, let len = player.media?.length.value?.doubleValue, len > 0 { duration = len / 1000 }
        if let pending = pendingSeek, duration > 0 {
            pendingSeek = nil
            seek(to: pending)
        }
        if phase == .playing, player.hasVideoOut { startDeadline?.cancel() }
        maybeStartCountdown()
    }
}

#if DEBUG
/// Preview scaffolding: puts the player in a given state without a stream.
extension PlayerService {
    enum PreviewState { case vodPaused, failure, nextEpisode, livePlaying, panel }

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
        }
    }
}

#endif
