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
    private let times = PassthroughSubject<Double, Never>()
    private let sourceResets = PassthroughSubject<Void, Never>()

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
    var timeChanges: AnyPublisher<Double, Never> { times.eraseToAnyPublisher() }
    var durationChanges: AnyPublisher<Double, Never> { Empty().eraseToAnyPublisher() }
    var startupChanges: AnyPublisher<Double?, Never> { Empty().eraseToAnyPublisher() }
    var trackChanges: AnyPublisher<Void, Never> { Empty().eraseToAnyPublisher() }
    var liveSourceResets: AnyPublisher<Void, Never> { sourceResets.eraseToAnyPublisher() }

    func emit(_ phase: PlaybackPhase) {
        playbackPhase = phase
        if phase == .playing { hasFirstFrameReadyForDisplay = true }
        phases.send(phase)
    }
    /// The playback clock, as the engine publishes it.
    func emit(time: Double) { times.send(time) }
    /// The live source restarting from its beginning.
    func emitSourceReset() { sourceResets.send(()) }
}

@MainActor
struct PlayerServiceTests {
    let engine = FakePlaybackEngine()
    let player: PlayerService
    let client: MockCatalogClient

    init() {
        let scenario = MockScenario()
        scenario.latency = 0
        let defaults = UserDefaults(suiteName: "player-tests-\(UUID().uuidString)")!
        client = MockCatalogClient(scenario: scenario)
        player = PlayerService(client: client, preferences: Preferences(defaults: defaults),
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
    private func settle(seconds: Double = 1, until done: () -> Bool) async throws {
        for _ in 0..<Int(seconds * 100) where !done() { try await Task.sleep(for: .milliseconds(10)) }
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

    @Test("Un titre choisi dans un panneau ne se lance pas si le lecteur a été quitté entre-temps")
    func pickedTitleIsDroppedAfterQuit() async {
        player.play(Self.film(sources: ["a"]))
        let played = await player.playPicked {
            player.stop()
            return Self.film("tmdb:movie:949", sources: ["b"])
        }
        #expect(!played)
        #expect(player.context == nil)
    }

    @Test("Un titre choisi dans un panneau se lance quand le lecteur n'a pas bougé")
    func pickedTitlePlays() async {
        player.play(Self.film(sources: ["a"]))
        let played = await player.playPicked { Self.film("tmdb:movie:949", sources: ["b"]) }
        #expect(played)
        #expect(player.context?.content.id == ContentID("tmdb:movie:949"))
        player.stop()
    }

    @Test("La fiche du titre lu n'est demandée qu'une fois, et de nouveau quand le titre change")
    func titleCardIsLoadedOnce() async {
        player.play(Self.film("tmdb:movie:535544", sources: ["a"]))
        await player.loadTitleCard()
        await player.loadTitleCard()
        #expect(client.detailCalls == 1)
        #expect(player.titleCard?.id == ContentID("tmdb:movie:535544"))
        player.play(Self.film("tmdb:movie:499701", sources: ["b"]))
        #expect(player.titleCard == nil)
        await player.loadTitleCard()
        #expect(client.detailCalls == 2)
        player.stop()
        #expect(player.titleCard == nil)
    }

    // MARK: - Next episode

    /// An episode of the demo series whose next one exists, 45 minutes long, playing.
    private func playingEpisode() async throws -> PlaybackContext {
        let id = ContentID("tmdb:tv:300388:s01e01")
        let playback = try await client.playback(id: id)
        let content = PlaybackContent(id: id, kind: .episode, title: "Épisode 1", subtitle: "Güller ve Günahlar", episode: nil, backdrop: nil)
        let context = PlaybackContext(content: content, versions: playback.versions, duration: 2700, next: playback.next)
        #expect(context.next != nil)
        player.play(context)
        engine.emit(.playing)
        try await settle { player.phase == .playing }
        return context
    }

    @Test("Fin réelle avec une suite : une seconde de noir, puis l'épisode suivant se charge")
    func engineEndFollowsUpAfterTheBlack() async throws {
        let context = try await playingEpisode()
        engine.emit(time: 2690)
        try await settle { player.nextCountdown != nil }
        #expect(player.nextCountdown == 10)
        engine.emit(.ended)
        try await settle { player.isChangingTitle }
        #expect(engine.loads.count == 1, "le noir passe avant la suite")
        try await settle(seconds: 3) { engine.loads.count == 2 }
        #expect(player.context?.content.id == context.next?.id)
        #expect(!player.isChangingTitle)
        player.stop()
    }

    @Test("Carte annulée pendant le compte à rebours : la fin du fichier ramène à la fiche, sans suite")
    func cancelledCardGoesBackToTheSheet() async throws {
        _ = try await playingEpisode()
        engine.emit(time: 2690)
        try await settle { player.nextCountdown != nil }
        player.cancelNext()
        #expect(player.nextCountdown == nil)
        engine.emit(.ended)
        try await settle { player.context == nil }
        #expect(player.phase == .idle)
        #expect(!player.isChangingTitle)
        #expect(engine.loads.count == 1)
    }

    @Test("Le moteur ne signale pas la fin : la suite part quand même, 2 s après le compte à 0")
    func followsUpWithoutTheEnginesEnd() async throws {
        let context = try await playingEpisode()
        engine.emit(time: 2700)
        try await settle { player.nextCountdown == 0 }
        #expect(engine.loads.count == 1)
        try await settle(seconds: 5) { engine.loads.count == 2 }
        #expect(player.context?.content.id == context.next?.id)
        player.stop()
    }

    // MARK: - Live source resets

    @Test("Deux redémarrages de la source rapprochés : le second attend, un seul redémarrage à la fois")
    func closeLiveResetsAreSpaced() async throws {
        let channels = try await client.channels().flatMap(\.channels)
        player.play(channel: channels[0], in: channels)
        engine.emit(.playing)
        try await settle { player.phase == .playing }
        engine.emitSourceReset()
        try await settle { engine.loads.count == 2 }
        engine.emit(.loading)
        engine.emit(.playing)
        try await settle { player.phase == .playing }
        engine.emitSourceReset()
        try await Task.sleep(for: .milliseconds(300))
        #expect(engine.loads.count == 2, "le second redémarrage est différé de liveResetGap")
        #expect(player.phase == .playing)
        #expect(player.failure == nil)
        player.stop()
    }
}
