#if os(iOS)
import AVKit
import AetherEngine
import Combine
import Observation

/// Picture-in-Picture of the iPhone. The engine draws either through an `AVPlayerLayer` (native routes)
/// or into a sample-buffer layer (software route): the controller is rebuilt for whichever is live.
@Observable
final class PictureInPicture {
    /// True once iOS says the picture can start: drives the button of the player.
    private(set) var isAvailable = false

    @ObservationIgnored private weak var service: PlayerService?
    @ObservationIgnored private var controller: AVPictureInPictureController?
    @ObservationIgnored private var possibleObservation: NSKeyValueObservation?
    @ObservationIgnored private var routeObservation: AnyCancellable?
    @ObservationIgnored private let delegate = Delegate()

    init() { }

    /// Wires Picture-in-Picture to the service once; safe to call at every appearance of the player.
    func attach(to service: PlayerService) {
        guard self.service !== service else { return }
        self.service = service
        delegate.service = service
        delegate.onStateChange = { [weak self] in self?.service?.engine.pictureInPictureActive = $0 }
        let engine = service.engine
        // `@Published` emits before it stores: the hop lets the layer and the source settle first.
        routeObservation = engine.$videoRoute.combineLatest(engine.$softwarePiPSource)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] route, source in self?.rebuild(route: route, source: source) }
        service.onPlaybackChanged = { [weak self] in self?.controller?.invalidatePlaybackState() }
    }

    func start() { controller?.startPictureInPicture() }

    private func rebuild(route: VideoRoute, source: SoftwarePiPSource?) {
        guard let service, AVPictureInPictureController.isPictureInPictureSupported() else { return }
        let next: AVPictureInPictureController?
        switch route {
        case .loopback, .remoteBypass:
            next = service.engine.nativePlayerLayer.flatMap { AVPictureInPictureController(playerLayer: $0) }
        case .software:
            next = source.flatMap {
                delegate.source = $0
                let content = AVPictureInPictureController.ContentSource(sampleBufferDisplayLayer: $0.layer, playbackDelegate: delegate)
                return AVPictureInPictureController(contentSource: content)
            }
        case .none, .audio:
            next = nil
        }
        guard next !== controller else { return }
        possibleObservation = nil
        controller = next
        next?.delegate = delegate
        // The system may also stop the picture for good on its own: the button follows what iOS reports.
        isAvailable = next?.isPictureInPicturePossible ?? false
        possibleObservation = next?.observe(\.isPictureInPicturePossible) { [weak self] controller, _ in
            let possible = controller.isPictureInPicturePossible
            Task { @MainActor in self?.isAvailable = possible }
        }
    }

    /// Answers iOS for the picture window: lifecycle, and the transport of the software route, whose
    /// commands go through the service to keep its rules (no pause on live).
    @MainActor
    private final class Delegate: NSObject, AVPictureInPictureControllerDelegate, AVPictureInPictureSampleBufferPlaybackDelegate {
        weak var service: PlayerService?
        var source: SoftwarePiPSource?
        var onStateChange: ((Bool) -> Void)?

        func pictureInPictureControllerWillStartPictureInPicture(_ controller: AVPictureInPictureController) {
            onStateChange?(true)
        }

        /// The player screen hides only once the picture has started: hidden before, the video surface
        /// leaves the window and iOS gives up on the picture.
        func pictureInPictureControllerDidStartPictureInPicture(_ controller: AVPictureInPictureController) {
            service?.isMinimized = true
        }

        func pictureInPictureController(_ controller: AVPictureInPictureController, failedToStartPictureInPictureWithError error: any Error) {
            onStateChange?(false)
        }

        func pictureInPictureControllerDidStopPictureInPicture(_ controller: AVPictureInPictureController) {
            onStateChange?(false)
            service?.isMinimized = false
        }

        /// Out of the picture, the player screen comes back over the app.
        func pictureInPictureController(_ controller: AVPictureInPictureController, restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void) {
            service?.isMinimized = false
            completionHandler(true)
        }

        func pictureInPictureController(_ controller: AVPictureInPictureController, setPlaying playing: Bool) {
            guard let service else { return }
            if playing { if service.phase == .paused || service.phase == .ended { service.togglePlayPause() } } else { service.pause() }
        }

        func pictureInPictureControllerTimeRangeForPlayback(_ controller: AVPictureInPictureController) -> CMTimeRange {
            source?.timeRange() ?? CMTimeRange(start: .negativeInfinity, duration: .positiveInfinity)
        }

        func pictureInPictureControllerIsPlaybackPaused(_ controller: AVPictureInPictureController) -> Bool {
            source?.isPaused ?? true
        }

        func pictureInPictureController(_ controller: AVPictureInPictureController, didTransitionToRenderSize newRenderSize: CMVideoDimensions) { }

        func pictureInPictureController(_ controller: AVPictureInPictureController, skipByInterval skipInterval: CMTime, completion completionHandler: @escaping @Sendable () -> Void) {
            service?.seek(by: skipInterval.seconds)
            completionHandler()
        }
    }
}
#endif
