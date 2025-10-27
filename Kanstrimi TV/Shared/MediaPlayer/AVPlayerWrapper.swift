//
//  AVPlayerWrapper.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 27/10/2025.
//

import SwiftUI
import AVKit

/// Wrapper SwiftUI pour AVPlayerViewController natif tvOS
struct AVPlayerWrapper: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> AVPlayerViewController {
        let controller = AVPlayerViewController()
        let player = AVPlayer(url: url)
        controller.player = player

        // Configuration pour tvOS
        controller.allowsPictureInPicturePlayback = false
        controller.showsPlaybackControls = true

        // Lancer la lecture automatiquement
        player.play()

        return controller
    }

    func updateUIViewController(_ uiViewController: AVPlayerViewController, context: Context) {
        // Pas de mise à jour nécessaire
    }

    static func dismantleUIViewController(_ uiViewController: AVPlayerViewController, coordinator: ()) {
        // Cleanup : arrêter la lecture
        uiViewController.player?.pause()
        uiViewController.player = nil
    }
}
