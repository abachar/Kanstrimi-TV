//
//  PlayerEnvironment.swift
//  Kanstrimi TV
//
//  Created by Claude on 02/11/2025.
//

import SwiftUI

/// Environment key pour exposer le binding du MediaPlayerView
private struct ShowPlayerKey: EnvironmentKey {
    static let defaultValue: Binding<PlaybackContent?> = .constant(nil)
}

extension EnvironmentValues {
    /// Binding pour afficher le MediaPlayerView en fullScreenCover
    ///
    /// Permet d'ouvrir le lecteur vidéo depuis n'importe quelle vue :
    /// ```swift
    /// @Environment(\.showPlayer) private var showPlayer
    ///
    /// // Lire un film
    /// showPlayer.wrappedValue = .movie(movieDetail)
    ///
    /// // Lire une série
    /// showPlayer.wrappedValue = .episode(episode, seriesName: "...", ...)
    ///
    /// // Lire une chaîne live
    /// showPlayer.wrappedValue = .liveChannel(channel)
    /// ```
    var showPlayer: Binding<PlaybackContent?> {
        get { self[ShowPlayerKey.self] }
        set { self[ShowPlayerKey.self] = newValue }
    }
}
