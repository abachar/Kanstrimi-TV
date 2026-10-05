import Foundation
import Testing
@testable import kanstrimi

/// Intercepts every request of a dedicated URLSession: records it, answers a scripted response.
final class StubProtocol: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) -> (Int, Data))?
    nonisolated(unsafe) static var requests: [URLRequest] = []
    /// Bodies arrive as streams inside a URLProtocol: read once here, while they are readable.
    nonisolated(unsafe) static var bodies: [Data] = []

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.requests.append(request)
        var body = request.httpBody ?? Data()
        if body.isEmpty, let stream = request.httpBodyStream {
            stream.open(); defer { stream.close() }
            var buf = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable { let n = stream.read(&buf, maxLength: buf.count); if n <= 0 { break }; body.append(buf, count: n) }
        }
        Self.bodies.append(body)
        let (status, data) = Self.handler?(request) ?? (200, Data("{}".utf8))
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

/// Serialised: the stub protocol is process-global, parallel test cases would read each other's requests.
@Suite(.serialized) @MainActor
struct HTTPCatalogClientTests {
    let device: DeviceStore
    let client: HTTPCatalogClient

    init() {
        device = DeviceStore(secrets: MemorySecrets())
        device.store(token: "dvc_test", code: "K7Q4MZ")
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubProtocol.self]
        client = HTTPCatalogClient(baseURL: URL(string: "https://kanstrimi.test")!, device: device, session: URLSession(configuration: config),
                                    retryDelays: [.zero, .zero])
        StubProtocol.requests = []
        StubProtocol.bodies = []
        StubProtocol.handler = nil
    }

    private func answer(_ status: Int = 200, _ json: String) {
        StubProtocol.handler = { _ in (status, Data(json.utf8)) }
    }
    /// A response the server recorded (`Contract/`).
    private func golden(_ name: String) throws -> String {
        let url = try #require(Bundle(for: StubProtocol.self).url(forResource: name, withExtension: "json"))
        return try String(contentsOf: url, encoding: .utf8)
    }
    private var last: URLRequest { get throws { try #require(StubProtocol.requests.last) } }
    private var lastBody: [String: Double] { (try? JSONDecoder().decode([String: Double].self, from: StubProtocol.bodies.last ?? Data())) ?? [:] }
    private func query(_ req: URLRequest) throws -> [String: String] {
        let url = try #require(req.url)
        let items = try #require(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems)
        return Dictionary(uniqueKeysWithValues: items.map { ($0.name, $0.value ?? "") })
    }

    @Test func pairingCallsCarryNoTokenAndDecodeEveryStatus() async throws {
        answer(201, #"{"code":"K7Q4MZ","expires_at":"2026-09-26T21:24:00.123Z","url":"https://kanstrimi.test/admin/pair/K7Q4MZ","token":"dvc_abc"}"#)
        let created = try await client.createDevice()
        #expect(created.code == "K7Q4MZ")
        #expect(created.token == "dvc_abc")
        #expect(created.url.path() == "/admin/pair/K7Q4MZ")
        #expect(try last.httpMethod == "POST")
        #expect(try last.url?.path() == "/player/devices")
        #expect(try last.value(forHTTPHeaderField: "Authorization") == nil)

        answer(200, #"{"status":"pending"}"#)
        #expect(try await client.pollDevice(code: "K7Q4MZ") == .pending)
        answer(200, #"{"status":"approved","device_name":"Salon"}"#)
        #expect(try await client.pollDevice(code: "K7Q4MZ") == .approved(deviceName: "Salon"))
        answer(200, #"{"status":"expired"}"#)
        #expect(try await client.pollDevice(code: "K7Q4MZ") == .expired)
    }

    @Test func authenticatedCallsSendTheBearerAndMapErrors() async throws {
        answer(200, #"{"server_version":"0.2.0","counts":{"movies":1,"series":2,"channels":3},"last_import":null,"tmdb_rate":0.97,"catalog_languages":["VF"],"default_language_order":["VF","VOSTFR","VO"]}"#)
        let info = try await client.info()
        #expect(info.counts.channels == 3)
        #expect(info.lastImport == nil)
        #expect(try last.value(forHTTPHeaderField: "Authorization") == "Bearer dvc_test")

        answer(401, #"{"error":{"code":"unauthorized","message":"Appareil inconnu"}}"#)
        await #expect(throws: CatalogError.unauthorized) { try await client.info() }
        answer(404, try golden("error"))
        await #expect(throws: CatalogError.notFound) { try await client.detail(id: ContentID("tmdb:movie:1")) }
        answer(502, #"{"error":{"code":"upstream","message":"Le fournisseur n'a pas répondu"}}"#)
        await #expect(throws: CatalogError.server("Le fournisseur n'a pas répondu")) { try await client.home() }
        answer(200, #"{"not":"a home"}"#)
        await #expect(throws: CatalogError.self) { try await client.home() }
    }

    @Test("Un 401 dissocie l'appareil quel que soit l'appelant, jamais pendant l'appairage")
    func unauthorizedReachesTheAppFromAnyCall() async {
        let preferences = Preferences(defaults: UserDefaults(suiteName: "tests-\(UUID().uuidString)")!)
        let switching = SwitchingCatalogClient(mock: MockCatalogClient(scenario: MockScenario()), http: client, preferences: preferences)
        var revoked = 0
        switching.onUnauthorized = { revoked += 1 }
        answer(401, #"{"error":{"code":"unauthorized","message":"Appareil inconnu"}}"#)
        await #expect(throws: CatalogError.unauthorized) { try await switching.channels() }
        await #expect(throws: CatalogError.unauthorized) { try await switching.programmes(channel: ContentID("live:fr-tf1"), version: nil) }
        #expect(revoked == 2)
        await #expect(throws: CatalogError.unauthorized) { try await switching.pollDevice(code: "K7Q4MZ") }
        #expect(revoked == 2)
    }

    @Test func withoutTokenAnAuthenticatedCallIsUnauthorizedBeforeAnyRequest() async {
        device.forget(reason: nil)
        await #expect(throws: CatalogError.unauthorized) { try await client.home() }
        #expect(StubProtocol.requests.isEmpty)
    }

    @Test func listsBuildTheQueryStringOfTheContract() async throws {
        answer(200, #"{"items":[],"next_cursor":null}"#)
        var q = ListQuery(kind: .series, genre: "thriller")
        q.language = .vostfr; q.minQuality = .fhd; q.dynamicRange = .hdr; q.vfAvailable = true; q.cursor = "abc=="
        _ = try await client.list(q)
        #expect(try last.url?.path() == "/player/series")
        #expect(try query(last) == ["sort": "release", "genre": "thriller", "language": "VOSTFR", "min_quality": "FHD", "dynamic_range": "HDR", "vf_available": "1", "cursor": "abc=="])

        // « Nouveautés » / « Derniers épisodes » keep the arrival order; every other row is by release date.
        #expect(ListQuery(kind: .series, genre: "recent").sort == .latestEpisodes)
        #expect(ListQuery(kind: .movie, genre: "recent").sort == .recent)
        #expect(ListQuery(kind: .movie, genre: "action").sort == .release)

        answer(200, "[]")
        _ = try await client.rows(kind: .movie)
        #expect(try last.url?.absoluteString == "https://kanstrimi.test/player/movies")
    }

    @Test func idsPickTheirCollectionAndStayInThePath() async throws {
        answer(200, #"{"id":"tmdb:tv:1396","kind":"series","title":"Vincenzo","logo":"https://kanstrimi.test/img/w500/l.png"}"#)
        let sheet = try await client.detail(id: ContentID("tmdb:tv:1396"))
        #expect(try last.url?.path() == "/player/series/tmdb:tv:1396")
        #expect(sheet.logo == URL(string: "https://kanstrimi.test/img/w500/l.png"))
        answer(200, #"{"id":"fallback:movie:tenet:2020","kind":"movie","title":"Tenet"}"#)
        _ = try await client.detail(id: ContentID("fallback:movie:tenet:2020"))
        #expect(try last.url?.path() == "/player/movies/fallback:movie:tenet:2020")
        answer(200, #"{"versions":[],"resume_at":1140,"duration":3060,"next":null,"cast":[]}"#)
        let p = try await client.playback(id: ContentID("tmdb:tv:1396:s01e05"))
        #expect(p.resumeAt == 1140)
        #expect(try last.url?.path() == "/player/playback/tmdb:tv:1396:s01e05")
    }

    @Test func progressAndFavouritesAreNoContentCalls() async throws {
        answer(204, "")
        try await client.report(ProgressReport(contentID: ContentID("tmdb:movie:603"), position: 1170.4, duration: 3060, sentAt: .now))
        #expect(try last.httpMethod == "PUT")
        #expect(try last.url?.path() == "/player/playback/tmdb:movie:603/progress")
        #expect(lastBody == ["position": 1170, "duration": 3060])
        try await client.setFavorite(id: ContentID("live:fr-tf1"), true)
        #expect(try last.httpMethod == "PUT" && last.url?.path() == "/player/favorites/live:fr-tf1")
        try await client.setFavorite(id: ContentID("live:fr-tf1"), false)
        #expect(try last.httpMethod == "DELETE")
        try await client.deleteDevice(code: "K7Q4MZ")
        #expect(try last.httpMethod == "DELETE" && last.url?.path() == "/player/devices/K7Q4MZ")
    }

    @Test func datesDecodeWithAndWithoutFractionalSeconds() async throws {
        answer(200, #"{"id":"tmdb:movie:603","kind":"movie","title":"Matrix","added_at":"2026-09-01T00:00:00Z"}"#)
        #expect(try await client.detail(id: ContentID("tmdb:movie:603")).addedAt == HTTPCatalogClient.parseISO8601("2026-09-01T00:00:00Z"))
        answer(200, #"{"heroes":[],"rows":[{"id":"recent-movies","kind":"recent_movies","title":"Films récents","cards":[{"id":"tmdb:movie:603","kind":"movie","title":"Matrix"}]}],"generated_at":"2026-09-26T21:14:00.512Z"}"#)
        let home = try await client.home()
        #expect(abs(home.generatedAt.timeIntervalSince1970 - 1790457240.512) < 0.001)
        #expect(home.heroes.isEmpty)
    }

    @Test func homeCarouselDecodesWhatLecturePlays() async throws {
        answer(200, #"{"heroes":[{"item":{"id":"tmdb:tv:1396","kind":"series","title":"Vincenzo"},"tagline":"SÉRIE · NOUVEL ÉPISODE · S1 É2","overview":null,"runtime":80,"certification":null,"versions":[],"play_id":"tmdb:tv:1396:s01e02","play_label":"Lecture","episode":{"season":1,"number":2,"title":"Épisode 2"}},{"item":{"id":"tmdb:movie:603","kind":"movie","title":"Matrix"},"tagline":"FILM · N° 1 CETTE SEMAINE","overview":null,"runtime":136,"certification":"12","versions":[],"play_id":"tmdb:movie:603","play_label":"Reprendre · 40 min restantes"}],"rows":[],"generated_at":"2026-10-03T08:00:00Z"}"#)
        let home = try await client.home()
        #expect(home.heroes.map(\.playID) == [ContentID("tmdb:tv:1396:s01e02"), ContentID("tmdb:movie:603")])
        #expect(home.heroes[0].item.id == ContentID("tmdb:tv:1396"))
        #expect(home.heroes[0].episode == EpisodeRef(season: 1, number: 2, title: "Épisode 2"))
        #expect(home.heroes[1].episode == nil)
        #expect(home.heroes[1].playLabel == "Reprendre · 40 min restantes")
    }

    @Test func sagasTravelAndDecode() async throws {
        answer(200, #"{"items":[{"id":"saga:900","kind":"saga","title":"Trilogie - Saga","logo":null,"poster":null,"picture":"https://kanstrimi.test/img/w1280/b.jpg","facts":"3 films","badges":[],"hint":null,"progress":null,"watched":false,"caption":null}],"next_cursor":"xyz"}"#)
        let page = try await client.sagas(cursor: "abc")
        #expect(try last.url?.path() == "/player/movies/sagas")
        #expect(try query(last) == ["cursor": "abc"])
        #expect(page.items[0].kind == .saga)
        #expect(page.items[0].title == "Trilogie - Saga")
        #expect(page.items[0].facts == "3 films")
        #expect(page.nextCursor == "xyz")
        #expect(page.total == nil)

        answer(200, #"{"id":"saga:900","name":"Trilogie - Saga","count":1,"poster":null,"backdrop":null,"heading":"SAGA","facts":"1 film","movies":[{"id":"tmdb:movie:1","kind":"movie","title":"Un"}]}"#)
        let sheet = try await client.saga(id: "saga:900")
        #expect(try last.url?.path() == "/player/movies/sagas/saga:900")
        #expect(sheet.movies.map(\.title) == ["Un"])
        #expect(sheet.facts == "1 film")

        // The sheet carries its saga when it has one, and decodes without it.
        answer(200, #"{"id":"tmdb:movie:1","kind":"movie","title":"Un","saga":{"id":"saga:900","name":"Trilogie - Saga","count":3,"label":"Trilogie - Saga · 3 films"}}"#)
        #expect(try await client.detail(id: ContentID("tmdb:movie:1")).saga?.count == 3)
        answer(200, #"{"id":"tmdb:movie:2","kind":"movie","title":"Deux"}"#)
        #expect(try await client.detail(id: ContentID("tmdb:movie:2")).saga == nil)
    }

    @Test("Si vous avez aimé… : titres similaires de la fiche, rangée d'accueil, suggestions du lecteur, série lue par son épisode")
    func relatedTitlesTravel() async throws {
        answer(200, #"{"id":"tmdb:movie:603","kind":"movie","title":"Matrix","related":[{"id":"tmdb:movie:604","kind":"movie","title":"Matrix Reloaded"},{"id":"tmdb:tv:1399","kind":"series","title":"Game of Thrones"}]}"#)
        #expect(try await client.detail(id: ContentID("tmdb:movie:603")).related.map(\.title) == ["Matrix Reloaded", "Game of Thrones"])
        answer(200, #"{"id":"tmdb:movie:2","kind":"movie","title":"Deux"}"#)
        #expect(try await client.detail(id: ContentID("tmdb:movie:2")).related.isEmpty)

        answer(200, #"{"heroes":[],"generated_at":"2026-10-02T18:00:00Z","rows":[{"id":"recommended","kind":"recommended","title":"Recommandé pour vous","cards":[]}]}"#)
        #expect(try await client.home().rows.map(\.kind) == [.recommended])

        answer(200, #"{"related":[{"id":"tmdb:movie:604","kind":"movie","title":"Matrix Reloaded","caption":"2003 · Action · 2 h 18"}],"next":{"item":{"id":"tmdb:movie:604","kind":"movie","title":"Matrix Reloaded"},"reason":"saga","heading":"À SUIVRE · SUITE DE LA SAGA"}}"#)
        let s = try await client.suggestions(id: ContentID("tmdb:movie:603"))
        #expect(try last.url?.path() == "/player/playback/tmdb:movie:603/suggestions")
        #expect(s.related.first?.caption == "2003 · Action · 2 h 18")
        #expect(s.next?.reason == .saga)
        #expect(s.next?.heading == "À SUIVRE · SUITE DE LA SAGA")
        answer(200, #"{"related":[],"next":{"item":{"id":"tmdb:tv:1","kind":"series","title":"Un"},"reason":"not_yet_known","heading":"À SUIVRE"}}"#)
        #expect(try await client.suggestions(id: ContentID("tmdb:movie:603")).next?.reason == .other)
        answer(200, #"{"related":[],"next":null}"#)
        #expect(try await client.suggestions(id: ContentID("tmdb:movie:603")).next == nil)

        answer(200, #"{"versions":[],"resume_at":1140,"duration":4680,"next":null,"cast":[],"episode":{"id":"tmdb:tv:1396:s01e02","season":1,"number":2,"title":"Épisode 2"}}"#)
        let p = try await client.playback(id: ContentID("tmdb:tv:1396"))
        #expect(p.episode?.id == ContentID("tmdb:tv:1396:s01e02"))
        #expect(p.episode?.ref.code == "S1 · É2")
    }

    @Test func personTravelsAndTheCastDecodes() async throws {
        answer(200, #"{"id":"person:31","name":"Tom Hanks","photo":"https://kanstrimi.test/img/w185/h.jpg","facts":"2 titres","movies":[{"id":"tmdb:movie:1","kind":"movie","title":"Un"}],"series":[{"id":"tmdb:tv:2","kind":"series","title":"Deux"}]}"#)
        let sheet = try await client.person(id: "person:31")
        #expect(try last.url?.path() == "/player/people/person:31")
        #expect(sheet.name == "Tom Hanks")
        #expect(sheet.facts == "2 titres")
        #expect(sheet.photo == URL(string: "https://kanstrimi.test/img/w185/h.jpg"))
        #expect(sheet.movies.map(\.title) == ["Un"])
        #expect(sheet.series.map(\.title) == ["Deux"])

        // A sheet carries the cast with ids and photos, and an older one without them still decodes.
        answer(200, #"{"id":"tmdb:movie:1","kind":"movie","title":"Un","cast":[{"id":"person:31","name":"Tom Hanks","role":"Woody","photo":"https://kanstrimi.test/img/w185/h.jpg"},{"name":"Ancien","role":null}]}"#)
        let cast = try await client.detail(id: ContentID("tmdb:movie:1")).cast
        #expect(cast[0].id == "person:31")
        #expect(cast[0].photo == URL(string: "https://kanstrimi.test/img/w185/h.jpg"))
        #expect(cast[0].ref == PersonRef(id: "person:31", name: "Tom Hanks", photo: cast[0].photo))
        #expect(cast[1].id == nil)
        #expect(cast[1].photo == nil)
        #expect(cast[1].ref == nil)
    }

    @Test func studiosTravelAndFilterTheLists() async throws {
        answer(200, #"[{"id":"network:49","name":"HBO","logo":"https://kanstrimi.test/img/w300/hbo.png","count":144}]"#)
        let studios = try await client.studios(kind: .series)
        #expect(try last.url?.path() == "/player/series/studios")
        #expect(studios == [Studio(id: "network:49", name: "HBO", logo: URL(string: "https://kanstrimi.test/img/w300/hbo.png"), count: 144)])

        answer(200, #"{"items":[],"next_cursor":null}"#)
        var q = ListQuery(kind: .series)
        q.studio = "network:49"
        q.language = .vf
        _ = try await client.list(q)
        #expect(try query(last) == ["sort": "release", "studio": "network:49", "language": "VF"])
        // Clearing the filters keeps the studio.
        #expect(q.cleared.studio == "network:49" && q.cleared.language == nil)
    }

    @Test func searchSendsTheQueryOnly() async throws {
        answer(200, #"{"query":"heures","items":[]}"#)
        _ = try await client.search("heures")
        #expect(try query(last) == ["q": "heures"])
    }

    @Test("Un GET retente deux fois un 502 du proxy, puis réussit")
    func getRetriesProxyErrors() async throws {
        // The request is recorded before the handler runs: the count is the attempt number.
        StubProtocol.handler = { _ in StubProtocol.requests.count < 3 ? (502, Data()) : (200, Data(#"[]"#.utf8)) }
        _ = try await client.studios(kind: .movie)
        #expect(StubProtocol.requests.count == 3)
    }

    @Test("Au-delà de deux nouveaux essais, l'erreur remonte")
    func getGivesUpAfterTwoRetries() async throws {
        StubProtocol.handler = { _ in (503, Data()) }
        await #expect(throws: CatalogError.server("Erreur serveur (503)")) { try await client.studios(kind: .movie) }
        #expect(StubProtocol.requests.count == 3)
    }

    @Test("Une erreur du serveur lui-même n'est pas retentée")
    func serverErrorsAreAnswers() async throws {
        answer(502, #"{"error":{"code":"upstream","message":"Le fournisseur n'a pas répondu"}}"#)
        await #expect(throws: CatalogError.server("Le fournisseur n'a pas répondu")) { try await client.studios(kind: .movie) }
        #expect(StubProtocol.requests.count == 1)
    }

    @Test("Le corps d'erreur enregistré par le serveur : son message remonte tel quel")
    func recordedErrorBodyCarriesItsMessage() async throws {
        let body = try golden("error")
        let parsed = try #require(JSONSerialization.jsonObject(with: Data(body.utf8)) as? [String: Any])
        let inner = try #require(parsed["error"] as? [String: String])
        let message = try #require(inner["message"])
        #expect(inner["code"] == "not_found")
        answer(500, body)
        await #expect(throws: CatalogError.server(message)) { try await client.home() }
        #expect(StubProtocol.requests.count == 1)
    }

    @Test("Une écriture n'est jamais rejouée")
    func writesAreNotRetried() async throws {
        StubProtocol.handler = { _ in (502, Data()) }
        await #expect(throws: CatalogError.self) { try await client.setFavorite(id: ContentID("tmdb:movie:603"), true) }
        #expect(StubProtocol.requests.count == 1)
    }

    @Test("Les programmes d'une chaîne passent par /channels/{id}/programmes")
    func channelProgrammesTravel() async throws {
        answer(200, #"[{"title":"Journal","start":"2026-09-30T18:00:00.000Z","end":"2026-09-30T18:40:00.000Z","overview":"Les titres"},{"title":"Film","start":"2026-09-30T18:40:00.000Z","end":"2026-09-30T20:30:00.000Z","overview":null}]"#)
        let day = try await client.programmes(channel: ContentID("live:fr-tf1"), version: "vf-4k")
        #expect(day.map(\.title) == ["Journal", "Film"])
        #expect(day[0].overview == "Les titres")
        #expect(try last.url?.path() == "/player/channels/live:fr-tf1/programmes")
        #expect(try query(last) == ["version": "vf-4k"])
    }

    @Test("Une qualité au guide propre le porte ; les autres prennent celui de la chaîne")
    func guidePerQuality() async throws {
        let src = #"{"id":"s","container":"TS","stream_url":"demo://live","provider":null,"origin":null}"#
        answer(200, #"""
        {"id":"live:fr-m6","name":"M6","has_epg":true,
         "now":{"title":"Match en 4K","start":"2026-09-30T18:00:00.000Z","end":"2026-09-30T19:00:00.000Z","overview":null},"next":null,
         "versions":[{"id":"vf-4k","language":"VF","quality":"4K","sources":[\#(src)]},
                     {"id":"vf-hd","language":"VF","quality":"HD","sources":[\#(src)],"has_epg":true,
                      "now":{"title":"Météo","start":"2026-09-30T18:00:00.000Z","end":"2026-09-30T19:00:00.000Z","overview":null},"next":null}]}
        """#)
        let m6 = try await client.channel(id: ContentID("live:fr-m6"))
        #expect(m6.guide(for: m6.versions[0]).now?.title == "Match en 4K")
        #expect(m6.guide(for: m6.versions[1]).now?.title == "Météo")
        #expect(m6.guide(for: nil).now?.title == "Match en 4K")
    }

    @Test("Retirer de « Reprendre » et marquer vu : DELETE …/progress, PUT …/watched")
    func resumeCleanupTravels() async throws {
        answer(204, "")
        try await client.removeFromResume(id: ContentID("tmdb:movie:603"))
        #expect(try last.httpMethod == "DELETE")
        #expect(try last.url?.path() == "/player/playback/tmdb:movie:603/progress")

        try await client.setWatched(id: ContentID("tmdb:tv:1396"), true, season: 2)
        #expect(try last.httpMethod == "PUT")
        #expect(try last.url?.path() == "/player/playback/tmdb:tv:1396/watched")
        let body = try #require(JSONSerialization.jsonObject(with: StubProtocol.bodies.last ?? Data()) as? [String: Any])
        #expect(body["watched"] as? Bool == true)
        #expect(body["season"] as? Int == 2)

        try await client.setWatched(id: ContentID("tmdb:movie:603"), false, season: nil)
        let movieBody = try #require(JSONSerialization.jsonObject(with: StubProtocol.bodies.last ?? Data()) as? [String: Any])
        #expect(movieBody["watched"] as? Bool == false)
        #expect(movieBody["season"] == nil)
    }

    @Test("Marqueurs : POST …/markers avec la durée et les chapitres du fichier, récap, intro et générique décodés, absents tolérés")
    func markersTravel() async throws {
        answer(200, try golden("markers-episode"))
        let file = FileFacts(duration: 4800, chapters: [.init(name: "Intro", start: 71, end: 86), .init(name: "Credits", start: 4560, end: 4800)])
        let m = try await client.markers(id: ContentID("tmdb:tv:1396:s01e02"), file: file)
        #expect(try last.httpMethod == "POST")
        #expect(try last.url?.path() == "/player/playback/tmdb:tv:1396:s01e02/markers")
        let body = try #require(JSONSerialization.jsonObject(with: StubProtocol.bodies.last ?? Data()) as? [String: Any])
        #expect(body["duration"] as? Double == 4800)
        let chapters = try #require(body["chapters"] as? [[String: Any]])
        #expect(chapters.map { $0["name"] as? String } == ["Intro", "Credits"])
        #expect(chapters.first?["start"] as? Double == 71)
        #expect(chapters.first?["end"] as? Double == 86)
        #expect(m.skips == [.init(start: 0, end: 71, label: "Passer le récap"), .init(start: 71, end: 86, label: "Passer l'intro")])
        #expect(m.credits == PlaybackMarkers.Credits(at: 4560, countdown: 20))

        answer(200, try golden("markers-none"))
        #expect(try await client.markers(id: ContentID("tmdb:movie:603"), file: file) == PlaybackMarkers(skips: [], credits: nil))
    }

    @Test("Chaînes les plus regardées : POST …/watch-time, rangée d'accueil, rang sur /channels, type de rangée inconnu toléré")
    func mostWatchedChannelsTravel() async throws {
        answer(204, "")
        try await client.reportWatchTime(id: ContentID("live:fr-tf1"), seconds: 30)
        #expect(try last.httpMethod == "POST")
        #expect(try last.url?.path() == "/player/playback/live:fr-tf1/watch-time")
        let body = try #require(JSONSerialization.jsonObject(with: StubProtocol.bodies.last ?? Data()) as? [String: Any])
        #expect(body["seconds"] as? Int == 30)

        answer(200, #"{"heroes":[],"generated_at":"2026-10-01T18:00:00Z","rows":[{"id":"most-watched-channels","kind":"most_watched_channels","title":"Chaînes les plus regardées","cards":[{"id":"live:fr-tf1","kind":"live","title":"TF1"}]},{"id":"later","kind":"not_yet_known","title":"Plus tard","cards":[]}]}"#)
        let home = try await client.home()
        #expect(home.rows.map(\.kind) == [.mostWatchedChannels, .other])

        answer(200, #"[{"id":"fr-generalistes","name":"France · Généralistes","section":"France","theme":"Généralistes","channels":[{"id":"live:fr-tf1","name":"TF1","number":1,"logo":null,"has_epg":false,"is_favorite":false,"versions":[],"watched_rank":1},{"id":"live:fr-m6","name":"M6","number":6,"logo":null,"has_epg":false,"is_favorite":false,"versions":[]}]}]"#)
        let groups = try await client.channels()
        #expect(groups.flatMap(\.channels).map(\.watchedRank) == [1, nil])

        answer(200, #"[{"id":"ma-sport","name":"Maroc · Sport","section":"Maroc","theme":"Sport","channels":[]}]"#)
        let maroc = try await client.channels()
        #expect(maroc.map(\.section) == ["Maroc"])
        #expect(maroc.map(\.theme) == ["Sport"])
    }
}

/// The device's secrets in memory: the tests never touch the host app's Keychain.
@MainActor final class MemorySecrets: SecretStore {
    private var values: [String: String] = [:]
    func read(account: String) -> String? { values[account] }
    func write(_ value: String, account: String) { values[account] = value }
    func delete(account: String) { values[account] = nil }
}

@Test("Le jeton ne part en clair que sur le réseau local")
func tokenNeedsHTTPSOutsideTheLAN() {
    #expect(HTTPCatalogClient.mayCarryToken(URL(string: "https://kanstrimi.crafters.dev/player/home")!))
    #expect(HTTPCatalogClient.mayCarryToken(URL(string: "http://192.168.1.20:3000/player/home")!))
    #expect(HTTPCatalogClient.mayCarryToken(URL(string: "http://mac-mini.local:3000/player/home")!))
    #expect(!HTTPCatalogClient.mayCarryToken(URL(string: "http://kanstrimi.crafters.dev/player/home")!))
    #expect(!HTTPCatalogClient.mayCarryToken(URL(string: "http://8.8.8.8/player/home")!))
}

@Test("Une qualité, une dynamique ou un type inconnus de l'app ne font pas échouer le décodage")
func unknownEnumValuesDecode() throws {
    let d = HTTPCatalogClient.makeDecoder()
    #expect(try d.decode([Quality].self, from: Data(#"["8K","FHD"]"#.utf8)) == [.hd, .fhd])
    #expect(try d.decode([DynamicRange].self, from: Data(#"["HDR10+","DV"]"#.utf8)) == [.sdr, .dolbyVision])
    #expect(try d.decode([ContentKind].self, from: Data(#"["podcast","series"]"#.utf8)) == [.movie, .series])
}
