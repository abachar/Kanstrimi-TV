#if os(tvOS)
import SwiftUI
import UIKit

/// Hosts SwiftUI content under a view that owns long-press recognizers for remote buttons,
/// so "▼ long" and friends work regardless of which SwiftUI element has focus.
struct PressCatcher<Content: View>: UIViewControllerRepresentable {
    let content: Content
    var onLongPress: (UIPress.PressType) -> Void
    /// The end of a long press, for the gestures that last as long as the button is held.
    var onRelease: (UIPress.PressType) -> Void = { _ in }
    var pressTypes: [UIPress.PressType] = [.downArrow]

    init(pressTypes: [UIPress.PressType] = [.downArrow], onLongPress: @escaping (UIPress.PressType) -> Void,
         onRelease: @escaping (UIPress.PressType) -> Void = { _ in }, @ViewBuilder content: () -> Content) {
        self.pressTypes = pressTypes
        self.onLongPress = onLongPress
        self.onRelease = onRelease
        self.content = content()
    }

    func makeUIViewController(context: Context) -> UIHostingController<Content> {
        let host = UIHostingController(rootView: content)
        host.view.backgroundColor = .clear
        for type in pressTypes {
            let recognizer = UILongPressGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handle(_:)))
            recognizer.allowedPressTypes = [NSNumber(value: type.rawValue)]
            recognizer.minimumPressDuration = 0.7
            recognizer.cancelsTouchesInView = false
            host.view.addGestureRecognizer(recognizer)
        }
        return host
    }

    func updateUIViewController(_ controller: UIHostingController<Content>, context: Context) {
        controller.rootView = content
        context.coordinator.onLongPress = onLongPress
        context.coordinator.onRelease = onRelease
    }

    func makeCoordinator() -> Coordinator { Coordinator(onLongPress: onLongPress, onRelease: onRelease) }

    final class Coordinator: NSObject {
        var onLongPress: (UIPress.PressType) -> Void
        var onRelease: (UIPress.PressType) -> Void
        init(onLongPress: @escaping (UIPress.PressType) -> Void, onRelease: @escaping (UIPress.PressType) -> Void) {
            self.onLongPress = onLongPress
            self.onRelease = onRelease
        }

        @objc func handle(_ recognizer: UILongPressGestureRecognizer) {
            guard let raw = recognizer.allowedPressTypes.first?.intValue,
                  let type = UIPress.PressType(rawValue: raw) else { return }
            switch recognizer.state {
            case .began: onLongPress(type)
            case .ended, .cancelled, .failed: onRelease(type)
            default: break
            }
        }
    }
}
#endif
