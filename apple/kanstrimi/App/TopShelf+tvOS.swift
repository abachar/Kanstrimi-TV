#if os(tvOS)
import TVServices

extension AppEnvironment {
    /// The Top Shelf reads the token and the server address from the shared Keychain, then asks the server.
    func shareWithTopShelf() {
        device.share(serverURL: preferences.serverURL)
        topShelfDidChange()
    }

    /// A playback ended or the pairing changed: tvOS asks the extension again.
    func topShelfDidChange() {
        TVTopShelfContentProvider.topShelfContentDidChange()
    }
}
#endif
