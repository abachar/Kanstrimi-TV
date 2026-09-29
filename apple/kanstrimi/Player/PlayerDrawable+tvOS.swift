#if os(tvOS)
import UIKit

extension PlayerService {
    /// A plain black view: tvOS has no Picture-in-Picture to wire.
    static func makeDrawable() -> UIView { makeBlackSurface() }
}
#endif
