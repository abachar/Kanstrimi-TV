import SwiftUI

@main
struct kanstrimiApp: App {
    @State private var environment = AppEnvironment()
    // This `#if` cannot move to a +iOS file: an adaptor is a stored property.
    #if os(iOS)
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    #endif

    init() {
        // AsyncImage goes through URLCache.shared, ~10 MB of disk by default: posters and logos
        // (`/img`, cached a year by the server) were fetched again at each launch. The API answers
        // `no-store`, so only images land here.
        URLCache.shared = URLCache(memoryCapacity: 64 * 1024 * 1024, diskCapacity: 512 * 1024 * 1024)
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(environment)
                .preferredColorScheme(.dark)
                .tint(Theme.text)
        }
    }
}
