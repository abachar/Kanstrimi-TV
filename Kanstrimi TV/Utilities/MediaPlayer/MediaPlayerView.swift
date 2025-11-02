//
//  MediaPlayerView.swift
//  Kanstrimi TV
//
//  Created by Abdelhakim Bachar on 27/10/2025.
//

import SwiftUI
import AVKit
import SwiftData
import TVVLCKit

/// Vue principale du player universel avec overlay (Phase 3)
/// Détecte automatiquement le type de player (AVPlayer ou VLC) selon le format
struct MediaPlayerView: View {
    @State private var content: PlaybackContent
    @Environment(\.dismiss) private var dismiss
    @Environment(\.domainService) private var domainService
    @Query private var playerSettingsQuery: [PlayerSettings]

    init(content: PlaybackContent) {
        _content = State(initialValue: content)
    }

    private var playerSettings: PlayerSettings {
        playerSettingsQuery.first ?? PlayerSettings()
    }

    private var bufferSize: Int {
        content.contentType == .live
            ? playerSettings.liveBufferSize
            : playerSettings.vodBufferSize
    }

    // État de l'overlay
    @State private var isOverlayVisible: Bool = true
    @State private var currentPosition: TimeInterval = 0
    @State private var totalDuration: TimeInterval = 0
    @State private var autoHideTask: Task<Void, Never>?

    // État du buffering
    @State private var isBuffering: Bool = false
    @State private var bufferProgress: Double = 0.0
    @State private var bufferedDuration: TimeInterval = 0.0

    // État du focus overlay
    @State private var overlayFocusedElement: PlayerOverlay.FocusableElement? = nil

    // État des modales
    @State private var showingAudioSelector: Bool = false
    @State private var showingSubtitleSelector: Bool = false
    @State private var showingInfoPanel: Bool = false

    // État des erreurs
    @State private var errorMessage: String?

    // Player controller et coordinator (pour AVPlayer uniquement)
    @State private var avPlayerController: AVPlayerViewController?
    @State private var avPlayerCoordinator: AVPlayerWrapper.Coordinator?

    // VLC coordinator
    @State private var vlcPlayerCoordinator: VLCPlayerWrapper.Coordinator?

    // WatchHistory timer
    @State private var watchHistoryTimer: Timer?

    // Remote control handler
    @StateObject private var remoteHandler = RemoteControlHandler()

    // Détection du type de player
    private var playerType: VideoPlayerType {
        VideoPlayerType.detect(from: content.streamURL)
    }

    // URL du stream
    private var streamURL: URL? {
        URL(string: content.streamURL)
    }

    var body: some View {
        ZStack {
            Color.black
                .ignoresSafeArea()

            if let url = streamURL {
                // Player layer
                playerLayer(url: url)

                // Overlay layer
                overlayView

                // Modales
                if showingAudioSelector {
                    audioSelectorView
                }

                if showingSubtitleSelector {
                    subtitleSelectorView
                }

                if showingInfoPanel {
                    infoPanelView
                }

                // Overlay d'erreur
                if errorMessage != nil {
                    errorOverlayView
                }
            } else {
                // Erreur : URL invalide
                errorView
            }
        }
        .onAppear {
            startAutoHideTimer()
            loadWatchHistoryAndResume()
            startWatchHistoryUpdates()
            setupRemoteHandlers()
        }
        .onDisappear {
            autoHideTask?.cancel()
            stopWatchHistoryUpdates()
            saveWatchHistoryOnExit()
        }
        .onChange(of: isBuffering) { oldValue, newValue in
            if newValue {
                // Buffering détecté → afficher l'overlay
                withAnimation(.easeInOut(duration: 0.3)) {
                    isOverlayVisible = true
                }
                // Ne pas lancer l'auto-hide timer pendant le buffering
                autoHideTask?.cancel()
            } else if oldValue {
                // Buffering terminé → relancer l'auto-hide si l'overlay est visible
                if isOverlayVisible {
                    startAutoHideTimer()
                }
            }
        }
    }

