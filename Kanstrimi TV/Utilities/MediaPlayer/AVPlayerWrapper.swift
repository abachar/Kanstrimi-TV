//
//  AVPlayerWrapper.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 27/10/2025.
//

import SwiftUI
import AVKit
import Combine

/// Wrapper SwiftUI pour AVPlayerViewController natif tvOS
struct AVPlayerWrapper: UIViewControllerRepresentable {
    let url: URL
    @Binding var currentPosition: TimeInterval
    @Binding var totalDuration: TimeInterval
    @Binding var playerController: AVPlayerViewController?
    @Binding var coordinator: Coordinator?
    @Binding var errorMessage: String?

    func makeUIViewController(context: Context) -> AVPlayerViewController {
        let controller = AVPlayerViewController()
        let player = AVPlayer(url: url)
        controller.player = player

        // Configuration pour tvOS
        controller.allowsPictureInPicturePlayback = false
        controller.showsPlaybackControls = false // Désactivé car on utilise PlayerOverlay

        // Stocker le player dans le coordinator
        context.coordinator.player = player
        context.coordinator.controller = controller

        // Exposer le controller et coordinator via bindings
        DispatchQueue.main.async {
            playerController = controller
            coordinator = context.coordinator
        }

        // Observer la durée totale
        context.coordinator.observeDuration(player: player)

        // Observer la position actuelle (mise à jour toutes les secondes)
        context.coordinator.startPositionUpdates(player: player)

        // Observer les erreurs
        context.coordinator.observeErrors(player: player)

        // Lancer la lecture automatiquement
        player.play()

        return controller
    }

    func updateUIViewController(_ uiViewController: AVPlayerViewController, context: Context) {
        // Pas de mise à jour nécessaire
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(currentPosition: $currentPosition, totalDuration: $totalDuration, errorMessage: $errorMessage)
    }

    static func dismantleUIViewController(_ uiViewController: AVPlayerViewController, coordinator: Coordinator) {
        // Cleanup : arrêter les observers et la lecture
        coordinator.stopObserving()
        uiViewController.player?.pause()
        uiViewController.player = nil
    }

    /// Coordinator pour gérer les observers du player
    class Coordinator {
        @Binding var currentPosition: TimeInterval
        @Binding var totalDuration: TimeInterval
        @Binding var errorMessage: String?

        var player: AVPlayer?
        var controller: AVPlayerViewController?
        private var timeObserver: Any?
        private var durationObserver: AnyCancellable?
        private var errorObserver: AnyCancellable?
        private var statusObserver: AnyCancellable?

        init(currentPosition: Binding<TimeInterval>, totalDuration: Binding<TimeInterval>, errorMessage: Binding<String?>) {
            _currentPosition = currentPosition
            _totalDuration = totalDuration
            _errorMessage = errorMessage
        }

        func observeDuration(player: AVPlayer) {
            durationObserver = player.currentItem?.publisher(for: \.duration)
                .sink { [weak self] duration in
                    guard let self = self, duration.isNumeric else { return }
                    DispatchQueue.main.async {
                        self.totalDuration = duration.seconds
                    }
                }
        }

        func startPositionUpdates(player: AVPlayer) {
            let interval = CMTime(seconds: 1.0, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
            timeObserver = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
                guard let self = self else { return }
                self.currentPosition = time.seconds
            }
        }

        func observeErrors(player: AVPlayer) {
            // Observer les erreurs du player item
            errorObserver = player.currentItem?.publisher(for: \.error)
                .sink { [weak self] error in
                    guard let self = self, let error = error else { return }
                    DispatchQueue.main.async {
                        self.errorMessage = self.formatError(error)
                    }
                }

            // Observer le statut du player item
            statusObserver = player.currentItem?.publisher(for: \.status)
                .sink { [weak self] status in
                    guard let self = self else { return }
                    if status == .failed, let error = player.currentItem?.error {
                        DispatchQueue.main.async {
                            self.errorMessage = self.formatError(error)
                        }
                    }
                }
        }

        private func formatError(_ error: Error) -> String {
            let nsError = error as NSError

            switch nsError.code {
            case -1009: // NSURLErrorNotConnectedToInternet
                return "Aucune connexion Internet. Vérifiez votre réseau et réessayez."
            case -1001: // NSURLErrorTimedOut
                return "La connexion a expiré. Le serveur ne répond pas."
            case -1004: // NSURLErrorCannotConnectToHost
                return "Impossible de se connecter au serveur. Vérifiez l'URL."
            case -11800: // AVErrorUnknown
                return "Une erreur inconnue s'est produite lors de la lecture."
            case -11850: // AVErrorMediaServicesWereReset
                return "Les services média ont été réinitialisés. Réessayez."
            case -11828: // AVErrorSessionNotRunning
                return "La session de lecture n'est pas active."
            default:
                return "Erreur de lecture: \(error.localizedDescription)"
            }
        }

        func stopObserving() {
            if let observer = timeObserver, let player = player {
                player.removeTimeObserver(observer)
                timeObserver = nil
            }
            durationObserver?.cancel()
            errorObserver?.cancel()
            statusObserver?.cancel()
        }

        // MARK: - Player Controls

        func seek(to time: TimeInterval) {
            let cmTime = CMTime(seconds: time, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
            player?.seek(to: cmTime)
        }

        func getAudioTracks() -> [AVMediaSelectionOption] {
            guard let group = player?.currentItem?.asset.mediaSelectionGroup(forMediaCharacteristic: .audible) else {
                return []
            }
            return group.options
        }

        func getCurrentAudioTrack() -> AVMediaSelectionOption? {
            guard let group = player?.currentItem?.asset.mediaSelectionGroup(forMediaCharacteristic: .audible) else {
                return nil
            }
            return player?.currentItem?.selectedMediaOption(in: group)
        }

        func selectAudioTrack(_ option: AVMediaSelectionOption?) {
            guard let group = player?.currentItem?.asset.mediaSelectionGroup(forMediaCharacteristic: .audible) else {
                return
            }
            player?.currentItem?.select(option, in: group)
        }

        func getSubtitleTracks() -> [AVMediaSelectionOption] {
            guard let group = player?.currentItem?.asset.mediaSelectionGroup(forMediaCharacteristic: .legible) else {
                return []
            }
            return group.options
        }

        func getCurrentSubtitleTrack() -> AVMediaSelectionOption? {
            guard let group = player?.currentItem?.asset.mediaSelectionGroup(forMediaCharacteristic: .legible) else {
                return nil
            }
            return player?.currentItem?.selectedMediaOption(in: group)
        }

        func selectSubtitleTrack(_ option: AVMediaSelectionOption?) {
            guard let group = player?.currentItem?.asset.mediaSelectionGroup(forMediaCharacteristic: .legible) else {
                return
            }
            player?.currentItem?.select(option, in: group)
        }
    }
}
