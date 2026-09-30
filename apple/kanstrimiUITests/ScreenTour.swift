import XCTest

/// Not a test: a tour of the screens that drives the Siri Remote and saves a screenshot at each
/// step, for UI reviews. Skipped unless `CAPTURE_DIR` is set, so `RunAllTests` stays fast:
/// `TEST_RUNNER_CAPTURE_DIR=/path xcodebuild test -only-testing:kanstrimiUITests …`.
/// The app runs on the demo client, paired at once (`debug.*` keys, DEBUG only).
final class ScreenTour: XCTestCase {
    private var dir: URL!

    override func setUpWithError() throws {
        #if !os(tvOS)
        throw XCTSkip("La visite pilote la télécommande : tvOS seulement")
        #else
        guard let path = ProcessInfo.processInfo.environment["CAPTURE_DIR"] else { throw XCTSkip("CAPTURE_DIR absent") }
        dir = URL(fileURLWithPath: path)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        continueAfterFailure = true
        #endif
    }

    #if os(tvOS)
    @discardableResult
    private func launch(_ defaults: [String: String] = [:], pair: Bool = true) -> XCUIApplication {
        let app = XCUIApplication()
        var args = ["-pref.useMock", "<true/>"]
        if pair { args += ["-debug.autopair", "<true/>"] }
        for (k, v) in defaults { args += ["-\(k)", v] }
        app.launchArguments = args
        app.launch()
        sleep(3)
        return app
    }

    private func shot(_ name: String) {
        usleep(700_000)
        try? XCUIScreen.main.screenshot().pngRepresentation.write(to: dir.appendingPathComponent("\(name).png"))
    }

    private func press(_ button: XCUIRemote.Button, _ times: Int = 1, hold: TimeInterval? = nil) {
        for _ in 0..<times {
            if let hold { XCUIRemote.shared.press(button, forDuration: hold) } else { XCUIRemote.shared.press(button) }
            usleep(500_000)
        }
    }

    func testTour01Tabs() {
        launch(["debug.tab": "home"])
        shot("t01-onglet-focalise")
        press(.right)
        shot("t02-onglet-suivant-focalise")
        press(.down)
        shot("t03-onglet-selectionne-contenu-focalise")
    }

    func testTour02Home() {
        launch(["debug.tab": "home"])
        press(.down)
        shot("h01-hero-focalise")
        press(.down)
        shot("h02-reprendre-focalise")
        press(.down, 2)
        shot("h03-rangees")
        press(.down, 3)
        shot("h04-rangees-bas")
    }

    func testTour03Catalog() {
        for (tab, prefix) in [("movies", "f"), ("series", "s")] {
            launch(["debug.tab": tab])
            press(.down)
            shot("\(prefix)01-carte-focalisee")
            press(.down, 2)
            shot("\(prefix)02-rangees")
            press(.down, 3)
            shot("\(prefix)03-rangees-bas")
        }
    }

    func testTour04Live() {
        launch(["debug.tab": "live"])
        press(.down)
        shot("l01-theme-focalise")
        press(.right)
        shot("l02-chaine-focalisee")
    }

    func testTour05Search() {
        let app = launch(["debug.tab": "search"])
        press(.down)
        app.typeText("le")
        sleep(2)
        shot("r01-resultats")
    }

    func testTour06Settings() {
        launch(["debug.tab": "settings"])
        press(.down)
        shot("g01-reglages")
        press(.down, 8)
        shot("g02-reglages-bas")
    }

    func testTour07Detail() {
        launch(["debug.open": "tmdb:movie:535544"])
        shot("d01-film-lecture-focalise")
        press(.right)
        shot("d02-film-bouton-suivant")
        press(.down, 2)
        shot("d03-film-bas")
        launch(["debug.open": "tmdb:tv:300388"])
        shot("d04-serie")
        press(.down, 2)
        shot("d05-serie-episodes")
        launch(["debug.open": "fallback:movie:avant-charlie-brown-il-y-avait-schulz:-"])
        shot("d06-sans-tmdb")
    }

    func testTour08Player() {
        launch(["debug.autoplay": "tmdb:movie:535544", "debug.playerState": "vodPaused"])
        shot("p01-vod-pause")
        press(.down)
        shot("p02-vod-panneau")
        press(.right)
        shot("p03-vod-panneau-onglet")
        launch(["debug.autoplay": "tmdb:movie:535544", "debug.playerState": "failure"])
        shot("p04-echec")
        launch(["debug.autoplay": "tmdb:tv:300388:s01e01", "debug.playerState": "nextEpisode"])
        shot("p05-episode-suivant")
        launch(["debug.autoplay": "tmdb:movie:535544", "debug.playerState": "opening"])
        shot("p06-chargement")
    }

    func testTour09LivePlayer() {
        launch(["debug.autoplay": "live", "debug.playerState": "livePlaying"])
        shot("p10-direct")
        press(.down)
        shot("p11-direct-bas")
        press(.menu)
        press(.left)
        shot("p12-direct-gauche")
        press(.menu)
        press(.right)
        shot("p13-direct-droite")
        press(.menu)
        press(.up)
        shot("p14-direct-haut")
    }

    func testTour10Pairing() {
        launch(["debug.unpair": "<true/>"], pair: false)
        shot("a01-appairage")
    }
    #endif
}