    // MARK: - Overlay View
    @ViewBuilder
    private var overlayView: some View {
        PlayerOverlay(
            content: content,
            currentPosition: currentPosition,
            totalDuration: totalDuration,
            isVisible: $isOverlayVisible,
            isBuffering: isBuffering,
            bufferProgress: bufferProgress,
            bufferedDuration: bufferedDuration,
            playerType: playerType,
            onResetAutoHide: resetAutoHideTimer,
            onSeek: handleSeek,
            onAudioTapped: handleAudioTapped,
            onSubtitlesTapped: handleSubtitlesTapped,
            onResumeTapped: handleResumeTapped,
            onPreviousEpisodeTapped: previousEpisodeHandler,
            onNextEpisodeTapped: nextEpisodeHandler,
            onInfoTapped: handleInfoTapped,
            onFocusChanged: { newFocus in
                overlayFocusedElement = newFocus
            }
        )
    }

    private var previousEpisodeHandler: (() -> Void)? {
        guard content.episodeNavigation?.previous != nil else { return nil }
        return handlePreviousEpisode
    }

    private var nextEpisodeHandler: (() -> Void)? {
        guard content.episodeNavigation?.next != nil else { return nil }
        return handleNextEpisode
    }

    // MARK: - Player Layer
    @ViewBuilder
    private func playerLayer(url: URL) -> some View {
        switch playerType {
        case .avPlayer:
            AVPlayerWrapper(
                url: url,
                bufferSize: bufferSize,
                currentPosition: $currentPosition,
                totalDuration: $totalDuration,
                playerController: $avPlayerController,
                coordinator: $avPlayerCoordinator,
                errorMessage: $errorMessage,
                isBuffering: $isBuffering,
                bufferProgress: $bufferProgress,
                bufferedDuration: $bufferedDuration
            )
            .ignoresSafeArea()

        case .vlcPlayer:
            VLCPlayerWrapper(
                url: url,
                bufferSize: bufferSize,
                currentPosition: $currentPosition,
                totalDuration: $totalDuration,
                coordinator: $vlcPlayerCoordinator,
                errorMessage: $errorMessage,
                isBuffering: $isBuffering,
                bufferProgress: $bufferProgress,
                bufferedDuration: $bufferedDuration
            )
            .ignoresSafeArea()
        }
    }

    // MARK: - Audio Selector View
    @ViewBuilder
    private var audioSelectorView: some View {
        switch playerType {
        case .avPlayer:
            if let coordinator = avPlayerCoordinator {
                AVAudioTrackSelector(
                    audioTracks: coordinator.getAudioTracks(),
                    currentTrack: coordinator.getCurrentAudioTrack(),
                    onSelect: { track in
                        coordinator.selectAudioTrack(track)
                    },
                    onDismiss: {
                        showingAudioSelector = false
                    }
                )
            }
        case .vlcPlayer:
            if let coordinator = vlcPlayerCoordinator {
                VLCAudioTrackSelector(
                    audioTracks: coordinator.getAudioTracks(),
                    currentTrackIndex: coordinator.getCurrentAudioTrackIndex(),
                    onSelect: { index in
                        coordinator.selectAudioTrack(index: index)
                    },
                    onDismiss: {
                        showingAudioSelector = false
                    }
                )
            }
        }
    }

    // MARK: - Subtitle Selector View
    @ViewBuilder
    private var subtitleSelectorView: some View {
        switch playerType {
        case .avPlayer:
            if let coordinator = avPlayerCoordinator {
                AVSubtitleSelector(
                    subtitleTracks: coordinator.getSubtitleTracks(),
                    currentTrack: coordinator.getCurrentSubtitleTrack(),
                    onSelect: { track in
                        coordinator.selectSubtitleTrack(track)
                    },
                    onDismiss: {
                        showingSubtitleSelector = false
                    }
                )
            }
        case .vlcPlayer:
            if let coordinator = vlcPlayerCoordinator {
                VLCSubtitleSelector(
                    subtitleTracks: coordinator.getSubtitleTracks(),
                    currentTrackIndex: coordinator.getCurrentSubtitleTrackIndex(),
                    onSelect: { index in
                        coordinator.selectSubtitleTrack(index: index)
                    },
                    onDismiss: {
                        showingSubtitleSelector = false
                    }
                )
            }
        }
    }

    // MARK: - Info Panel View
    @ViewBuilder
    private var infoPanelView: some View {
        InfoPanel(
            content: content,
            onDismiss: {
                showingInfoPanel = false
            }
        )
    }

    // MARK: - Error Overlay View
    @ViewBuilder
    private var errorOverlayView: some View {
        if let errorMessage = errorMessage {
            PlayerErrorView(
                errorMessage: errorMessage,
                onRetry: handleRetry,
                onDismiss: handleErrorDismiss
            )
        }
    }

