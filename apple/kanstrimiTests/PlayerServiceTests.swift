import AetherEngine
import Combine
import Foundation
import Testing
@testable import kanstrimi

/// The engine as the tests play it: it records what it is asked to open and emits the phases a real stream would.
@MainActor
final class FakePlaybackEngine: PlaybackEngine {
    private(set) var loads: [URL] = []
    private(set) var seeks: [Double] = []
    /// What the engine read in the file it opened; nil, the file says nothing and no marker is asked for.
    var fileFacts: FileFacts?
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
    func seek(to seconds: Double) async { seeks.append(seconds) }
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

    // MARK: - Markers

    /// A Netflix episode: 45 minutes, its intro and its credits named in its chapters.
    private static let netflix = FileFacts(duration: 2700, chapters: [
        .init(name: "Part 01", start: 0, end: 71), .init(name: "Intro", start: 71, end: 86),
        .init(name: "Part 02", start: 86, end: 2500), .init(name: "Credits", start: 2500, end: 2700),
    ])

    @Test("Fichier ouvert : sa durée et ses chapitres partent au serveur une fois, et de nouveau à chaque ouverture")
    func fileFactsAreSentOncePerOpening() async throws {
        engine.fileFacts = Self.netflix
        let context = try await playingEpisode()
        try await settle { client.markersAsked.count == 1 }
        #expect(client.markersAsked == [Self.netflix])
        engine.emit(.rebuffering)
        engine.emit(.playing)
        try await Task.sleep(for: .milliseconds(100))
        #expect(client.markersAsked.count == 1)
        // Another version is another file: its own markers.
        player.switchVersion(context.versions[0])
        engine.emit(.loading)
        engine.emit(.playing)
        try await settle { client.markersAsked.count == 2 }
        #expect(player.markers != nil)
        player.stop()
        #expect(player.markers == nil)
    }

    @Test("Un fichier dont le moteur ne sait rien ne demande aucun marqueur : la carte reste aux quinze dernières secondes")
    func withoutFileFactsNothingIsAsked() async throws {
        _ = try await playingEpisode()
        engine.emit(time: 2500)
        try await Task.sleep(for: .milliseconds(700))
        #expect(client.markersAsked.isEmpty)
        #expect(player.nextCountdown == nil)
        player.stop()
    }

    @Test("Passer le récap, passer l'intro : chacun proposé pendant qu'il passe seulement, saute à sa fin")
    func skipJumpsToItsEnd() async throws {
        engine.fileFacts = Self.netflix
        client.markersAnswer = PlaybackMarkers(skips: [.init(start: 0, end: 20, label: "Passer le récap"),
                                                       .init(start: 71, end: 86, label: "Passer l'intro")], credits: nil)
        _ = try await playingEpisode()
        try await settle { player.markers != nil }
        engine.emit(time: 5)
        try await settle { player.skipOffer?.label == "Passer le récap" }
        player.skip()
        try await settle { engine.seeks == [20] }
        engine.emit(time: 30)
        try await settle { player.time == 30 }
        #expect(player.skipOffer == nil)
        player.skip()
        #expect(engine.seeks == [20])
        engine.emit(time: 75)
        try await settle { player.skipOffer?.label == "Passer l'intro" }
        player.skip()
        try await settle { engine.seeks == [20, 86] }
        #expect(player.time == 86)
        #expect(player.skipOffer == nil)
        player.stop()
    }

    @Test("Générique connu : la carte paraît à son début pour vingt secondes, puis la suite part et l'épisode est vu")
    func creditsStartTheCountdown() async throws {
        engine.fileFacts = Self.netflix
        client.markersAnswer = PlaybackMarkers(skips: [], credits: .init(at: 2500, countdown: 20))
        let context = try await playingEpisode()
        try await settle { player.markers != nil }
        engine.emit(time: 2499)
        try await Task.sleep(for: .milliseconds(700))
        #expect(player.nextCountdown == nil)
        engine.emit(time: 2500)
        try await settle { player.nextCountdown != nil }
        #expect(player.nextCountdown == 20)
        engine.emit(time: 2512)
        try await settle(seconds: 2) { player.nextCountdown == 8 }
        #expect(engine.loads.count == 1)
        engine.emit(time: 2520)
        // No end from the engine, the file still plays its credits: the countdown starts what follows by itself.
        try await settle(seconds: 2) { player.isChangingTitle }
        try await settle(seconds: 3) { engine.loads.count == 2 }
        #expect(player.context?.content.id == context.next?.id)
        try await settle { client.reported(context.content.id)?.finished == true }
        #expect(client.reported(context.content.id)?.position == 2700)
        player.stop()
    }

    @Test("Générique : quitter ou annuler après son début laisse l'épisode vu ; revenir avant lui retire la carte")
    func leavingInTheCreditsIsSeen() async throws {
        engine.fileFacts = Self.netflix
        client.markersAnswer = PlaybackMarkers(skips: [], credits: .init(at: 2500, countdown: 20))
        let context = try await playingEpisode()
        try await settle { player.markers != nil }
        engine.emit(time: 2505)
        try await settle { player.nextCountdown == 20 }
        // Rewound before the credits: the card goes, and comes back with them.
        engine.emit(time: 2300)
        try await settle(seconds: 2) { player.nextCountdown == nil }
        engine.emit(time: 2510)
        try await settle(seconds: 2) { player.nextCountdown == 20 }
        player.cancelNext()
        #expect(player.nextCountdown == nil)
        player.stop()
        try await settle { client.reported(context.content.id)?.finished == true }
        #expect(engine.loads.count == 1)
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
