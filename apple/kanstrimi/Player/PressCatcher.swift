#if os(tvOS)
import SwiftUI
import UIKit

/// Hosts SwiftUI content under a view that owns long-press recognizers for remote buttons,
/// so "▼ long" and friends work regardless of which SwiftUI element has focus.
struct PressCatcher<Content: View>: UIViewControllerRepresentable {
    let content: Content
    var onLongPress: (UIPress.PressType) -> Void
    var pressTypes: [UIPress.PressType] = [.downArrow]

    init(pressTypes: [UIPress.PressType] = [.downArrow], onLongPress: @escaping (UIPress.PressType) -> Void, @ViewBuilder content: () -> Content) {
        self.pressTypes = pressTypes
        self.onLongPress = onLongPress
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
    }

    func makeCoordinator() -> Coordinator { Coordinator(onLongPress: onLongPress) }

    final class Coordinator: NSObject {
        var onLongPress: (UIPress.PressType) -> Void
        init(onLongPress: @escaping (UIPress.PressType) -> Void) { self.onLongPress = onLongPress }

        @objc func handle(_ recognizer: UILongPressGestureRecognizer) {
            guard recognizer.state == .began,
                  let raw = recognizer.allowedPressTypes.first?.intValue,
                  let type = UIPress.PressType(rawValue: raw) else { return }
            onLongPress(type)
        }
    }
}
#endif
