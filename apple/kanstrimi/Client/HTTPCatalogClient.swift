import Foundation

/// `/player` over HTTPS, the real thing behind `CatalogClient`. One URLSession, the device
/// token read from the Keychain store at every call (it appears right after pairing),
/// server errors mapped to `CatalogError` so a 401 anywhere becomes the unpairing flow.
final class HTTPCatalogClient: CatalogClient {
    let baseURL: URL
    private let device: DeviceStore
    private let session: URLSession
    /// Pauses before each new try of a GET that failed on a passing hiccup; one entry per retry.
    private let retryDelays: [Duration]

    /// - Parameter baseURL: the server root, e.g. `https://kanstrimi.crafters.dev`; `/player` is appended here.
    init(baseURL: URL, device: DeviceStore, session: URLSession? = nil,
         retryDelays: [Duration] = [.milliseconds(500), .milliseconds(1500)]) {
        self.retryDelays = retryDelays
        self.baseURL = baseURL.appending(path: "player")
        self.device = device
        self.session = session ?? {
            let c = URLSessionConfiguration.default
            c.timeoutIntervalForRequest = 20
            c.waitsForConnectivity = false
            c.httpAdditionalHeaders = ["Accept": "application/json"]
            return URLSession(configuration: c)
        }()
    }

    // MARK: - Devices

    func createDevice() async throws -> PairingCode {
        try await send("POST", "devices", auth: false)
    }
    func pollDevice(code: String) async throws -> PairingStatus {
        try await send("GET", "devices/\(code)", auth: false)
    }
    func deleteDevice(code: String) async throws {
        try await sendNoContent("DELETE", "devices/\(code)")
    }
    func info() async throws -> ServerInfo { try await send("GET", "info") }

    // MARK: - Home, movies, series

    func home() async throws -> HomeScreen { try await send("GET", "home") }

    func rows(kind: ContentKind) async throws -> [CatalogRow] {
        try await send("GET", Self.collection(kind))
    }
    func list(_ query: ListQuery) async throws -> Page<ContentItem> {
        var q: [URLQueryItem] = [URLQueryItem(name: "sort", value: query.sort.rawValue)]
        if let g = query.genre { q.append(URLQueryItem(name: "genre", value: g)) }
        if let l = query.language { q.append(URLQueryItem(name: "language", value: l.rawValue)) }
        if let m = query.minQuality { q.append(URLQueryItem(name: "min_quality", value: m.rawValue)) }
        if let d = query.dynamicRange { q.append(URLQueryItem(name: "dynamic_range", value: d.rawValue)) }
        if query.vfAvailable { q.append(URLQueryItem(name: "vf_available", value: "1")) }
        if let s = query.studio { q.append(URLQueryItem(name: "studio", value: s)) }
        if let c = query.cursor { q.append(URLQueryItem(name: "cursor", value: c)) }
        return try await send("GET", Self.collection(query.kind), query: q)
    }
    func detail(id: ContentID) async throws -> Card {
        try await send("GET", "\(Self.collection(Self.kind(of: id)))/\(id.rawValue)")
    }
    func studios(kind: ContentKind) async throws -> [Studio] { try await send("GET", "\(Self.collection(kind))/studios") }
    func sagas(cursor: String?) async throws -> Page<ContentItem> {
        try await send("GET", "movies/sagas", query: cursor.map { [URLQueryItem(name: "cursor", value: $0)] } ?? [])
    }
    func saga(id: String) async throws -> SagaSheet { try await send("GET", "movies/sagas/\(id)") }
    func person(id: String) async throws -> PersonSheet { try await send("GET", "people/\(id)") }

    // MARK: - Live

    func channels() async throws -> [ChannelGroup] { try await send("GET", "channels") }
    func channel(id: ContentID) async throws -> Channel { try await send("GET", "channels/\(id.rawValue)") }
    func programmes(channel id: ContentID, version: String?) async throws -> [Programme] {
        try await send("GET", "channels/\(id.rawValue)/programmes", query: version.map { [URLQueryItem(name: "version", value: $0)] } ?? [])
    }

    // MARK: - Playback

