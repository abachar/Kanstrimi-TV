//
//  View+PlayPauseDoubleTap.swift
//  Kanstrimi TV
//
//  Created by Claude on 27/10/2025.
//

import SwiftUI

extension View {
    /// Détecte un double tap sur le bouton Play/Pause de la télécommande tvOS
    ///
    /// Usage:
    /// ```swift
    /// ContentView()
    ///     .onPlayPauseDoubleTap {
    ///         // Action lors du double tap
    ///         showSearchView = true
    ///     }
    /// ```
    ///
    /// - Parameter action: Closure exécutée lors d'un double tap Play/Pause
    /// - Returns: Vue modifiée avec détection du double tap
    func onPlayPauseDoubleTap(perform action: @escaping () -> Void) -> some View {
        modifier(PlayPauseDoubleTapModifier(action: action))
    }
}

// MARK: - PlayPauseDoubleTapModifier

/// Modifier SwiftUI pour détecter le double tap Play/Pause
private struct PlayPauseDoubleTapModifier: ViewModifier {
    let action: () -> Void

    @State private var detector = PlayPauseDetector()

    func body(content: Content) -> some View {
        content
            .onPlayPauseCommand {
                detector.handlePress {
                    // Simple tap - Ne rien faire
                } onDoubleTap: {
                    // Double tap - Exécuter l'action
                    action()
                }
            }
    }
}
