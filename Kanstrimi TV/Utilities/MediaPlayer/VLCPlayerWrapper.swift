//
//  VLCPlayerWrapper.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 27/10/2025.
//

import SwiftUI
import TVVLCKit

/// Wrapper SwiftUI pour VLCMediaPlayer (TVVLCKit)
struct VLCPlayerWrapper: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.backgroundColor = .black

        // Créer le media player VLC
        let mediaPlayer = VLCMediaPlayer()
        mediaPlayer.drawable = view

        // Créer le media depuis l'URL
        let media = VLCMedia(url: url)
        mediaPlayer.media = media

        // Stocker le player dans le context pour accès ultérieur
        context.coordinator.mediaPlayer = mediaPlayer

        // Lancer la lecture automatiquement
        mediaPlayer.play()

        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        // Pas de mise à jour nécessaire
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    static func dismantleUIView(_ uiView: UIView, coordinator: Coordinator) {
        // Cleanup : arrêter la lecture
        coordinator.mediaPlayer?.stop()
        coordinator.mediaPlayer = nil
    }

    /// Coordinator pour gérer le lifecycle du VLCMediaPlayer
    class Coordinator {
        var mediaPlayer: VLCMediaPlayer?
    }
}