    func playback(id: ContentID) async throws -> Playback { try await send("GET", "playback/\(id.rawValue)") }
    func suggestions(id: ContentID) async throws -> Suggestions { try await send("GET", "playback/\(id.rawValue)/suggestions") }
    func report(_ progress: ProgressReport) async throws {
        struct Body: Encodable { let position: Double; let duration: Double }
        try await sendNoContent("PUT", "playback/\(progress.contentID.rawValue)/progress",
                                body: Body(position: progress.position.rounded(), duration: progress.duration.rounded()))
    }

    func reportWatchTime(id: ContentID, seconds: Int) async throws {
        struct Body: Encodable { let seconds: Int }
        try await sendNoContent("POST", "playback/\(id.rawValue)/watch-time", body: Body(seconds: seconds))
    }

    // MARK: - Search, favourites

    func search(_ query: String) async throws -> SearchResults {
        try await send("GET", "search", query: [URLQueryItem(name: "q", value: query)])
    }
    func removeFromResume(id: ContentID) async throws {
        try await sendNoContent("DELETE", "playback/\(id.rawValue)/progress")
    }
    func setWatched(id: ContentID, _ watched: Bool, season: Int?) async throws {
        struct Body: Encodable { let watched: Bool; let season: Int? }
        try await sendNoContent("PUT", "playback/\(id.rawValue)/watched", body: Body(watched: watched, season: season))
    }

    func setFavorite(id: ContentID, _ favorite: Bool) async throws {
        try await sendNoContent(favorite ? "PUT" : "DELETE", "favorites/\(id.rawValue)")
    }

    // MARK: - Plumbing

    static func collection(_ kind: ContentKind) -> String { kind == .series || kind == .episode ? "series" : "movies" }
    /// The id says what it is: `tmdb:tv:…` and `fallback:series:…` are series, the rest are movies.
    static func kind(of id: ContentID) -> ContentKind {
        id.rawValue.hasPrefix("tmdb:tv:") || id.rawValue.hasPrefix("fallback:series:") ? .series : .movie
    }

    /// The token travels over HTTPS, or in clear on the local network only (a development server).
    nonisolated static func mayCarryToken(_ url: URL) -> Bool {
        if url.scheme == "https" { return true }
        guard url.scheme == "http", let host = url.host()?.lowercased() else { return false }
        if host == "localhost" || host.hasSuffix(".local") || !host.contains(".") { return true }
        let parts = host.split(separator: ".").compactMap { Int($0) }
        guard parts.count == 4 else { return false }
        return parts[0] == 10 || parts[0] == 127 || (parts[0] == 192 && parts[1] == 168) || (parts[0] == 172 && (16...31).contains(parts[1]))
    }

    private func makeRequest(_ method: String, _ path: String, query: [URLQueryItem], auth: Bool, body: (any Encodable)?) throws -> URLRequest {
        var url = baseURL
        for segment in path.split(separator: "/") { url.append(path: String(segment)) }
        if !query.isEmpty { url.append(queryItems: query) }
        var req = URLRequest(url: url)
        req.httpMethod = method
        if auth {
            guard let token = device.token else { throw CatalogError.unauthorized }
            guard Self.mayCarryToken(url) else { throw CatalogError.server("Adresse du serveur non chiffrée : https requis hors du réseau local") }
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode(body)
        }
        return req
    }

    /// A GET that fails on a passing hiccup is tried again after each of `retryDelays`; any other
    /// method goes once, a write is never repeated behind the user's back.
    private func perform(_ req: URLRequest) async throws -> (Data, HTTPURLResponse) {
        var delays = req.httpMethod == "GET" ? retryDelays[...] : []
        while true {
            let data: Data, response: URLResponse
            do { (data, response) = try await session.data(for: req) }
            catch let e as URLError {
                // A screen left before its answer: not an error to show, the caller just stops.
                if e.code == .cancelled { throw CancellationError() }
                if Self.isTransient(e), let delay = delays.popFirst() { try await Task.sleep(for: delay); continue }
                throw Self.map(e)
            }
            catch is CancellationError { throw CancellationError() }
            catch { throw CatalogError.server(error.localizedDescription) }
            guard let http = response as? HTTPURLResponse else { throw CatalogError.server("Réponse invalide") }
            if (200..<300).contains(http.statusCode) { return (data, http) }
            if Self.isTransient(status: http.statusCode, data: data), let delay = delays.popFirst() { try await Task.sleep(for: delay); continue }
            throw Self.error(status: http.statusCode, data: data)
        }
    }

