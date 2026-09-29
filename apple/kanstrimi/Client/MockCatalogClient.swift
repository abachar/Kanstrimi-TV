import Foundation

/// Serves the embedded JSON fixtures with a simulated latency and scriptable failures.
/// Keeps progress and favorites in memory so the UI reacts like it will with the server.
final class MockCatalogClient: CatalogClient {
    private struct ChannelsFile: Decodable { let groups: [ChannelGroup]; let epg: [String: [String]] }
    private struct StateFile: Decodable {
        struct Entry: Decodable { let content_id: ContentID; let position: TimeInterval; let duration: TimeInterval; let finished: Bool? }
        let progress: [Entry]
        let favorites: [ContentID]
    }

    let scenario: MockScenario
    private let movies: [Card]
    /// Groupings of fixture movies standing for TMDB collections: the fixtures hold no complete saga.
    private let sagaFixtures: [SagaFixture]
    /// Studio hubs over fixture movies.
    private let studioFixtures: [StudioFixture]
    private let series: [Card]
    private let groups: [ChannelGroup]
    private let epgTitles: [String: [String]]
    private var progress: [ContentID: Progress] = [:]
    private var favorites: Set<ContentID> = []
    private var pairingApproved = false
    private var pairingCreatedAt: Date?
    static let pageSize = 18
    /// Tests only: how many movies the fixtures hold, so a test never hard-codes the figure.
    var movieCount: Int { movies.count }
    static let rowSize = 20

    init(scenario: MockScenario) {
        self.scenario = scenario
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        func load<T: Decodable>(_ name: String, as type: T.Type) -> T {
            guard let url = Bundle.main.url(forResource: name, withExtension: "json"),
                  let data = try? Data(contentsOf: url) else { fatalError("Fixture \(name).json manquante") }
            do { return try decoder.decode(T.self, from: data) } catch { fatalError("Fixture \(name).json : \(error)") }
        }
        // The fixtures' `demo://` stream URLs lead nowhere: the mock shows the catalogue, playback is the real server's job.
        movies = load("movies", as: [Card].self)
        sagaFixtures = load("sagas", as: [SagaFixture].self)
        studioFixtures = load("studios", as: [StudioFixture].self)
        series = load("series", as: [Card].self)
        let ch = load("channels", as: ChannelsFile.self)
        groups = ch.groups
        epgTitles = ch.epg
        let state = load("state", as: StateFile.self)
        for e in state.progress {
            progress[e.content_id] = Progress(position: e.position, duration: e.duration, finished: e.finished ?? false)
        }
        favorites = Set(state.favorites)
    }

    // MARK: - Plumbing

    /// Simulated latency, then the scripted failures. Device calls carry no token: no 401 for them.
    private func gate(authenticated: Bool = true) async throws {
        if scenario.latency > 0 {
            try? await Task.sleep(for: .seconds(scenario.latency))
        }
        if authenticated, scenario.unauthorized { throw CatalogError.unauthorized }
        if scenario.offline { throw CatalogError.offline }
    }

    private var allCards: [Card] { movies + series }

    /// Base card for lists, with the live progress and hint.
    private func card(for d: Card) -> Card {
        let versions = d.kind == .series ? d.allEpisodes.flatMap(\.versions) : d.versions
        return Card(id: d.id, kind: d.kind, title: d.title, poster: d.poster, maxQuality: versions.maxQuality, dynamicRange: versions.maxDynamicRange,
                    languages: versions.languages, backdrop: d.backdrop, progress: progress[d.id], year: d.year, rating: d.rating,
                    genres: d.genres, hint: hint(for: d), addedAt: d.addedAt)
    }

    /// Resume card for an episode: the series card, the episode's progress and reference.
    private func resumeCard(series s: Card, episode e: Episode) -> Card {
        Card(id: e.id, kind: .episode, title: s.title, poster: s.poster, maxQuality: e.versions.maxQuality, dynamicRange: e.versions.maxDynamicRange,
             languages: e.languages, backdrop: s.backdrop, progress: progress[e.id], episode: e.ref)
    }

    private func hint(for d: Card) -> String? {
        if d.kind != .series {
            return d.versions.languages == [.vostfr] ? "VOSTFR seul" : nil
        }
        let eps = d.allEpisodes
        let langs = eps.flatMap(\.versions).languages
        if langs == [.vostfr] { return "VOSTFR seul" }
        if let last = d.seasons?.last, last.episodes.contains(where: { !$0.languages.contains(.vf) }), langs.contains(.vf) {
            return "VF partielle S\(last.number)"
        }
        return nil
    }

