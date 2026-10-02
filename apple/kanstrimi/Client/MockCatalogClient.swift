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
    /// Read at the first call, not at launch: the app built on the server never pays for a megabyte of fixtures.
    private lazy var fixtures = MockFixtures.load()
    private var movies: [Card] { fixtures.movies }
    /// Groupings of fixture movies standing for TMDB collections: the fixtures hold no complete saga.
    private var sagaFixtures: [SagaFixture] { fixtures.sagas }
    /// Studio hubs over fixture movies.
    private var studioFixtures: [StudioFixture] { fixtures.studios }
    private var series: [Card] { fixtures.series }
    private var groups: [ChannelGroup] { fixtures.groups }
    private var epgTitles: [String: [String]] { fixtures.epgTitles }
    private lazy var progress: [ContentID: Progress] = fixtures.progress
    private lazy var favorites: Set<ContentID> = fixtures.favorites
    private var pairingApproved = false
    private var pairingCreatedAt: Date?
    static let pageSize = 18
    /// Tests only: how many movies the fixtures hold, so a test never hard-codes the figure.
    var movieCount: Int { movies.count }
    static let rowSize = 20

    init(scenario: MockScenario) {
        self.scenario = scenario
    }

    /// The embedded JSON files, as the mock starts from.
    private struct MockFixtures {
        let movies: [Card]
        let sagas: [SagaFixture]
        let studios: [StudioFixture]
        let series: [Card]
        let groups: [ChannelGroup]
        let epgTitles: [String: [String]]
        let progress: [ContentID: Progress]
        let favorites: Set<ContentID>

        static func load() -> MockFixtures {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            func load<T: Decodable>(_ name: String, as type: T.Type) -> T {
                guard let url = Bundle.main.url(forResource: name, withExtension: "json"),
                      let data = try? Data(contentsOf: url) else { fatalError("Fixture \(name).json manquante") }
                do { return try decoder.decode(T.self, from: data) } catch { fatalError("Fixture \(name).json : \(error)") }
            }
            // The fixtures' `demo://` stream URLs lead nowhere: the mock shows the catalogue, playback is the real server's job.
            let ch = load("channels", as: ChannelsFile.self)
            let state = load("state", as: StateFile.self)
            var progress: [ContentID: Progress] = [:]
            for e in state.progress {
                progress[e.content_id] = Progress(position: e.position, duration: e.duration, finished: e.finished ?? false)
            }
            return MockFixtures(movies: load("movies", as: [Card].self), sagas: load("sagas", as: [SagaFixture].self),
                                studios: load("studios", as: [StudioFixture].self), series: load("series", as: [Card].self),
                                groups: ch.groups, epgTitles: ch.epg, progress: progress, favorites: Set(state.favorites))
        }
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
                    genres: d.genres, hint: hint(for: d), addedAt: d.addedAt, logo: d.logo, overview: d.overview)
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
                        versions: versions, isFavorite: favorites.contains(d.id), seasons: seasons, currentEpisode: current?.ref,
                        related: related(to: d).prefix(10).map { card(for: $0) })
        }
        return Card(id: d.id, kind: d.kind, title: d.title, poster: d.poster, maxQuality: d.versions.maxQuality, dynamicRange: d.versions.maxDynamicRange,
                    languages: d.versions.languages, backdrop: d.backdrop, progress: progress[d.id], year: d.year, rating: d.rating,
                    genres: d.genres, hint: hint(for: d), addedAt: d.addedAt, originalTitle: d.originalTitle, endYear: d.endYear,
                    overview: d.overview, runtime: d.runtime, certification: d.certification, cast: d.cast, director: d.director,
                    trailer: d.trailer, hasTMDB: d.hasTMDB, providerCategory: d.providerCategory, rawTitle: d.rawTitle,
                    versions: d.versions, isFavorite: favorites.contains(d.id), saga: sagaFixtures.first { $0.movies.contains(d.id) }?.saga.ref,
                    related: related(to: d).prefix(10).map { card(for: $0) })
    }

    /// Stands for TMDB's recommendations: the same kind sharing a genre, best rated first, nothing seen.
    private func related(to d: Card) -> [Card] {
        (d.kind == .series ? series : movies)
            .filter { $0.id != d.id && $0.isMatched && !isSeen($0) && !Set($0.genres).isDisjoint(with: d.genres) }
            .sorted { ($0.rating ?? 0) > ($1.rating ?? 0) }
    }

    /// A movie watched to the end; a series whose last episode was.
    private func isSeen(_ c: Card) -> Bool {
        if c.kind == .series { return c.allEpisodes.last.flatMap { progress[$0.id] }?.isWatched == true }
        return progress[c.id]?.isWatched == true
    }

    /// Something to resume: a movie, or an episode of the series.
    private func isStarted(_ c: Card) -> Bool {
        if c.kind == .series { return c.allEpisodes.contains { progress[$0.id] != nil } }
        return progress[c.id] != nil
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
        let watched = mostWatched.map { Card(id: $0.id, kind: .live, title: $0.name, poster: $0.logo) }
        rows.append(HomeRow(id: "most-watched-channels", kind: .mostWatchedChannels, title: "Chaînes les plus regardées", cards: watched))
        let recommended = movies.filter { $0.isMatched && !isStarted($0) && !favorites.contains($0.id) }
            .sorted { ($0.rating ?? 0) > ($1.rating ?? 0) }.prefix(6) + series.filter { !isStarted($0) }.prefix(4)
        rows.append(HomeRow(id: "recent-movies", kind: .recentMovies, title: "Nouveautés", cards: recentMovies.prefix(12).map { card(for: $0) }))
        rows.append(HomeRow(id: "recent-series", kind: .recentSeries, title: "Derniers épisodes", cards: recentSeries.prefix(12).map { card(for: $0) }))
        let favs = allCards.filter { favorites.contains($0.id) }.map { card(for: $0) }
        if !favs.isEmpty { rows.append(HomeRow(id: "favorites", kind: .favorites, title: "Ma liste", cards: favs)) }
        rows.append(HomeRow(id: "recommended", kind: .recommended, title: "Recommandé pour vous", cards: recommended.map { card(for: $0) }))
        // The carousel as the server composes it: an awaited movie that arrived, a new episode, the week's top.
        let slides = recentMovies.filter { $0.backdrop != nil }.prefix(4)
        var heroes = slides.enumerated().map { i, m in
            HomeHero(card: card(for: m), tagline: i == 0 ? "FILM · ENFIN DISPONIBLE" : "FILM · N° \(i) CETTE SEMAINE", overview: m.overview,
                     runtime: m.runtime, certification: m.certification, versions: m.versions, playID: m.id, episode: nil)
        }
        if let s = recentSeries.first(where: { $0.backdrop != nil }), let e = s.allEpisodes.last {
            heroes.insert(HomeHero(card: card(for: s), tagline: "SÉRIE · NOUVEL ÉPISODE · \(e.ref.shortCode)", overview: e.overview ?? s.overview,
                                   runtime: e.runtime, certification: s.certification, versions: e.versions, playID: e.id, episode: e.ref), at: min(1, heroes.count))
        }
        return HomeScreen(heroes: heroes, rows: rows, generatedAt: .now)
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
        guard kind == .movie else { return [] }
        return studioFixtures.map { f in
            let latest = movies.filter { f.movies.contains($0.id) && $0.backdrop != nil }.max { ($0.year ?? 0) < ($1.year ?? 0) }
            return Studio(id: f.id, name: f.name, logo: f.logo, count: f.movies.count, backdrop: latest?.backdrop)
        }
    }

    func sagas(cursor: String?) async throws -> Page<Saga> {
        try await gate()
        return Page(items: sagaFixtures.map(\.saga), nextCursor: nil, total: sagaFixtures.count)
    }

    func saga(id: String) async throws -> SagaSheet {
        try await gate()
        guard let f = sagaFixtures.first(where: { $0.id == id }) else { throw CatalogError.notFound }
        let cards = movies.filter { f.movies.contains($0.id) }.sorted { ($0.year ?? 0) > ($1.year ?? 0) }.map { card(for: $0) }  // latest first, like the server
        return SagaSheet(id: f.id, name: f.name, count: cards.count, poster: f.poster, backdrop: f.backdrop, movies: cards)
    }

    func person(id: String) async throws -> PersonSheet {
        try await gate()
        let titles = (movies + series).filter { $0.cast.contains { $0.id == id } }.sorted { ($0.year ?? 0) > ($1.year ?? 0) }  // latest first, like the server
        guard let me = titles.first?.cast.first(where: { $0.id == id }) else { throw CatalogError.notFound }
        let cards = titles.map { card(for: $0) }
        return PersonSheet(id: id, name: me.name, photo: me.photo, movies: cards.filter { $0.kind == .movie }, series: cards.filter { $0.kind == .series })
    }

    // MARK: - Live

    func channels() async throws -> [ChannelGroup] {
        try await gate()
        let ranks = Dictionary(mostWatched.enumerated().map { ($1.id, $0 + 1) }, uniquingKeysWith: { a, _ in a })
        return groups.map { g in
            ChannelGroup(id: g.id, name: g.name, channels: g.channels.map { c in
                var c = withFavorite(c)
                c.watchedRank = ranks[c.id]
                return c
            })
        }
    }

    /// The demo has no watch time: the first channels of the list stand for the most watched.
    private var mostWatched: [Channel] { Array(groups.flatMap(\.channels).prefix(6)) }

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

    func programmes(channel id: ContentID, version: String?) async throws -> [Programme] {
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
        // A series plays the episode it resumes on, as the server does.
        if let s = series.first(where: { $0.id == id }) {
            let eps = s.allEpisodes
            guard let e = eps.first(where: { progress[$0.id]?.isResumable == true }) ?? eps.first(where: { progress[$0.id] == nil }) ?? eps.first
            else { throw CatalogError.notFound }
            var p = try await playback(id: e.id)
            p.episode = PlaybackEpisode(id: e.id, season: e.season, number: e.number, title: e.title)
            return p
        }
        if let c = rawChannel(id) {
            return Playback(versions: c.versions, resumeAt: nil, duration: nil, next: nil)
        }
        throw CatalogError.notFound
    }

    func suggestions(id: ContentID) async throws -> Suggestions {
        try await gate()
        guard let d = allCards.first(where: { $0.id == id }) ?? episode(id)?.series else { throw CatalogError.notFound }
        let related = related(to: d)
        var next: Suggestion?
        if d.kind == .movie {
            if let saga = sagaFixtures.first(where: { $0.movies.contains(d.id) }),
               let after = saga.movies.drop(while: { $0 != d.id }).dropFirst().compactMap({ id in movies.first { $0.id == id } }).first(where: { !isStarted($0) }) {
                next = Suggestion(card: merged(after), reason: .saga)
            } else if let first = related.first(where: { !isStarted($0) }) {
                next = Suggestion(card: merged(first), reason: .recommended)
            }
        } else if d.allEpisodes.last?.id == id, let first = related.first(where: { !isStarted($0) }) {
            next = Suggestion(card: merged(first), reason: .recommended)
        }
        return Suggestions(related: related.prefix(5).map { merged($0) }, next: next)
    }

    func report(_ report: ProgressReport) async throws {
        try await gate()
        progress[report.contentID] = Progress(position: report.position, duration: report.duration,
                                              finished: report.duration > 0 && report.position / report.duration >= 0.9)
    }

    func reportWatchTime(id: ContentID, seconds: Int) async throws {
        try await gate()
    }

    // MARK: - Search and favourites

    func search(_ query: String) async throws -> SearchResults {
        try await gate()
        let q = query.trimmingCharacters(in: .whitespaces).folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
        if q.isEmpty || scenario.emptySearch { return SearchResults(query: query, best: nil, movies: [], series: [], live: []) }
        func matches(_ d: Card) -> Bool {
            let hay = ([d.title, d.director ?? ""] + d.cast.map(\.name)).joined(separator: " ")
                .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
            return hay.contains(q)
        }
        let m = movies.filter(matches).map { card(for: $0) }
        let s = series.filter(matches).map { card(for: $0) }
        let l = groups.flatMap { g in g.channels.filter {
            $0.name.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current).contains(q)
        }.map { c in
            Card(id: c.id, kind: .live, title: c.name, poster: c.logo, maxQuality: c.maxQuality, languages: c.versions.languages, genres: [g.name])
        } }
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
