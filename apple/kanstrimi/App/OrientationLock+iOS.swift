#if os(iOS)
import SwiftUI
import UIKit

/// The app is portrait; the player follows the phone, upright or sideways. UIKit asks the delegate for
/// the allowed orientations; the player widens the mask on appearance and can ask the scene to rotate.
final class AppDelegate: NSObject, UIApplicationDelegate {
    static var orientations: UIInterfaceOrientationMask = .portrait

    func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
        Self.orientations
    }
}

enum OrientationLock {
    /// The orientations allowed from now on; the interface turns to one of them if it has to.
    static func set(_ mask: UIInterfaceOrientationMask) {
        AppDelegate.orientations = mask
        guard let scene else { return }
        // The presented controller (the player's cover) is the one UIKit consults.
        topController(in: scene)?.setNeedsUpdateOfSupportedInterfaceOrientations()
        scene.requestGeometryUpdate(.iOS(interfaceOrientations: mask)) { _ in }
    }

    /// Turns the interface now (the full-screen button) without narrowing what is allowed: turning the
    /// phone afterwards still rotates it.
    static func rotate(to mask: UIInterfaceOrientationMask) {
        guard let scene else { return }
        topController(in: scene)?.setNeedsUpdateOfSupportedInterfaceOrientations()
        scene.requestGeometryUpdate(.iOS(interfaceOrientations: mask)) { error in NSLog("rotate: %@", error.localizedDescription) }
    }

    private static func topController(in scene: UIWindowScene) -> UIViewController? {
        var top = scene.keyWindow?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }

    private static var scene: UIWindowScene? {
        UIApplication.shared.connectedScenes.first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene
            ?? UIApplication.shared.connectedScenes.first as? UIWindowScene
    }
}

extension View {
    /// Upright or sideways while this view is on screen, upright again when it leaves.
    func allowsRotation() -> some View {
        onAppear { OrientationLock.set(.allButUpsideDown) }
            .onDisappear { OrientationLock.set(.portrait) }
    }
}
#endif
