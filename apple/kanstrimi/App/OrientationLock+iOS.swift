#if os(iOS)
import SwiftUI
import UIKit

/// The app is portrait, the player landscape. UIKit asks the delegate for the allowed
/// orientations; the player flips the mask on appearance and asks the scene to rotate.
final class AppDelegate: NSObject, UIApplicationDelegate {
    static var orientations: UIInterfaceOrientationMask = .portrait

    func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
        Self.orientations
    }
}

enum OrientationLock {
    static func set(_ mask: UIInterfaceOrientationMask) {
        AppDelegate.orientations = mask
        guard let scene = UIApplication.shared.connectedScenes.first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene
                ?? UIApplication.shared.connectedScenes.first as? UIWindowScene else { return }
        // The presented controller (the player's cover) is the one UIKit consults.
        var top = scene.keyWindow?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        top?.setNeedsUpdateOfSupportedInterfaceOrientations()
        scene.requestGeometryUpdate(.iOS(interfaceOrientations: mask)) { _ in }
    }
}

extension View {
    /// Landscape while this view is on screen, portrait again when it leaves.
    func lockLandscape() -> some View {
        onAppear { OrientationLock.set(.landscape) }
            .onDisappear { OrientationLock.set(.portrait) }
    }
}
#endif
