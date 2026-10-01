#if os(tvOS)
import Observation

/// tvOS has no Picture-in-Picture to wire: every member is inert.
@Observable
final class PictureInPicture {
    init() { }
    func attach(to service: PlayerService) { }
    var isAvailable: Bool { false }
    func start() { }
}
#endif
