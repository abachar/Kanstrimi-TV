#if os(macOS)
import AppKit

extension PlayerService {
    /// A plain black view: Picture-in-Picture is the window itself on the Mac.
    static func makeDrawable() -> NSView { makeBlackSurface() }
}
#endif
