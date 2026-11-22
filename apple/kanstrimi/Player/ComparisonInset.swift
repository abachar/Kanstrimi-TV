import AetherEngine
import Combine
import Foundation
import Observation
import SwiftUI

/// What the inset asks of an engine: open a live stream without sound or display mode, stop it, and say how it goes.
/// `PlayerCore` in the app, a fake in the tests.
protocol InsetEngine: AnyObject {
    func loadInset(_ url: URL)
    func stop()
    var insetView: AetherPlayerView? { get }
    var phaseChanges: AnyPublisher<PlaybackPhase, Never> { get }
}

extension PlayerCore: InsetEngine {
    func loadInset(_ url: URL) {
        engine.volume = 0
        load(url, live: true, preview: true)
    }
    var insetView: AetherPlayerView? { videoView }
}

/// A second variant of the channel playing, in a small window over the video (Apple TV): the same channel by another
/// provider, to compare what each shows. Silent: the sound is the big video's. One connection per provider account:
/// it never plays the provider of the big video, and gives way to it (`yield`). Its engine is created at the first
/// comparison and kept.
@Observable
final class ComparisonInset {
    enum State: Equatable { case waiting, opening, playing, failed }

    /// The variant shown, or about to be (`waiting`).
    private(set) var variant: Variant?
    private(set) var state: State = .opening
    @ObservationIgnored private var engine: (any InsetEngine)?
    @ObservationIgnored private let makeEngine: () -> any InsetEngine
    @ObservationIgnored private var cancellable: AnyCancellable?

    init(makeEngine: @escaping () -> any InsetEngine = { PlayerCore(ownsAudioSession: false) }) {
        self.makeEngine = makeEngine
    }

    var isActive: Bool { variant != nil }
    var videoView: AetherPlayerView? { engine?.insetView }

    /// Opens `variant` in place of what the inset shows.
    func show(_ variant: Variant) {
        guard let url = variant.streamURL else { return }
        stop()
        self.variant = variant
        state = .opening
        load(url)
    }

    /// Shows `variant` once the big video has let go of its provider (`resume`): a swap hands each provider over.
    func wait(for variant: Variant) {
        stop()
        self.variant = variant
        state = .waiting
    }

    /// The big video plays, or gave up: what waited may open.
    func resume() {
        guard state == .waiting, let url = variant?.streamURL else { return }
        state = .opening
        load(url)
    }

    /// The big video is about to open a stream of `provider`: the inset closes if it holds that provider.
    func yield(to provider: Provider) {
        if variant?.provider.id == provider.id { stop() }
    }

    /// Synchronous: nothing of the inset is still connecting or playing when it returns.
    func stop() {
        engine?.stop()
        variant = nil
        state = .opening
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
        engine.loadInset(url)
    }

    private func handle(_ phase: PlaybackPhase) {
        guard variant != nil, state != .waiting else { return }
        switch phase {
        case .playing: state = .playing
        case .error: state = .failed
        default: break
        }
    }
}

/// The inset over the video (Apple TV): its picture in the top-left corner, then which variant it is and how it goes.
struct ComparisonInsetView: View {
    @Environment(AppEnvironment.self) private var env
    private var inset: ComparisonInset { env.player.comparison }
    static let width: CGFloat = 520

    var body: some View {
        if Platform.isTV, let variant = inset.variant {
            VStack {
                HStack {
                    VStack(alignment: .leading, spacing: 10) {
                        picture.frame(width: Self.width, height: Self.width * 9 / 16)
                        caption(variant).frame(width: Self.width, alignment: .leading)
                    }
                    Spacer()
                }
                Spacer()
            }
            .playerChromeInsets()
            .allowsHitTesting(false)
            .transition(.opacity)
        }
    }

    private var picture: some View {
        ZStack {
            Color.black
            if let view = inset.videoView, inset.state != .waiting { VideoSurface(view: view) }
            switch inset.state {
            case .waiting, .opening: ProgressView()
            case .failed: Label("Flux indisponible", systemImage: "exclamationmark.triangle").font(.callout.weight(.semibold))
            case .playing: EmptyView()
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay { RoundedRectangle(cornerRadius: 16).strokeBorder(.white.opacity(0.35), lineWidth: 2) }
        .shadow(color: .black.opacity(0.6), radius: 18)
    }

    private func caption(_ variant: Variant) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Text(variant.provider.name).font(.caption.weight(.bold))
                Badge(variant.badge, small: true)
            }
            Text(variant.name).font(.caption2).foregroundStyle(Theme.secondary).lineLimit(1)
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
    }
}
