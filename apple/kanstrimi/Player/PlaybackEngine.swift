import AetherEngine
import Combine
import Foundation

/// All `PlayerService` asks of the engine and all it hears from it: `PlayerCore` in the app, a fake in the tests,
/// which play the failures, the restarts and the ends that a real stream cannot be made to play on demand.
protocol PlaybackEngine: AnyObject {
    /// Opens `url` in place of what plays (`PlayerCore.load`).
    func load(_ url: URL, live: Bool, startPosition: TimeInterval?)
    func stop()
    func play()
    func pause()
    func seek(to seconds: Double) async
    func selectAudioTrack(index: Int)
    func selectSubtitleTrack(index: Int)
    func clearSubtitle()

    var playbackPhase: PlaybackPhase { get }
    var state: PlaybackState { get }
    var errorInfo: PlaybackErrorInfo? { get }
    var hasFirstFrameReadyForDisplay: Bool { get }
    var isSeeking: Bool { get }
    var audioTracks: [TrackInfo] { get }
    var activeAudioTrackIndex: Int? { get }
    var subtitleTracks: [TrackInfo] { get }
    var activeSubtitleTrackIndex: Int? { get }
    var isSubtitleActive: Bool { get }

    var phaseChanges: AnyPublisher<PlaybackPhase, Never> { get }
    var timeChanges: AnyPublisher<Double, Never> { get }
    var durationChanges: AnyPublisher<Double, Never> { get }
    /// How far the opening got, 0…1; nil once it is over.
    var startupChanges: AnyPublisher<Double?, Never> { get }
    /// The audio or subtitle tracks, or the one chosen, changed.
    var trackChanges: AnyPublisher<Void, Never> { get }
    /// Live: the source restarted from its beginning.
    var liveSourceResets: AnyPublisher<Void, Never> { get }
}

extension PlayerCore: PlaybackEngine {
    func load(_ url: URL, live: Bool, startPosition: TimeInterval?) { load(url, live: live, preview: false, startPosition: startPosition) }
    func play() { engine.play() }
    func pause() { engine.pause() }
    func seek(to seconds: Double) async { await engine.seek(to: seconds) }
    func selectAudioTrack(index: Int) { engine.selectAudioTrack(index: index) }
    func selectSubtitleTrack(index: Int) { engine.selectSubtitleTrack(index: index) }
    func clearSubtitle() { engine.clearSubtitle() }

    var playbackPhase: PlaybackPhase { engine.playbackPhase }
    var state: PlaybackState { engine.state }
    var errorInfo: PlaybackErrorInfo? { engine.errorInfo }
    var hasFirstFrameReadyForDisplay: Bool { engine.hasFirstFrameReadyForDisplay }
    var isSeeking: Bool { engine.isSeeking }
    var audioTracks: [TrackInfo] { engine.audioTracks }
    var activeAudioTrackIndex: Int? { engine.activeAudioTrackIndex }
    var subtitleTracks: [TrackInfo] { engine.subtitleTracks }
    var activeSubtitleTrackIndex: Int? { engine.activeSubtitleTrackIndex }
    var isSubtitleActive: Bool { engine.isSubtitleActive }

    var phaseChanges: AnyPublisher<PlaybackPhase, Never> { engine.$playbackPhase.eraseToAnyPublisher() }
    var timeChanges: AnyPublisher<Double, Never> { engine.clock.$currentTime.eraseToAnyPublisher() }
    var durationChanges: AnyPublisher<Double, Never> { engine.$duration.eraseToAnyPublisher() }
    var startupChanges: AnyPublisher<Double?, Never> { engine.$startupProgress.map { $0?.fraction }.eraseToAnyPublisher() }
    var trackChanges: AnyPublisher<Void, Never> {
        Publishers.MergeMany([
            engine.$audioTracks.map { _ in }.eraseToAnyPublisher(),
            engine.$activeAudioTrackIndex.map { _ in }.eraseToAnyPublisher(),
            engine.$subtitleTracks.map { _ in }.eraseToAnyPublisher(),
            engine.$activeSubtitleTrackIndex.map { _ in }.eraseToAnyPublisher(),
            engine.$isSubtitleActive.map { _ in }.eraseToAnyPublisher(),
        ])
        .eraseToAnyPublisher()
    }
    var liveSourceResets: AnyPublisher<Void, Never> { engine.liveSourceReset.eraseToAnyPublisher() }
}
