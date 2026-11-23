import AetherEngine
import Combine
import Foundation
import Observation
import SwiftUI

/// What the vignette asks of an engine: open a live stream without touching the display mode, set its volume, stop
/// it, and say how it goes. `PlayerCore` in the app, a fake in the tests.
protocol InsetEngine: AnyObject {
    func loadInset(_ url: URL)
    func stop()
    func setVolume(_ volume: Float)
    var insetView: AetherPlayerView? { get }
    var phaseChanges: AnyPublisher<PlaybackPhase, Never> { get }
}

extension PlayerCore: InsetEngine {
    func loadInset(_ url: URL) { load(url, live: true, preview: true) }
    func setVolume(_ volume: Float) { engine.volume = volume }
    var insetView: AetherPlayerView? { videoView }
}

/// A live stream kept in the vignette, with what brings it back in full: its playback context and its channel.
struct VignetteStream {
    let context: PlaybackContext
    let variant: Variant
    var channel: Channel?
    var channels: [Channel] = []
}

/// Apple TV: the channel that played before, kept in a small window over the video once another title or channel
/// started (`PlayerService.minimize`). Silent unless asked (`hear`). One connection per provider account: it never
/// plays the provider of the big video, and gives way to it (`yield`). Its engine is created at its first stream
/// and kept.
@Observable
final class Vignette {
    enum State: Equatable { case waiting, opening, playing, failed }

    /// The stream shown, or about to be (`waiting`).
    private(set) var stream: VignetteStream?
    private(set) var state: State = .opening
    /// Its sound plays instead of the big video's.
    private(set) var isHeard = false
    /// Called when it stops while heard: the big video takes the sound back.
    @ObservationIgnored var onSilenced: () -> Void = { }
    @ObservationIgnored private var engine: (any InsetEngine)?
    @ObservationIgnored private let makeEngine: () -> any InsetEngine
    @ObservationIgnored private var cancellable: AnyCancellable?

    init(makeEngine: @escaping () -> any InsetEngine = { PlayerCore(ownsAudioSession: false) }) {
        self.makeEngine = makeEngine
    }

    var isActive: Bool { stream != nil }
    var variant: Variant? { stream?.variant }
    var videoView: AetherPlayerView? { engine?.insetView }

    /// Shows `stream` once the big video has let go of the provider before it (`resume`): the stream it played is
    /// closed first, then opened here.
    func wait(for stream: VignetteStream) {
        stop()
        self.stream = stream
        state = .waiting
    }

    /// The big video plays, or gave up: what waited may open.
    func resume() {
        guard state == .waiting, let url = stream?.variant.streamURL else { return }
        state = .opening
        load(url)
    }

    /// The big video is about to open a stream of `provider`: the vignette closes if it holds that provider.
    func yield(to provider: Provider) {
        if stream?.variant.provider.id == provider.id { stop() }
    }

    /// Its sound instead of the big video's, or back.
    func hear(_ on: Bool) {
        isHeard = on && stream != nil
        engine?.setVolume(isHeard ? 1 : 0)
    }

    /// Synchronous: nothing of the vignette is still connecting or playing when it returns.
    func stop() {
        engine?.stop()
        let wasHeard = isHeard
        stream = nil
        state = .opening
        isHeard = false
        if wasHeard { onSilenced() }
    }

    private func load(_ url: URL) {
        let engine = self.engine ?? makeEngine()
        if self.engine == nil {
            self.engine = engine
            // Hops to the next main-queue turn: `@Published` emits before it stores the value.
            cancellable = engine.phaseChanges
                .receive(on: DispatchQueue.main)
                .sink { [weak self] in self?.handle($0) }
        }
        engine.setVolume(isHeard ? 1 : 0)
        engine.loadInset(url)
    }

    private func handle(_ phase: PlaybackPhase) {
        guard stream != nil, state != .waiting else { return }
        switch phase {
        case .playing: state = .playing
        case .error: state = .failed
        default: break
        }
    }
}

/// The vignette over the player (Apple TV): its picture in the bottom-right corner, above the bar while it shows,
/// then what it plays and how it goes.
struct VignetteView: View {
    @Environment(AppEnvironment.self) private var env
    /// The bar and its progress show under it: it rises above them.
    var barShown = false
    private var vignette: Vignette { env.player.vignette }

    var body: some View {
        if Platform.isTV, let stream = vignette.stream {
            VignetteFrame(view: vignette.state == .waiting ? nil : vignette.videoView, state: vignette.state,
                          title: stream.channel?.name ?? stream.context.content.title, variant: stream.variant,
                          hint: vignette.isHeard ? Text("\(Image(systemName: "speaker.wave.2.fill"))  Son de la vignette") : nil)
                .padding(.bottom, barShown ? VignetteFrame.aboveBar : 0)
                .playerChromeInsets()
                .allowsHitTesting(false)
                .transition(.opacity)
        }
    }
}

/// A video in the bottom-right corner, with what it plays under it: the vignette in the player, the player
/// minimized above the app.
struct VignetteFrame: View {
    let view: AetherPlayerView?
    var state: Vignette.State = .playing
    let title: String
    let variant: Variant?
    /// Said under it instead of its provider.
    var hint: Text? = nil
    /// The video view is this frame's to show (`VideoSurface`).
    var active = true
    static let width: CGFloat = 520
    /// The height of the tvOS bar with its title and progress, which the vignette rises above.
    static let aboveBar: CGFloat = 300

    var body: some View {
        VStack {
            Spacer()
            HStack {
                Spacer()
                VStack(alignment: .trailing, spacing: 10) {
                    picture.frame(width: Self.width, height: Self.width * 9 / 16)
                    caption.frame(width: Self.width, alignment: .trailing)
                }
            }
        }
    }

    private var picture: some View {
        ZStack {
            Color.black
            if let view { VideoSurface(view: view, active: active) }
            switch state {
            case .waiting, .opening: ProgressView()
            case .failed: Label("Flux indisponible", systemImage: "exclamationmark.triangle").font(.callout.weight(.semibold))
            case .playing: EmptyView()
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay { RoundedRectangle(cornerRadius: 16).strokeBorder(.white.opacity(0.35), lineWidth: 2) }
        .shadow(color: .black.opacity(0.6), radius: 18)
    }

    private var caption: some View {
        VStack(alignment: .trailing, spacing: 4) {
            HStack(spacing: 8) {
                Text(title).font(.caption.weight(.bold)).lineLimit(1)
                if let variant { Badge(variant.badge, small: true) }
            }
            Group {
                if let hint { hint } else if let provider = variant?.provider.name { Text(provider) }
            }
            .font(.caption2).foregroundStyle(Theme.secondary).lineLimit(1)
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
    }
}