    /// The full card with live progress, favourite, series aggregates.
    private func merged(_ d: Card) -> Card {
        if d.kind == .series {
            let seasons = (d.seasons ?? []).map { s in
                Season(number: s.number, title: s.title, year: s.year, episodes: s.episodes.map { e in
                    Episode(id: e.id, season: e.season, number: e.number, title: e.title, overview: e.overview, runtime: e.runtime,
                            still: e.still, airDate: e.airDate, versions: e.versions, progress: progress[e.id])
                })
            }
            let eps = seasons.flatMap(\.episodes)
            let current = eps.first { $0.progress?.isResumable == true } ?? eps.first { $0.progress == nil }
            let versions = eps.flatMap(\.versions).deduplicatedByLanguageQuality().map {
                Version(id: $0.id, language: $0.language, quality: $0.quality, dynamicRange: $0.dynamicRange, sources: [])
            }
            return Card(id: d.id, kind: d.kind, title: d.title, poster: d.poster, maxQuality: versions.maxQuality, dynamicRange: versions.maxDynamicRange,
                        languages: versions.languages, backdrop: d.backdrop, progress: current?.progress, year: d.year, rating: d.rating,
                        genres: d.genres, hint: hint(for: d), addedAt: d.addedAt, originalTitle: d.originalTitle, endYear: d.endYear,
                        overview: d.overview, runtime: d.runtime, certification: d.certification, cast: d.cast, director: d.director,
                        trailer: d.trailer, hasTMDB: d.hasTMDB, providerCategory: d.providerCategory, rawTitle: d.rawTitle,
                        versions: versions, isFavorite: favorites.contains(d.id), seasons: seasons, currentEpisode: current?.ref)
        }
        return Card(id: d.id, kind: d.kind, title: d.title, poster: d.poster, maxQuality: d.versions.maxQuality, dynamicRange: d.versions.maxDynamicRange,
                    languages: d.versions.languages, backdrop: d.backdrop, progress: progress[d.id], year: d.year, rating: d.rating,
                    genres: d.genres, hint: hint(for: d), addedAt: d.addedAt, originalTitle: d.originalTitle, endYear: d.endYear,
                    overview: d.overview, runtime: d.runtime, certification: d.certification, cast: d.cast, director: d.director,
                    trailer: d.trailer, hasTMDB: d.hasTMDB, providerCategory: d.providerCategory, rawTitle: d.rawTitle,
                    versions: d.versions, isFavorite: favorites.contains(d.id), saga: sagaFixtures.first { $0.movies.contains(d.id) }?.saga.ref)
    }

    private func episode(_ id: ContentID) -> (series: Card, episode: Episode)? {
        for s in series {
            if let e = s.allEpisodes.first(where: { $0.id == id }) { return (s, e) }
        }
        return nil
    }

    private func rawChannel(_ id: ContentID) -> Channel? {
        groups.flatMap(\.channels).first { $0.id == id }
    }

    // MARK: - Devices and info

