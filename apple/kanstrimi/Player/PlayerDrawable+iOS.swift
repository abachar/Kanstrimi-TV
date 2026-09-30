#if os(iOS)
import AVFoundation
import Synchronization
import UIKit
import VLCKit

extension PlayerService {
    /// The drawable that also offers Picture-in-Picture: VLCKit enables it when the drawable
    /// conforms to `VLCPictureInPictureDrawable`, and hands back a window controller once ready.
    static func makeDrawable() -> UIView { PiPVideoView() }

    var pipView: PiPVideoView? { videoView as? PiPVideoView }

    /// Wires this service to its drawable once; safe to call at every appearance of the player.
    func attachPictureInPicture() {
        guard let pipView, pipView.service !== self else { return }
        pipView.service = self
        pipView.controller.bind { [weak self] command in
            guard let self else { return }
            switch command {
            case .play: if phase == .paused || phase == .ended { togglePlayPause() }
            case .pause: pause()
            case .seek(let delta): seek(by: delta)
            }
        }
        onPlaybackChanged = { [weak self, weak pipView] in
            guard let self, let pipView else { return }
            pipView.controller.update(time: time, duration: duration, playing: phase == .playing, seekable: !isLive && duration > 0)
            pipView.pipWindow?.invalidatePlaybackState()
        }
    }

    /// iOS plays through the shared audio session; `.playback` keeps the sound with the mute switch on.
    func activateAudioSession() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .moviePlayback)
        try? session.setActive(true)
    }

    var isPictureInPictureAvailable: Bool { pipView?.pipWindow != nil }

    /// The player screen hides only once the picture has started (`stateChangeEventHandler`): hidden
    /// before, the video surface leaves the window and iOS gives up on the picture.
    func startPictureInPicture() {
        pipView?.pipWindow?.startPictureInPicture()
    }
}

/// The video surface. VLCKit calls the two protocol methods from its own threads, so the
/// answers are immutable objects; the window controller lands here on the main actor.
final class PiPVideoView: UIView, VLCPictureInPictureDrawable {
    let controller = PiPMediaController()
    /// Set by VLCKit once its video output can go picture in picture.
    private(set) var pipWindow: (any VLCPictureInPictureWindowControlling)?
    weak var service: PlayerService?

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .black
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    /// VLCKit draws in a view and layers of its own inside this one, sized once: after a rotation they
    /// kept the old size and the picture drifted off centre. They follow the surface at every layout.
    override func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        for view in subviews {
            if view.frame != bounds { view.frame = bounds }
            Self.fit(view.layer, to: view.bounds)
        }
        Self.fit(layer, to: bounds)
        CATransaction.commit()
    }

    /// The bare layers (no view behind them) inside `layer`, sized to `bounds`.
    private static func fit(_ layer: CALayer, to bounds: CGRect) {
        for sub in layer.sublayers ?? [] where sub.delegate == nil && sub.frame != bounds { sub.frame = bounds }
    }

    nonisolated func mediaController() -> any VLCPictureInPictureMediaControlling { controller }

    nonisolated func pictureInPictureReady() -> (((any VLCPictureInPictureWindowControlling)?) -> Void)? {
        let box = SendableBox(self)
        return { window in
            guard let window else { return }
            let handle = SendableBox(window)
            Task { @MainActor in
                let view = box.value
                view.pipWindow = handle.value
                handle.value.stateChangeEventHandler = { started in
                    Task { @MainActor in
                        // In the picture: the player screen steps aside; out of it, it comes back over the app.
                        view.service?.isMinimized = started
                    }
                }
            }
        }
    }
}

/// What the picture-in-picture window asks about playback, answered from a snapshot the
/// service refreshes on every change; the commands hop back to the main actor.
nonisolated final class PiPMediaController: NSObject, VLCPictureInPictureMediaControlling, Sendable {
    private struct Snapshot { var time: TimeInterval = 0; var duration: TimeInterval = 0; var playing = false; var seekable = false }
    private let snapshot = Mutex(Snapshot())
    private let commands = Mutex<(@MainActor (PiPCommand) -> Void)?>(nil)

    enum PiPCommand { case play, pause, seek(by: TimeInterval) }

    @MainActor func update(time: TimeInterval, duration: TimeInterval, playing: Bool, seekable: Bool) {
        snapshot.withLock { $0 = Snapshot(time: time, duration: duration, playing: playing, seekable: seekable) }
    }

    @MainActor func bind(_ handler: @escaping @MainActor (PiPCommand) -> Void) {
        commands.withLock { $0 = handler }
    }

    private func send(_ command: PiPCommand, completion: (@Sendable () -> Void)? = nil) {
        let handler = commands.withLock { $0 }
        Task { @MainActor in
            handler?(command)
            completion?()
        }
    }

    func play() { send(.play) }
    func pause() { send(.pause) }
    func seek(by offset: Int64, completion: @escaping () -> Void) {
        // VLCKit's block is not marked Sendable; it only has to be called once, on any thread.
        let done = SendableBox(completion)
        send(.seek(by: TimeInterval(offset) / 1000)) { done.value() }
    }
    func mediaLength() -> Int64 { Int64(snapshot.withLock { $0.duration } * 1000) }
    func mediaTime() -> Int64 { Int64(snapshot.withLock { $0.time } * 1000) }
    func isMediaSeekable() -> Bool { snapshot.withLock { $0.seekable } }
    func isMediaPlaying() -> Bool { snapshot.withLock { $0.playing } }
}

/// Carries a non-Sendable reference across a hop whose destination is the main actor.
nonisolated private struct SendableBox<T>: @unchecked Sendable {
    let value: T
    init(_ value: T) { self.value = value }
}
#endif
