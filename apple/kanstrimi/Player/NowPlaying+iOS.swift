#if os(iOS)
import MediaPlayer
import UIKit

/// The system's Now Playing card (lock screen, Control Center, headphones): what plays, and a transport
/// whose commands go through the service to keep its rules (no pause and no seek on live, where the
/// previous and next buttons zap).
final class NowPlaying {
    private weak var service: PlayerService?
    private var artwork: (url: URL, item: MPMediaItemArtwork)?
    private var artworkTask: Task<Void, Never>?
    /// The last image asked for: a slow or failed download is not asked again by every `update()`.
    private var requestedArtworkURL: URL?

    /// Registers the commands once; safe to call at every start.
    func attach(to service: PlayerService) {
        guard self.service !== service else { return }
        self.service = service
        let center = MPRemoteCommandCenter.shared()
        center.playCommand.addTarget { [weak service] _ in
            guard let service else { return .commandFailed }
            if service.phase == .paused || service.phase == .ended { service.togglePlayPause() }
            return .success
        }
        center.pauseCommand.addTarget { [weak service] _ in
            service?.pause()
            return .success
        }
        center.togglePlayPauseCommand.addTarget { [weak service] _ in
            service?.togglePlayPause()
            return .success
        }
        center.skipBackwardCommand.preferredIntervals = [10]
        center.skipBackwardCommand.addTarget { [weak service] _ in
            service?.seek(by: -10)
            return .success
        }
        center.skipForwardCommand.preferredIntervals = [10]
        center.skipForwardCommand.addTarget { [weak service] _ in
            service?.seek(by: 10)
            return .success
        }
        center.changePlaybackPositionCommand.addTarget { [weak service] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            service?.seek(to: event.positionTime)
            return .success
        }
        center.previousTrackCommand.addTarget { [weak service] _ in
            service?.zap(offset: -1)
            return .success
        }
        center.nextTrackCommand.addTarget { [weak service] _ in
            service?.zap(offset: 1)
            return .success
        }
    }

    /// Publishes the state of the service. The system moves the time forward by itself from the position
    /// and the rate: called on a change of state, title or position, not at every tick.
    func update() {
        guard let service, let content = service.context?.content else { return }
        let live = service.isLive
        let center = MPRemoteCommandCenter.shared()
        for command in [center.pauseCommand, center.skipBackwardCommand, center.skipForwardCommand, center.changePlaybackPositionCommand] {
            command.isEnabled = !live
        }
        for command in [center.previousTrackCommand, center.nextTrackCommand] {
            command.isEnabled = live && service.channels.count > 1
        }

        var info: [String: Any] = [
            MPMediaItemPropertyTitle: content.title,
            MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.video.rawValue,
            MPNowPlayingInfoPropertyIsLiveStream: live,
            MPNowPlayingInfoPropertyPlaybackRate: service.phase == .playing ? 1.0 : 0.0,
        ]
        if let subtitle = live ? service.epg.now?.title : content.subtitle { info[MPMediaItemPropertyArtist] = subtitle }
        if !live, service.duration > 0 {
            info[MPMediaItemPropertyPlaybackDuration] = service.duration
            info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = service.time
        }
        let url = live ? service.channel?.logo : content.backdrop
        if let artwork, artwork.url == url { info[MPMediaItemPropertyArtwork] = artwork.item }
        else if url != requestedArtworkURL { loadArtwork(url) }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    func clear() {
        artworkTask?.cancel(); artworkTask = nil
        artwork = nil; requestedArtworkURL = nil
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    private func loadArtwork(_ url: URL?) {
        artworkTask?.cancel()
        artwork = nil
        requestedArtworkURL = url
        guard let url else { return }
        artworkTask = Task { [weak self] in
            guard let (data, _) = try? await URLSession.shared.data(from: url), let image = UIImage(data: data),
                  let self, !Task.isCancelled else { return }
            artwork = (url, Self.artwork(image))
            update()
        }
    }

    /// Outside the main actor: the system asks for the image on a queue of its own.
    private nonisolated static func artwork(_ image: UIImage) -> MPMediaItemArtwork {
        MPMediaItemArtwork(boundsSize: image.size) { _ in image }
    }
}
#endif
