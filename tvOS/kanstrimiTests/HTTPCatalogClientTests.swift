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
        device = DeviceStore()
        device.store(token: "dvc_test", code: "K7Q4MZ")
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubProtocol.self]
        client = HTTPCatalogClient(baseURL: URL(string: "https://kanstrimi.test")!, device: device, session: URLSession(configuration: config))
        StubProtocol.requests = []
        StubProtocol.bodies = []
        StubProtocol.handler = nil
    }

    private func answer(_ status: Int = 200, _ json: String) {
        StubProtocol.handler = { _ in (status, Data(json.utf8)) }
    }
    private var last: URLRequest { get throws { try #require(StubProtocol.requests.last) } }
    private var lastBody: [String: Double] { (try? JSONDecoder().decode([String: Double].self, from: StubProtocol.bodies.last ?? Data())) ?? [:] }
    private func query(_ req: URLRequest) throws -> [String: String] {
        let url = try #require(req.url)
        let items = try #require(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems)
        return Dictionary(uniqueKeysWithValues: items.map { ($0.name, $0.value ?? "") })
    }

    @Test func pairingCallsCarryNoTokenAndDecodeEveryStatus() async throws {
        answer(201, #"{"code":"K7Q4MZ","expires_at":"2026-09-26T21:24:00.123Z","url":"https://kanstrimi.test/admin/pair/K7Q4MZ"}"#)
        let created = try await client.createDevice()
        #expect(created.code == "K7Q4MZ")
        #expect(created.url.path() == "/admin/pair/K7Q4MZ")
        #expect(try last.httpMethod == "POST")
        #expect(try last.url?.path() == "/api/v1/devices")
        #expect(try last.value(forHTTPHeaderField: "Authorization") == nil)

        answer(200, #"{"status":"pending"}"#)
        #expect(try await client.pollDevice(code: "K7Q4MZ") == .pending)
        answer(200, #"{"status":"approved","token":"dvc_abc","device_name":"Salon"}"#)
        #expect(try await client.pollDevice(code: "K7Q4MZ") == .approved(token: "dvc_abc", deviceName: "Salon"))
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
        answer(404, #"{"error":{"code":"not_found","message":"Contenu introuvable"}}"#)
        await #expect(throws: CatalogError.notFound) { try await client.detail(id: ContentID("tmdb:movie:1")) }
        answer(502, #"{"error":{"code":"upstream","message":"Le fournisseur n'a pas répondu"}}"#)
        await #expect(throws: CatalogError.server("Le fournisseur n'a pas répondu")) { try await client.home() }
        answer(200, #"{"not":"a home"}"#)
        await #expect(throws: CatalogError.self) { try await client.home() }
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
        #expect(try last.url?.path() == "/api/v1/series")
        #expect(try query(last) == ["sort": "latest_episodes", "genre": "thriller", "language": "VOSTFR", "min_quality": "FHD", "dynamic_range": "HDR", "vf_available": "1", "cursor": "abc=="])

        answer(200, "[]")
        _ = try await client.rows(kind: .movie)
        #expect(try last.url?.absoluteString == "https://kanstrimi.test/api/v1/movies")
    }

    @Test func idsPickTheirCollectionAndStayInThePath() async throws {
        answer(200, #"{"id":"tmdb:tv:1396","kind":"series","title":"Vincenzo"}"#)
        _ = try await client.detail(id: ContentID("tmdb:tv:1396"))
        #expect(try last.url?.path() == "/api/v1/series/tmdb:tv:1396")
        answer(200, #"{"id":"fallback:movie:tenet:2020","kind":"movie","title":"Tenet"}"#)
        _ = try await client.detail(id: ContentID("fallback:movie:tenet:2020"))
        #expect(try last.url?.path() == "/api/v1/movies/fallback:movie:tenet:2020")
        answer(200, #"{"versions":[],"resume_at":1140,"duration":3060,"next":null}"#)
        let p = try await client.playback(id: ContentID("tmdb:tv:1396:s01e05"))
        #expect(p.resumeAt == 1140)
        #expect(try last.url?.path() == "/api/v1/playback/tmdb:tv:1396:s01e05")
    }

    @Test func progressAndFavouritesAreNoContentCalls() async throws {
        answer(204, "")
        try await client.report(ProgressReport(contentID: ContentID("tmdb:movie:603"), position: 1170.4, duration: 3060, sentAt: .now))
        #expect(try last.httpMethod == "PUT")
        #expect(try last.url?.path() == "/api/v1/playback/tmdb:movie:603/progress")
        #expect(lastBody == ["position": 1170, "duration": 3060])
        try await client.setFavorite(id: ContentID("live:fr-tf1"), true)
        #expect(try last.httpMethod == "PUT" && last.url?.path() == "/api/v1/favorites/live:fr-tf1")
        try await client.setFavorite(id: ContentID("live:fr-tf1"), false)
        #expect(try last.httpMethod == "DELETE")
        try await client.deleteDevice(code: "K7Q4MZ")
        #expect(try last.httpMethod == "DELETE" && last.url?.path() == "/api/v1/devices/K7Q4MZ")
    }

    @Test func datesDecodeWithAndWithoutFractionalSeconds() async throws {
        answer(200, #"{"hero":null,"rows":[{"id":"recent-movies","kind":"recent_movies","title":"Films récents","cards":[{"id":"tmdb:movie:603","kind":"movie","title":"Matrix","added_at":"2026-09-01T00:00:00Z"}]}],"generated_at":"2026-09-26T21:14:00.512Z"}"#)
        let home = try await client.home()
        #expect(home.rows[0].cards[0].addedAt == HTTPCatalogClient.parseISO8601("2026-09-01T00:00:00Z"))
        #expect(abs(home.generatedAt.timeIntervalSince1970 - 1790457240.512) < 0.001)
        #expect(home.hero == nil)
    }

    @Test func searchScopeTravels() async throws {
        answer(200, #"{"query":"heures","best":null,"movies":[],"series":[],"live":[]}"#)
        _ = try await client.search("heures", scope: .live)
        #expect(try query(last) == ["q": "heures", "scope": "live"])
    }
}