    func createDevice() async throws -> PairingCode {
        try await gate(authenticated: false)
        pairingApproved = false
        pairingCreatedAt = .now
        let alphabet = Array("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
        let code = String((0..<6).map { _ in alphabet.randomElement()! })
        let ttl: TimeInterval = scenario.pairingExpires ? 6 : 600
        return PairingCode(code: code, expiresAt: .now.addingTimeInterval(ttl),
                           url: URL(string: "https://kanstrimi.crafters.dev/admin/pair/\(code)")!)
    }

    /// Réglages › Démo and the pairing screen call this to stand in for the admin.
    func approvePairing() { pairingApproved = true }

    func pollDevice(code: String) async throws -> PairingStatus {
        try await gate(authenticated: false)
        if scenario.pairingExpires, let created = pairingCreatedAt, Date.now.timeIntervalSince(created) > 6 { return .expired }
        if scenario.pairingApprovalDelay > 0, let created = pairingCreatedAt,
           Date.now.timeIntervalSince(created) > scenario.pairingApprovalDelay { pairingApproved = true }
        guard pairingApproved else { return .pending }
        // A freshly approved device gets a valid token: the "revoked" scenario ends here.
        scenario.unauthorized = false
        return .approved(token: "mock-" + UUID().uuidString.lowercased(), deviceName: "Salon")
    }

    func deleteDevice(code: String) async throws { try await gate() }

    func info() async throws -> ServerInfo {
        try await gate()
        return ServerInfo(serverVersion: "0.9.3 (maquette)", counts: CatalogCounts(movies: 35_219, series: 22_174, channels: 722),
                          lastImport: Calendar.current.date(bySettingHour: 4, minute: 10, second: 0, of: .now), tmdbRate: 0.97,
                          catalogLanguages: [.vf, .vostfr, .vo], defaultLanguageOrder: [.vf, .vostfr, .vo])
    }

    // MARK: - Home

    func home() async throws -> HomeScreen {
        try await gate()
        let recentMovies = movies.filter(\.isMatched).sorted { ($0.addedAt ?? .distantPast) > ($1.addedAt ?? .distantPast) }
        let recentSeries = series.sorted { ($0.addedAt ?? .distantPast) > ($1.addedAt ?? .distantPast) }
        var resume: [Card] = []
        for (id, p) in progress where p.isResumable {
            if let m = movies.first(where: { $0.id == id }) { resume.append(card(for: m)) }
            else if let (s, e) = episode(id) { resume.append(resumeCard(series: s, episode: e)) }
        }
        // The fixtures have no watch timestamp: the furthest along comes first.
        resume.sort { ($0.progress?.fraction ?? 0) > ($1.progress?.fraction ?? 0) }
        var rows: [HomeRow] = []
        if !resume.isEmpty { rows.append(HomeRow(id: "resume", kind: .resume, title: "Reprendre", cards: resume)) }
        rows.append(HomeRow(id: "recent-movies", kind: .recentMovies, title: "Nouveautés", cards: recentMovies.prefix(12).map { card(for: $0) }))
        rows.append(HomeRow(id: "recent-series", kind: .recentSeries, title: "Derniers épisodes", cards: recentSeries.prefix(12).map { card(for: $0) }))
        let favs = allCards.filter { favorites.contains($0.id) }.map { card(for: $0) }
        if !favs.isEmpty { rows.append(HomeRow(id: "favorites", kind: .favorites, title: "Ma liste", cards: favs)) }
        let heroDetail = recentMovies.first!
        let hero = HomeHero(card: card(for: heroDetail), tagline: "FILM · NOUVEAUTÉ", overview: heroDetail.overview,
                            runtime: heroDetail.runtime, certification: heroDetail.certification, versions: heroDetail.versions)
        return HomeScreen(hero: hero, rows: rows, generatedAt: .now)
    }

    // MARK: - Movies and series

    func rows(kind: ContentKind) async throws -> [CatalogRow] {
        try await gate()
        let pool = (kind == .series ? series : movies).map { card(for: $0) }
        let recent = pool.sorted { ($0.addedAt ?? .distantPast) > ($1.addedAt ?? .distantPast) }
        var rows = [CatalogRow(id: "recent", name: kind == .series ? "Derniers épisodes" : "Nouveautés", total: recent.count, cards: Array(recent.prefix(Self.rowSize)))]
        var byGenre: [String: [Card]] = [:]
        for c in pool { for g in c.genres { byGenre[g, default: []].append(c) } }
        for (genre, cards) in byGenre.sorted(by: { $0.value.count != $1.value.count ? $0.value.count > $1.value.count : $0.key < $1.key }) {
            rows.append(CatalogRow(id: genre.lowercased(), name: genre, total: cards.count, cards: Array(cards.prefix(Self.rowSize))))
        }
        return rows
    }

    func list(_ query: ListQuery) async throws -> Page<Card> {
        try await gate()
        let offset = Int(query.cursor ?? "0") ?? 0
        if scenario.failingSecondPage, offset > 0 { throw CatalogError.server("Le fournisseur n'a pas répondu (page \(offset / Self.pageSize + 1))") }
        let all = filtered(query)
        let slice = Array(all.dropFirst(offset).prefix(Self.pageSize))
        let next = offset + slice.count < all.count ? String(offset + slice.count) : nil
        return Page(items: slice, nextCursor: next)
    }

    private func filtered(_ query: ListQuery) -> [Card] {
        var cards = (query.kind == .series ? series : movies).map { card(for: $0) }
        if let s = query.studio { cards = cards.filter { studioFixtures.first { $0.id == s }?.movies.contains($0.id) ?? false } }
        if let g = query.genre, g != "recent" { cards = cards.filter { $0.genres.contains { $0.lowercased() == g } } }
        if let l = query.language { cards = cards.filter { $0.languages.contains(l) } }
        if let q = query.minQuality { cards = cards.filter { ($0.maxQuality ?? .sd) >= q } }
        if let dr = query.dynamicRange { cards = cards.filter { ($0.dynamicRange ?? .sdr) >= dr } }
        if query.vfAvailable { cards = cards.filter { $0.languages.contains(.vf) } }
        switch query.sort {
        case .release, .year: cards.sort { ($0.year ?? 0) > ($1.year ?? 0) }
        case .recent, .latestEpisodes: cards.sort { ($0.addedAt ?? .distantPast) > ($1.addedAt ?? .distantPast) }
        case .title: cards.sort { $0.title.localizedStandardCompare($1.title) == .orderedAscending }
        case .rating: cards.sort { ($0.rating ?? 0) > ($1.rating ?? 0) }
        }
        return cards
    }

    func detail(id: ContentID) async throws -> Card {
        try await gate()
        if scenario.failingDetail { throw CatalogError.server("Le fournisseur n'a pas répondu.") }
        if let d = allCards.first(where: { $0.id == id }) { return merged(d) }
        throw CatalogError.notFound
    }

    func studios(kind: ContentKind) async throws -> [Studio] {
        try await gate()
        return kind == .series ? [] : studioFixtures.map { Studio(id: $0.id, name: $0.name, logo: $0.logo, count: $0.movies.count) }
    }

    func sagas(cursor: String?) async throws -> Page<Saga> {
        try await gate()
        return Page(items: sagaFixtures.map(\.saga), nextCursor: nil, total: sagaFixtures.count)
    }

    func saga(id: String) async throws -> SagaSheet {
        try await gate()
        guard let f = sagaFixtures.first(where: { $0.id == id }) else { throw CatalogError.notFound }
        let cards = movies.filter { f.movies.contains($0.id) }.sorted { ($0.year ?? 0) < ($1.year ?? 0) }.map { card(for: $0) }
        return SagaSheet(id: f.id, name: f.name, count: cards.count, poster: f.poster, backdrop: f.backdrop, movies: cards)
    }

    // MARK: - Live

    func channels() async throws -> [ChannelGroup] {
        try await gate()
        return groups.map { g in ChannelGroup(id: g.id, name: g.name, channels: g.channels.map { withFavorite($0) }) }
    }

    func channel(id: ContentID) async throws -> Channel {
        try await gate()
        guard let c = rawChannel(id) else { throw CatalogError.notFound }
        let day = scenario.emptyEPG || c.hasEPG == false ? [] : schedule(for: c)
        let (now, next) = (day.first, day.dropFirst().first)
        return Channel(id: c.id, name: c.name, number: c.number, logo: c.logo, maxQuality: c.maxQuality, hasEPG: c.hasEPG,
                       isFavorite: favorites.contains(c.id) || c.isFavorite == true, versions: c.versions, now: now, next: next)
    }

    private func withFavorite(_ c: Channel) -> Channel {
        var c = c
        c.isFavorite = favorites.contains(c.id) || c.isFavorite == true
        return c
    }

    func programmes(channel id: ContentID) async throws -> [Programme] {
        try await gate()
        guard let c = rawChannel(id) else { throw CatalogError.notFound }
        return scenario.emptyEPG || c.hasEPG == false ? [] : schedule(for: c)
    }

    /// Deterministic schedule: slots of 45 to 120 minutes anchored on the hour, seeded by the channel,
    /// from the one on air until the next 6:00 (the end of the broadcast day, as the server cuts it).
    private func schedule(for c: Channel) -> [Programme] {
        let group = groups.first { $0.channels.contains { $0.id == c.id } }
        guard let titles = group.flatMap({ epgTitles[$0.name] }), !titles.isEmpty else { return [] }
        let seed = c.name.unicodeScalars.reduce(0) { $0 + Int($1.value) }
        let slot = TimeInterval([45, 60, 90, 120][seed % 4] * 60)
        let anchor = Calendar.current.startOfDay(for: .now)
        let first = Int(Date.now.timeIntervalSince(anchor) / slot)
        var sixAM = Calendar.current.date(bySettingHour: 6, minute: 0, second: 0, of: .now)!
        if sixAM <= .now { sixAM = Calendar.current.date(byAdding: .day, value: 1, to: sixAM)! }
        return Array((first...).lazy.map { index in
            let start = anchor.addingTimeInterval(TimeInterval(index) * slot)
            return Programme(title: titles[(index + seed) % titles.count], start: start, end: start.addingTimeInterval(slot),
                             overview: index == first ? "Programme de démonstration généré par le client mock." : nil)
        }
        .prefix { $0.start < sixAM })
    }

    // MARK: - Playback

    func playback(id: ContentID) async throws -> Playback {
        try await gate()
        if let m = movies.first(where: { $0.id == id }) {
            let p = progress[id]
            return Playback(versions: m.versions, resumeAt: p?.isResumable == true ? p?.position : nil,
                            duration: p?.duration ?? m.runtime.map { TimeInterval($0 * 60) }, next: nil)
        }
        if let (s, e) = episode(id) {
            let eps = s.allEpisodes
            let idx = eps.firstIndex(of: e)!
            let nextEp = idx + 1 < eps.count ? eps[idx + 1] : nil
            let p = progress[id]
            return Playback(versions: e.versions, resumeAt: p?.isResumable == true ? p?.position : nil,
                            duration: p?.duration ?? e.runtime.map { TimeInterval($0 * 60) },
                            next: nextEp.map { NextEpisode(id: $0.id, title: $0.title, season: $0.season, number: $0.number, runtime: $0.runtime,
                                                           languages: $0.languages, maxQuality: $0.versions.maxQuality,
                                                           dynamicRange: $0.versions.maxDynamicRange, still: $0.still) })
        }
        if let c = rawChannel(id) {
            return Playback(versions: c.versions, resumeAt: nil, duration: nil, next: nil)
        }
        throw CatalogError.notFound
    }

    func report(_ report: ProgressReport) async throws {
        try await gate()
        progress[report.contentID] = Progress(position: report.position, duration: report.duration,
                                              finished: report.duration > 0 && report.position / report.duration >= 0.9)
    }

    // MARK: - Search and favourites

    func search(_ query: String, scope: SearchScope) async throws -> SearchResults {
        try await gate()
        let q = query.trimmingCharacters(in: .whitespaces).folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
        if q.isEmpty || scenario.emptySearch { return SearchResults(query: query, best: nil, movies: [], series: [], live: []) }
        func matches(_ d: Card) -> Bool {
            let hay = ([d.title, d.director ?? ""] + d.cast.map(\.name)).joined(separator: " ")
                .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
            return hay.contains(q)
        }
        let m = (scope == .all || scope == .movies) ? movies.filter(matches).map { card(for: $0) } : []
        let s = (scope == .all || scope == .series) ? series.filter(matches).map { card(for: $0) } : []
        let l = (scope == .all || scope == .live) ? groups.flatMap { g in g.channels.filter {
            $0.name.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current).contains(q)
        }.map { c in
            Card(id: c.id, kind: .live, title: c.name, poster: c.logo, maxQuality: c.maxQuality, languages: c.versions.languages, genres: [g.name])
        } } : []
        let best = (m + s + l).min { a, b in
            let ta = a.title.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current).hasPrefix(q)
            let tb = b.title.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current).hasPrefix(q)
            if ta != tb { return ta }
            return (a.rating ?? 0) > (b.rating ?? 0)
        }
        return SearchResults(query: query, best: best, movies: m, series: s, live: l)
    }

    func removeFromResume(id: ContentID) async throws {
        try await gate()
        progress[id] = nil
    }

    /// Like the server: « vu » = the position at the end, « non vu » = no progress at all.
    func setWatched(id: ContentID, _ watched: Bool, season: Int?) async throws {
        try await gate()
        let ids = series.first { $0.id == id }.map { s in
            (s.seasons ?? []).filter { season == nil || $0.number == season }.flatMap(\.episodes).map(\.id)
        } ?? [id]
        for id in ids {
            let d = max(1, progress[id]?.duration ?? 1)
            progress[id] = watched ? Progress(position: d, duration: d, finished: true) : nil
        }
    }

    func setFavorite(id: ContentID, _ favorite: Bool) async throws {
        try await gate()
        if favorite { favorites.insert(id) } else { favorites.remove(id) }
    }
}

nonisolated extension Array where Element == Version {
    /// One entry per language × quality × dynamic range, keeping the first occurrence.
    func deduplicatedByLanguageQuality() -> [Version] {
        var seen = Set<String>()
        return filter { seen.insert("\($0.language.rawValue)/\($0.quality.rawValue)/\($0.dynamicRange?.rawValue ?? "")").inserted }
    }
}

/// `Fixtures/sagas.json`: a saga and the fixture movies it groups.
private nonisolated struct SagaFixture: Decodable {
    let id: String
    let name: String
    let poster: URL?
    let backdrop: URL?
    let movies: [ContentID]

    var saga: Saga { Saga(id: id, name: name, count: movies.count, poster: poster, backdrop: backdrop) }
}

/// `Fixtures/studios.json`: a studio hub and the fixture movies it holds.
private nonisolated struct StudioFixture: Decodable {
    let id: String
    let name: String
    let logo: URL?
    let movies: [ContentID]
}
