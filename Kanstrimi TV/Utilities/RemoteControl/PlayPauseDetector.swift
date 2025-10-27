//
//  PlayPauseDetector.swift
//  Kanstrimi TV
//
//  Created by Claude on 27/10/2025.
//

import Foundation
import Observation

/// Détecteur de double tap sur le bouton Play/Pause de la télécommande tvOS
///
/// Usage:
/// ```swift
/// @State private var playPauseDetector = PlayPauseDetector()
///
/// .onPlayPauseCommand {
///     playPauseDetector.handlePress {
///         print("Simple tap")
///     } onDoubleTap: {
///         print("Double tap détecté!")
///     }
/// }
/// ```
@Observable
class PlayPauseDetector {
    // MARK: - Properties

    /// Timestamp du dernier tap
    private var lastTapTime: Date?

    /// Délai maximum entre deux taps pour considérer un double tap (en secondes)
    private let doubleTapThreshold: TimeInterval = 0.3

    /// Timer pour exécuter le simple tap après le délai
    private var singleTapTimer: Timer?

    // MARK: - Methods

    /// Gère un press du bouton Play/Pause et détecte s'il s'agit d'un simple ou double tap
    /// - Parameters:
    ///   - onSingleTap: Closure exécutée lors d'un simple tap
    ///   - onDoubleTap: Closure exécutée lors d'un double tap
    func handlePress(onSingleTap: @escaping () -> Void, onDoubleTap: @escaping () -> Void) {
        let now = Date()

        // Annule le timer du simple tap précédent si existant
        singleTapTimer?.invalidate()
        singleTapTimer = nil

        if let lastTap = lastTapTime, now.timeIntervalSince(lastTap) < doubleTapThreshold {
            // Double tap détecté !
            lastTapTime = nil
            onDoubleTap()
        } else {
            // Premier tap, attendre pour voir s'il y a un deuxième
            lastTapTime = now

            // Programme l'exécution du simple tap après le délai
            singleTapTimer = Timer.scheduledTimer(withTimeInterval: doubleTapThreshold, repeats: false) { [weak self] _ in
                self?.lastTapTime = nil
                onSingleTap()
            }
        }
    }

    /// Réinitialise l'état du détecteur
    func reset() {
        singleTapTimer?.invalidate()
        singleTapTimer = nil
        lastTapTime = nil
    }

    deinit {
        singleTapTimer?.invalidate()
    }
}
