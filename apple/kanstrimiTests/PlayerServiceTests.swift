import AetherEngine
import Combine
import Foundation
import Testing
@testable import kanstrimi

/// The engine as the tests play it: it records what it is asked to open and emits the phases a real stream would.
@MainActor
final class FakePlaybackEngine: PlaybackEngine {
    private(set) var loads: [URL] = []
    private let phases = PassthroughSubject<PlaybackPhase, Never>()

    func load(_ url: URL, live: Bool, startPosition: TimeInterval?) {
        loads.append(url)
        hasFirstFrameReadyForDisplay = false
    }
    func stop() {}
    func play() {}
    func pause() {}
    func seek(to seconds: Double) async {}
    func selectAudioTrack(index: Int) {}
    func selectSubtitleTrack(index: Int) {}
    func clearSubtitle() {}

    private(set) var playbackPhase: PlaybackPhase = .idle
    var state: PlaybackState = .idle
    var errorInfo: PlaybackErrorInfo? { nil }
    var hasFirstFrameReadyForDisplay = false
    var isSeeking: Bool { false }
    var audioTracks: [TrackInfo] { [] }
    var activeAudioTrackIndex: Int? { nil }
    var subtitleTracks: [TrackInfo] { [] }
    var activeSubtitleTrackIndex: Int? { nil }
    var isSubtitleActive: Bool { false }

    var phaseChanges: AnyPublisher<PlaybackPhase, Never> { phases.eraseToAnyPublisher() }
    var timeChanges: AnyPublisher<Double, Never> { Empty().eraseToAnyPublisher() }
    var durationChanges: AnyPublisher<Double, Never> { Empty().eraseToAnyPublisher() }
    var startupChanges: AnyPublisher<Double?, Never> { Empty().eraseToAnyPublisher() }
    var trackChanges: AnyPublisher<Void, Never> { Empty().eraseToAnyPublisher() }
    var liveSourceResets: AnyPublisher<Void, Never> { Empty().eraseToAnyPublisher() }

    func emit(_ phase: PlaybackPhase) {
        playbackPhase = phase
        if phase == .playing { hasFirstFrameReadyForDisplay = true }
        phases.send(phase)
    }
}

@MainActor
struct PlayerServiceTests {
    let engine = FakePlaybackEngine()
    let player: PlayerService

    init() {
        let scenario = MockScenario()
        scenario.latency = 0
        let defaults = UserDefaults(suiteName: "player-tests-\(UUID().uuidString)")!
        player = PlayerService(client: MockCatalogClient(scenario: scenario), preferences: Preferences(defaults: defaults),
                               failedSources: FailedSourcesStore(), progressQueue: ProgressQueue(fileURL: Fixtures.tempFile("queue")),
                               playback: engine)
    }

    private static func url(_ name: String) -> URL { URL(string: "http://provider.test/movie/u/p/\(name).mkv")! }

    /// A film in HD, its sources in that order.
    private static func film(_ id: String = "tmdb:movie:603", sources: [String], duration: TimeInterval = 6000) -> PlaybackContext {
        let version = Version(id: "vf-hd", language: .vf, quality: .hd, dynamicRange: nil,
                              sources: sources.map { Source(id: $0, container: "MKV", streamURL: url($0), provider: nil, origin: nil) },
                              edition: nil)
        return PlaybackContext(content: PlaybackContent(id: ContentID(id), kind: .movie, title: "Matrix", subtitle: nil,
                                                        episode: nil, backdrop: nil),
                               versions: [version], duration: duration)
    }

    /// The service hears the engine on the next main-queue turn, and restarts on the turn after.
    private func settle(until done: () -> Bool) async throws {
        for _ in 0..<100 where !done() { try await Task.sleep(for: .milliseconds(10)) }
        #expect(done())
    }

    @Test("Une panne passe à la source suivante, sans redemander le serveur")
    func failureSwitchesSource() async throws {
        player.play(Self.film(sources: ["a", "b"]))
        #expect(engine.loads == [Self.url("a")])
        engine.emit(.error("connexion fermée"))
        try await settle { engine.loads.count == 2 }
        #expect(engine.loads == [Self.url("a"), Self.url("b")])
        #expect(player.source?.id == "b")
        #expect(player.phase == .opening)
        player.stop()
    }

    @Test("Une seule source : deux nouveaux essais, puis le dialogue d'échec")
    func retriesThenDialog() async throws {
        player.play(Self.film(sources: ["a"]))
        for n in 2...3 {
            engine.emit(.loading)
            engine.emit(.error("connexion fermée"))
            try await settle { engine.loads.count == n }
        }
        engine.emit(.loading)
        engine.emit(.error("connexion fermée"))
        try await settle { player.phase == .failed }
        #expect(engine.loads.count == 3)
        #expect(player.failure != nil)
        player.stop()
    }

    @Test("Les essais ratés d'un titre ne comptent pas pour le suivant")
    func attemptsResetWithTheTitle() async throws {
        player.play(Self.film(sources: ["a"]))
        for n in 2...3 {
            engine.emit(.loading)
            engine.emit(.error("connexion fermée"))
            try await settle { engine.loads.count == n }
        }
        player.play(Self.film("tmdb:movie:949", sources: ["b"]))
        engine.emit(.loading)
        engine.emit(.error("connexion fermée"))
        try await settle { engine.loads.count == 5 }
        #expect(player.phase == .opening)
        #expect(player.failure == nil)
        player.stop()
    }

    @Test("Un film qui s'arrête loin de sa fin a été coupé : la lecture reprend")
    func earlyEndIsACut() async throws {
        player.play(Self.film(sources: ["a"]))
        engine.emit(.playing)
        try await settle { player.phase == .playing }
        engine.emit(.ended)
        try await settle { engine.loads.count == 2 }
        #expect(player.phase == .opening)
        player.stop()
    }
}
