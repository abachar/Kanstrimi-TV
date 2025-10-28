//
//  RemoteControlHandler.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 28/10/2025.
//

import SwiftUI
import Combine
import GameController

/// Gestionnaire des événements de la télécommande Apple TV
class RemoteControlHandler: ObservableObject {
    @Published var isPlaying: Bool = true

    private var onPlayPause: (() -> Void)?
    private var onMenu: (() -> Void)?
    private var onSelect: (() -> Void)?
    private var onSwipeUp: (() -> Void)?
    private var onSwipeDown: (() -> Void)?
    private var onSwipeLeft: (() -> Void)?
    private var onSwipeRight: (() -> Void)?

    init() {
        setupRemoteEvents()
    }

    deinit {
        removeRemoteEvents()
    }

    private func setupRemoteEvents() {
        // Observer les contrôleurs de jeu (la télécommande Apple TV est considérée comme un contrôleur)
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(controllerDidConnect),
            name: .GCControllerDidConnect,
            object: nil
        )

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(controllerDidDisconnect),
            name: .GCControllerDidDisconnect,
            object: nil
        )

        // Si un contrôleur est déjà connecté, le configurer
        if let controller = GCController.controllers().first {
            configureController(controller)
        }
    }

    private func removeRemoteEvents() {
        NotificationCenter.default.removeObserver(self)
    }

    @objc private func controllerDidConnect(_ notification: Notification) {
        guard let controller = notification.object as? GCController else { return }
        configureController(controller)
    }

    @objc private func controllerDidDisconnect(_ notification: Notification) {
        // Cleanup si nécessaire
    }

    private func configureController(_ controller: GCController) {
        guard let microGamepad = controller.microGamepad else { return }

        // Play/Pause (bouton Play/Pause)
        microGamepad.buttonMenu.pressedChangedHandler = { [weak self] (button, value, pressed) in
            if pressed {
                DispatchQueue.main.async {
                    self?.onMenu?()
                }
            }
        }

        // Select (clic sur le touchpad)
        microGamepad.buttonA.pressedChangedHandler = { [weak self] (button, value, pressed) in
            if pressed {
                DispatchQueue.main.async {
                    self?.onSelect?()
                }
            }
        }

        // D-pad (directions)
        microGamepad.dpad.up.pressedChangedHandler = { [weak self] (button, value, pressed) in
            if pressed {
                DispatchQueue.main.async {
                    self?.onSwipeUp?()
                }
            }
        }

        microGamepad.dpad.down.pressedChangedHandler = { [weak self] (button, value, pressed) in
            if pressed {
                DispatchQueue.main.async {
                    self?.onSwipeDown?()
                }
            }
        }

        microGamepad.dpad.left.pressedChangedHandler = { [weak self] (button, value, pressed) in
            if pressed {
                DispatchQueue.main.async {
                    self?.onSwipeLeft?()
                }
            }
        }

        microGamepad.dpad.right.pressedChangedHandler = { [weak self] (button, value, pressed) in
            if pressed {
                DispatchQueue.main.async {
                    self?.onSwipeRight?()
                }
            }
        }
    }

    // MARK: - Configuration des handlers

    func setPlayPauseHandler(_ handler: @escaping () -> Void) {
        onPlayPause = handler
    }

    func setMenuHandler(_ handler: @escaping () -> Void) {
        onMenu = handler
    }

    func setSelectHandler(_ handler: @escaping () -> Void) {
        onSelect = handler
    }

    func setSwipeUpHandler(_ handler: @escaping () -> Void) {
        onSwipeUp = handler
    }

    func setSwipeDownHandler(_ handler: @escaping () -> Void) {
        onSwipeDown = handler
    }

    func setSwipeLeftHandler(_ handler: @escaping () -> Void) {
        onSwipeLeft = handler
    }

    func setSwipeRightHandler(_ handler: @escaping () -> Void) {
        onSwipeRight = handler
    }
}