    /// A connection dropped or refused, a name not resolved: worth another try. Not a timeout
    /// (20 s already spent), not the device being offline, not a cancellation.
    static func isTransient(_ e: URLError) -> Bool {
        [.networkConnectionLost, .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed].contains(e.code)
    }
    /// 502-504 without the server's JSON error: the reverse proxy answering while the server
    /// restarts. The server's own errors (`upstream`) are answers, not hiccups.
    static func isTransient(status: Int, data: Data) -> Bool {
        (502...504).contains(status) && (try? JSONDecoder().decode(ErrorBody.self, from: data)) == nil
    }

    private func send<T: Decodable & Sendable>(_ method: String, _ path: String, query: [URLQueryItem] = [], auth: Bool = true, body: (any Encodable)? = nil) async throws -> T {
        let (data, _) = try await perform(try makeRequest(method, path, query: query, auth: auth, body: body))
        return try await Self.decode(T.self, from: data)
    }
    /// Off the main actor: `/channels` or `/home` decoded there would stutter the focus moving meanwhile.
    @concurrent nonisolated private static func decode<T: Decodable & Sendable>(_ type: T.Type, from data: Data) async throws -> T {
        do { return try makeDecoder().decode(T.self, from: data) }
        catch { throw CatalogError.decoding(describe(error)) }
    }
    private func sendNoContent(_ method: String, _ path: String, auth: Bool = true, body: (any Encodable)? = nil) async throws {
        _ = try await perform(try makeRequest(method, path, query: [], auth: auth, body: body))
    }

    private struct ErrorBody: Decodable { struct Inner: Decodable { let code: String; let message: String }; let error: Inner }

    static func error(status: Int, data: Data) -> CatalogError {
        let body = try? JSONDecoder().decode(ErrorBody.self, from: data)
        switch status {
        case 401: return .unauthorized
        case 404: return .notFound
        default: return .server(body?.error.message ?? "Erreur serveur (\(status))")
        }
    }
    static func map(_ e: URLError) -> CatalogError {
        switch e.code {
        case .notConnectedToInternet, .timedOut, .cannotFindHost, .cannotConnectToHost, .networkConnectionLost, .dnsLookupFailed, .internationalRoamingOff, .dataNotAllowed:
            return .offline
        default: return .server(e.localizedDescription)
        }
    }
    nonisolated private static func describe(_ error: Error) -> String {
        guard let d = error as? DecodingError else { return error.localizedDescription }
        switch d {
        case .keyNotFound(let k, let c): return "clé \(k.stringValue) absente (\(c.codingPath.map(\.stringValue).joined(separator: ".")))"
        case .typeMismatch(let t, let c): return "type \(t) attendu (\(c.codingPath.map(\.stringValue).joined(separator: ".")))"
        case .valueNotFound(let t, let c): return "valeur \(t) absente (\(c.codingPath.map(\.stringValue).joined(separator: ".")))"
        case .dataCorrupted(let c): return c.debugDescription
        @unknown default: return d.localizedDescription
        }
    }

    /// ISO 8601 with or without fractional seconds: `toISOString()` sends milliseconds, Postgres dates do not.
    nonisolated static func makeDecoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let s = try decoder.singleValueContainer().decode(String.self)
            if let date = parseISO8601(s) { return date }
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "date ISO 8601 attendue : \(s)"))
        }
        return d
    }
    nonisolated static func parseISO8601(_ s: String) -> Date? {
        fractionalISO8601.date(from: s) ?? plainISO8601.date(from: s)
    }
    // Built once: a formatter per date made a thousand of them for `/channels`. Parsing is thread-safe.
    private nonisolated(unsafe) static let fractionalISO8601: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private nonisolated(unsafe) static let plainISO8601: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()
}
