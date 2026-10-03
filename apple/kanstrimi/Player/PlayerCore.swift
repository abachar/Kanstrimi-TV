import AetherEngine
import CoreGraphics
import Foundation
import OSLog

private let log = Logger(subsystem: "dev.crafters.kanstrimi", category: "player")

/// What plays, for every screen that shows a stream: the engine, the surface it draws into, and the one way to open a
/// stream. The player (`PlayerService`) and the Direct preview (`LivePreview`) each compose one and add their own
/// behaviour, so an option or a fix of the engine is made here once.
final class PlayerCore {
    let engine: AetherEngine
    /// The surface the engine draws into, kept here because the engine holds its views weakly.
    let videoView = AetherPlayerView(frame: .zero)
    private var loadTask: Task<Void, Never>?

    /// `ownsAudioSession`: the player gives the session back when it stops; the preview leaves it to the player.
    init(ownsAudioSession: Bool) {
        do { engine = try AetherEngine() } catch { fatalError("AetherEngine failed to start: \(error)") }
        engine.deactivatesAudioSessionOnStop = ownsAudioSession
        engine.bind(view: videoView)
    }

    /// Opens `url` in place of what plays. No `stop()` between two loads: `load` tears the previous session down and
    /// keeps the display criteria from one episode to the next. `preview`: the television's display mode stays as is.
    func load(_ url: URL, live: Bool, preview: Bool = false, startPosition: TimeInterval? = nil) {
        let options = Self.options(live: live, preview: preview)
        loadTask?.cancel()
        loadTask = Task { [engine] in
            do {
                _ = try await engine.load(url: url, startPosition: startPosition, options: options)
            } catch is CancellationError {
                // A newer load or a stop replaced this one: not a failure.
            } catch {
                // The same failure also arrives as the engine's `.error` state, handled by whoever plays.
                log.info("load failed: \(error)")
            }
        }
    }

    /// Synchronous: nothing is still connecting or playing when it returns.
    func stop() {
        loadTask?.cancel(); loadTask = nil
        engine.stop()
    }

    /// One connection at most: the account allows a single stream, and this also stops the speculative parallel requests.
    static func options(live: Bool, preview: Bool) -> LoadOptions {
        guard live else { return LoadOptions(maxConcurrentSourceRequests: 1) }
        var options = LoadOptions(suppressDisplayCriteria: preview, isLive: true, liveJoinProfile: .fastZap, maxConcurrentSourceRequests: 1)
        // Decoded in the app: AVPlayer, fed by the engine's local HLS, waits for three whole GOPs before it starts (6 s on a
        // channel with long GOPs), and does not deinterlace 1080i on tvOS.
        options.preferredDecodePath = .software
        // A short rewind window routes live through the engine's DVR feeder, which decodes the sound on its own, up to 4 s
        // ahead of the clock. Without it, sound packets wait behind the picture's back-pressure and a 50 fps channel in
        // HE-AAC (Canal+ Foot) stutters (engine #107).
        options.dvrWindowSeconds = 30
        return options
    }
}