    // MARK: - Error View
    private var errorView: some View {
        VStack(spacing: 30) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 80))
                .foregroundColor(.red)

            Text("URL de stream invalide")
                .font(.title2)
                .foregroundColor(.primary)

            Text(content.streamURL)
                .font(.caption)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 60)

            Button("Fermer") {
                dismiss()
            }
            .buttonStyle(.bordered)
        }
    }

    // MARK: - Auto-hide Timer
    private func startAutoHideTimer() {
        autoHideTask?.cancel()
        autoHideTask = Task {
            try? await Task.sleep(for: .seconds(5))
            if !Task.isCancelled {
                await MainActor.run {
                    withAnimation(.easeInOut(duration: 0.3)) {
                        isOverlayVisible = false
                    }
                }
            }
        }
    }

    private func resetAutoHideTimer() {
        withAnimation(.easeInOut(duration: 0.3)) {
            isOverlayVisible = true
        }
        startAutoHideTimer()
    }

    // MARK: - Watch History
    private func loadWatchHistoryAndResume() {
        // Ne charger que pour VOD
        guard content.contentType == .vod else { return }

        Task {
            if let history = await domainService.getWatchHistory(content: content),
               !history.isCompleted {
                // Reprendre à la dernière position
                await MainActor.run {
                    handleSeek(history.lastPosition)
                }
            }
        }
    }

    private func startWatchHistoryUpdates() {
        // Ne sauvegarder que pour VOD
        guard content.contentType == .vod else { return }

        watchHistoryTimer = Timer.scheduledTimer(withTimeInterval: 10.0, repeats: true) { [content] _ in
            Task {
                await domainService.saveWatchHistory(
                    content: content,
                    position: currentPosition,
                    duration: totalDuration
                )
            }
        }
    }

    private func stopWatchHistoryUpdates() {
        watchHistoryTimer?.invalidate()
        watchHistoryTimer = nil
    }

    private func saveWatchHistoryOnExit() {
        // Sauvegarde finale avant de quitter
        guard content.contentType == .vod else { return }

        Task {
            await domainService.saveWatchHistory(
                content: content,
                position: currentPosition,
                duration: totalDuration
            )
        }
    }

    // MARK: - Overlay Actions
    private func handleSeek(_ position: TimeInterval) {
        switch playerType {
        case .avPlayer:
            avPlayerCoordinator?.seek(to: position)
        case .vlcPlayer:
            vlcPlayerCoordinator?.seek(to: position)
        }
    }

    private func handleAudioTapped() {
        showingAudioSelector = true
    }

    private func handleSubtitlesTapped() {
        showingSubtitleSelector = true
    }

    private func handleResumeTapped() {
        // Reprendre depuis le début
        handleSeek(0)
    }

    private func handlePreviousEpisode() {
        guard case .episode(_, let seriesName, let previous, let next) = content,
              let previousEpisode = previous else { return }

        // Sauvegarder l'historique de l'épisode actuel
        saveWatchHistoryOnExit()

        // Charger le nouvel épisode
        loadNewEpisode(previousEpisode, seriesName: seriesName)
    }

    private func handleNextEpisode() {
        guard case .episode(_, let seriesName, let previous, let next) = content,
              let nextEpisode = next else { return }

        // Sauvegarder l'historique de l'épisode actuel
        saveWatchHistoryOnExit()

        // Charger le nouvel épisode
        loadNewEpisode(nextEpisode, seriesName: seriesName)
    }

    private func loadNewEpisode(_ episode: Episode, seriesName: String?) {
        // Arrêter les timers
        stopWatchHistoryUpdates()

        // Récupérer les épisodes précédent/suivant depuis la base de données
        Task {
            let (previous, next) = await fetchAdjacentEpisodes(for: episode)

            await MainActor.run {
                // Mettre à jour le contenu
                content = .episode(
                    episode,
                    seriesName: seriesName,
                    previousEpisode: previous,
                    nextEpisode: next
                )

                // Réinitialiser la position
                currentPosition = 0
                totalDuration = 0

                // Réinitialiser les coordinators (le player va se recréer)
                avPlayerController = nil
                avPlayerCoordinator = nil
                vlcPlayerCoordinator = nil

                // Redémarrer les timers
                loadWatchHistoryAndResume()
                startWatchHistoryUpdates()
            }
        }
    }

    private func fetchAdjacentEpisodes(for episode: Episode) async -> (previous: Episode?, next: Episode?) {
        // Récupérer tous les épisodes de la série via DomainService
        guard let allEpisodes = try? domainService.fetchEpisodes(
            seriesId: episode.seriesId,
            seasonNumber: episode.seasonNumber
        ) else {
            return (nil, nil)
        }

        guard let currentIndex = allEpisodes.firstIndex(where: { $0.id == episode.id }) else {
            return (nil, nil)
        }

        let previous = currentIndex > 0 ? allEpisodes[currentIndex - 1] : nil
        let next = currentIndex < allEpisodes.count - 1 ? allEpisodes[currentIndex + 1] : nil

        return (previous, next)
    }

    private func handleInfoTapped() {
        showingInfoPanel = true
    }

    // MARK: - Error Handlers
    private func handleRetry() {
        // Effacer l'erreur et réinitialiser les coordinators pour forcer le rechargement
        errorMessage = nil
        avPlayerController = nil
        avPlayerCoordinator = nil
        vlcPlayerCoordinator = nil
        currentPosition = 0
        totalDuration = 0
    }

    private func handleErrorDismiss() {
        // Fermer le player et revenir à la vue précédente
        dismiss()
    }

    // MARK: - Remote Control Handlers
    private func setupRemoteHandlers() {
        // Play/Pause
        remoteHandler.setPlayPauseHandler {
            print("remoteHandler -> setPlayPauseHandler...")
            handlePlayPause()
        }

        // Menu : Hide overlay si visible, sinon dismiss player
        remoteHandler.setMenuHandler {
            print("remoteHandler -> setMenuHandler...")
            if isOverlayVisible {
                // Première pression : masquer l'overlay
                withAnimation(.easeInOut(duration: 0.3)) {
                    isOverlayVisible = false
                }
                autoHideTask?.cancel()
            } else {
                // Deuxième pression : fermer le player
                dismiss()
            }
        }

        // Select : Toggle overlay
        remoteHandler.setSelectHandler {
            print("remoteHandler -> setSelectHandler...")
            resetAutoHideTimer()
        }

        // Swipe Up : Afficher overlay
        remoteHandler.setSwipeUpHandler {
            print("remoteHandler -> setSwipeUpHandler...")
            resetAutoHideTimer()
        }

        // Swipe Down : Masquer overlay
        remoteHandler.setSwipeDownHandler {
            print("remoteHandler -> setSwipeDownHandler...")
            withAnimation(.easeInOut(duration: 0.3)) {
                isOverlayVisible = false
            }
            autoHideTask?.cancel()
        }

        // Left : Seek -10sec si overlay caché OU si focus sur ProgressBar
        remoteHandler.setSwipeLeftHandler {
            print("remoteHandler -> setSwipeLeftHandler...")
            // Seek si overlay caché OU si focus sur ProgressBar
            if !isOverlayVisible || overlayFocusedElement == .progressBar {
                let newPosition = max(0, currentPosition - 10)
                handleSeek(newPosition)
                resetAutoHideTimer()
            }
            // Si overlay visible ET focus sur autre élément : le focus natif tvOS gère la navigation
        }

        // Right : Seek +10sec si overlay caché OU si focus sur ProgressBar
        remoteHandler.setSwipeRightHandler {
            print("remoteHandler -> setSwipeRightHandler...")
            // Seek si overlay caché OU si focus sur ProgressBar
            if !isOverlayVisible || overlayFocusedElement == .progressBar {
                let newPosition = min(currentPosition + 10, totalDuration)
                handleSeek(newPosition)
                resetAutoHideTimer()
            }
            // Si overlay visible ET focus sur autre élément : le focus natif tvOS gère la navigation
        }
    }

    private func handlePlayPause() {
        switch playerType {
        case .avPlayer:
            if let player = avPlayerCoordinator?.player {
                if player.timeControlStatus == .playing {
                    player.pause()
                    remoteHandler.isPlaying = false
                } else {
                    player.play()
                    remoteHandler.isPlaying = true
                }
            }
        case .vlcPlayer:
            if let player = vlcPlayerCoordinator?.mediaPlayer {
                if player.isPlaying {
                    player.pause()
                    remoteHandler.isPlaying = false
                } else {
                    player.play()
                    remoteHandler.isPlaying = true
                }
            }
        }
        resetAutoHideTimer()
    }
}
