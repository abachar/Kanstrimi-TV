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
    @Binding var currentPosition: TimeInterval
    @Binding var totalDuration: TimeInterval
    @Binding var coordinator: Coordinator?
    @Binding var errorMessage: String?

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.backgroundColor = .black

        // Créer le media player VLC
        let mediaPlayer = VLCMediaPlayer()
        mediaPlayer.drawable = view
        mediaPlayer.delegate = context.coordinator

        // Créer le media depuis l'URL
        let media = VLCMedia(url: url)
        mediaPlayer.media = media

        // Stocker le player dans le context pour accès ultérieur
        context.coordinator.mediaPlayer = mediaPlayer

        // Exposer le coordinator via binding
        DispatchQueue.main.async {
            coordinator = context.coordinator
        }

        // Démarrer les mises à jour de position/durée
        context.coordinator.startPositionUpdates()

        // Lancer la lecture automatiquement
        mediaPlayer.play()

        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        // Pas de mise à jour nécessaire
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(currentPosition: $currentPosition, totalDuration: $totalDuration, errorMessage: $errorMessage)
    }

    static func dismantleUIView(_ uiView: UIView, coordinator: Coordinator) {
        // Cleanup : arrêter les mises à jour et la lecture
        coordinator.stopUpdates()
        coordinator.mediaPlayer?.stop()
        coordinator.mediaPlayer = nil
    }

    /// Coordinator pour gérer le lifecycle du VLCMediaPlayer
    class Coordinator: NSObject, VLCMediaPlayerDelegate {
        @Binding var currentPosition: TimeInterval
        @Binding var totalDuration: TimeInterval
        @Binding var errorMessage: String?

        var mediaPlayer: VLCMediaPlayer?
        private var updateTimer: Timer?

        init(currentPosition: Binding<TimeInterval>, totalDuration: Binding<TimeInterval>, errorMessage: Binding<String?>) {
            _currentPosition = currentPosition
            _totalDuration = totalDuration
            _errorMessage = errorMessage
        }

        func startPositionUpdates() {
            // Mise à jour toutes les secondes
            updateTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
                guard let self = self, let player = self.mediaPlayer else { return }

                // Mise à jour de la durée totale (en millisecondes)
                if player.media?.length.intValue ?? 0 > 0 {
                    self.totalDuration = Double(player.media?.length.intValue ?? 0) / 1000.0
                }

                // Mise à jour de la position actuelle (en millisecondes)
                if player.time.intValue > 0 {
                    self.currentPosition = Double(player.time.intValue) / 1000.0
                }
            }
        }

        func stopUpdates() {
            updateTimer?.invalidate()
            updateTimer = nil
        }

        // MARK: - Player Controls

        func seek(to time: TimeInterval) {
            guard let player = mediaPlayer else { return }
            // VLCTime attend des millisecondes
            let timeInMs = Int32(time * 1000)
            player.time = VLCTime(int: timeInMs)
        }

        // MARK: - Audio Tracks (VLC)

        func getAudioTracks() -> [(index: Int32, name: String)] {
            guard let player = mediaPlayer else { return [] }

            // Récupérer les indices des pistes audio
            guard let audioTrackIndexes = player.audioTrackIndexes as? [Int32] else { return [] }
            guard let audioTrackNames = player.audioTrackNames as? [String] else { return [] }

            // Combiner indices et noms
            return zip(audioTrackIndexes, audioTrackNames).map { (index: $0, name: $1) }
        }

        func getCurrentAudioTrackIndex() -> Int32? {
            return mediaPlayer?.currentAudioTrackIndex
        }

        func selectAudioTrack(index: Int32) {
            mediaPlayer?.currentAudioTrackIndex = index
        }

        // MARK: - Subtitle Tracks (VLC)

        func getSubtitleTracks() -> [(index: Int32, name: String)] {
            guard let player = mediaPlayer else { return [] }

            // Récupérer les indices des sous-titres
            guard let subtitleIndexes = player.videoSubTitlesIndexes as? [Int32] else { return [] }
            guard let subtitleNames = player.videoSubTitlesNames as? [String] else { return [] }

            // Combiner indices et noms
            return zip(subtitleIndexes, subtitleNames).map { (index: $0, name: $1) }
        }

        func getCurrentSubtitleTrackIndex() -> Int32? {
            return mediaPlayer?.currentVideoSubTitleIndex
        }

        func selectSubtitleTrack(index: Int32) {
            mediaPlayer?.currentVideoSubTitleIndex = index
        }

        // MARK: - VLCMediaPlayerDelegate

        func mediaPlayerStateChanged(_ notification: Notification) {
            guard let player = notification.object as? VLCMediaPlayer else { return }

            switch player.state {
            case .error:
                DispatchQueue.main.async {
                    self.errorMessage = "Une erreur s'est produite lors de la lecture avec VLC. Le format du média n'est peut-être pas supporté."
                }
            case .ended:
                // Le media est terminé, pas d'erreur
                break
            case .stopped:
                // Le media a été arrêté, pas d'erreur
                break
            default:
                break
            }
        }
    }
}
