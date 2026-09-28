import SwiftUI

@main
struct kanstrimiApp: App {
    @State private var environment = AppEnvironment()
    // The one `#if` outside Platform.swift and the +iOS/+tvOS files: an adaptor is a stored property.
    #if os(iOS)
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    #endif

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(environment)
                .preferredColorScheme(.dark)
                .tint(Theme.text)
        }
    }
}
