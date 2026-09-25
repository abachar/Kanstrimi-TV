import Foundation

/// Serves the embedded JSON fixtures with a simulated latency and scriptable failures.
/// Keeps progress and favorites in memory so the UI reacts like it will with the server.
final class MockCatalogClient: CatalogClient {
    private struct SeriesEpisodes: Decodable { let episodes: [Episode] }
    private struct ChannelsFile: Decodable { let groups: [ChannelGroup]; let epg: [String: [String]] }
    private struct StateFile: Decodable {
        struct Entry: Decodable { let content_id: ContentID; let position: TimeInterval; let duration: TimeInterval; let finished: Bool? }
        let progress: [Entry]
        let favorites: [ContentID]
    }

    let scenario: MockScenario
    private let movies: [ContentDetail]
    private let series: [ContentDetail]
    private let episodesBySeries: [ContentID: [Episode]]
    private let groups: [ChannelGroup]
    private let epgTitles: [String: [String]]
    private var progress: [ContentID: Progress] = [:]
    private var favorites: Set<ContentID> = []
    private var pairingApproved = false
    private var pairingCreatedAt: Date?
    static let pageSize = 18

    init(scenario: MockScenario) {
        self.scenario = scenario
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        func load<T: Decodable>(_ name: String, as type: T.Type) -> T {
            guard let url = Bundle.main.url(forResource: name, withExtension: "json"),
                  let data = try? Data(contentsOf: url) else { fatalError("Fixture \(name).json manquante") }
            do { return try decoder.decode(T.self, from: data) } catch { fatalError("Fixture \(name).json : \(error)") }
        }
        movies = load("movies", as: [ContentDetail].self).map { $0.resolvingDemoStreams() }
        let rawSeries = load("series", as: [ContentDetail].self)
        series = rawSeries
        let eps = load("series", as: [SeriesEpisodes].self)
        var map: [ContentID: [Episode]] = [:]
        for (s, e) in zip(rawSeries, eps) { map[s.id] = e.episodes.map { $0.resolvingDemoStreams() } }
        episodesBySeries = map
        let ch = load("channels", as: ChannelsFile.self)
        groups = ch.groups.map { ChannelGroup(category: $0.category, channels: $0.channels.map { $0.resolvingDemoStreams() }) }
        epgTitles = ch.epg
        let state = load("state", as: StateFile.self)
        for e in state.progress {
            progress[e.content_id] = Progress(position: e.position, duration: e.duration, finished: e.finished ?? false)
        }
        favorites = Set(state.favorites)
    }

    // MARK: - Plumbing

    private func gate() async throws {
        if scenario.latency > 0 {
            try? await Task.sleep(for: .seconds(scenario.latency))
        }
        if scenario.unauthorized { throw CatalogError.unauthorized }
        if scenario.offline { throw CatalogError.offline }
    }

    private func card(for d: ContentDetail, episode: Episode? = nil) -> ContentCard {
        let versions = d.kind == .series ? (episodesBySeries[d.id] ?? []).flatMap(\.versions) : d.versions
        return ContentCard(id: episode?.id ?? d.id, kind: episode == nil ? d.kind : .episode, title: d.title, year: d.year,
                           poster: d.poster, backdrop: d.backdrop, rating: d.rating, genres: d.genres,
                           languages: versions.languages, maxQuality: versions.maxQuality, dynamicRange: versions.maxDynamicRange,
                           progress: progress[episode?.id ?? d.id], episode: episode?.ref, hint: hint(for: d), addedAt: d.addedAt)
    }

    private func hint(for d: ContentDetail) -> String? {
        guard d.kind == .series, let eps = episodesBySeries[d.id] else {
            let langs = d.versions.languages
            return langs == [.vostfr] ? "VOSTFR seul" : nil
        }
        let langs = eps.flatMap(\.versions).languages
        if langs == [.vostfr] { return "VOSTFR seul" }
        if let last = d.seasons?.last, eps.filter({ $0.season == last.number }).contains(where: { !$0.versions.languages.contains(.vf) }),
           langs.contains(.vf) {
            return "VF partielle S\(last.number)"
        }
        return nil
    }

    private func merged(_ d: ContentDetail) -> ContentDetail {
        var d = d
        d.isFavorite = favorites.contains(d.id)
        if d.kind == .series {
            let eps = episodesBySeries[d.id] ?? []
            let current = eps.first { progress[$0.id]?.isResumable == true } ?? eps.first { progress[$0.id] == nil }
            return ContentDetail(id: d.id, kind: d.kind, title: d.title, originalTitle: d.originalTitle, year: d.year, endYear: d.endYear,
                                 overview: d.overview, genres: d.genres, runtime: d.runtime, certification: d.certification, rating: d.rating,
                                 poster: d.poster, backdrop: d.backdrop, cast: d.cast, director: d.director, trailer: d.trailer,
                                 hasTMDB: d.hasTMDB, providerCategory: d.providerCategory, rawTitle: d.rawTitle,
                                 versions: eps.flatMap(\.versions).deduplicatedByLanguageQuality(), progress: current.flatMap { progress[$0.id] },
                                 isFavorite: d.isFavorite, seasons: d.seasons, currentEpisode: current?.ref, addedAt: d.addedAt)
        }
        return ContentDetail(id: d.id, kind: d.kind, title: d.title, originalTitle: d.originalTitle, year: d.year, endYear: d.endYear,
                             overview: d.overview, genres: d.genres, runtime: d.runtime, certification: d.certification, rating: d.rating,
                             poster: d.poster, backdrop: d.backdrop, cast: d.cast, director: d.director, trailer: d.trailer,
                             hasTMDB: d.hasTMDB, providerCategory: d.providerCategory, rawTitle: d.rawTitle,
                             versions: d.versions, progress: progress[d.id], isFavorite: d.isFavorite, seasons: nil,
                             currentEpisode: nil, addedAt: d.addedAt)
    }

    private func episode(_ id: ContentID) -> (series: ContentDetail, episode: Episode)? {
        for s in series {
            if let e = episodesBySeries[s.id]?.first(where: { $0.id == id }) { return (s, e) }
        }
        return nil
    }

    private func channel(_ id: ContentID) -> Channel? {
        groups.flatMap(\.channels).first { $0.id == id }
    }

    // MARK: - Pairing and session

    func createPairingCode() async throws -> PairingCode {
        try await gate()
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

    func pollPairing(code: String) async throws -> PairingStatus {
        try await gate()
        if scenario.pairingExpires, let created = pairingCreatedAt, Date.now.timeIntervalSince(created) > 6 { return .expired }
        if scenario.pairingApprovalDelay > 0, let created = pairingCreatedAt,
           Date.now.timeIntervalSince(created) > scenario.pairingApprovalDelay { pairingApproved = true }
        return pairingApproved ? .approved(token: "mock-" + UUID().uuidString.lowercased(), deviceName: "Salon") : .pending
    }

    func session() async throws -> Session {
        try await gate()
        return Session(deviceName: "Salon", serverVersion: "0.9.3 (maquette)", serverHost: "kanstrimi.crafters.dev",
                       tmdbLanguage: "fr-FR", catalogLanguages: [.vf, .vostfr, .vo],
                       defaultLanguageOrder: [.vf, .vostfr, .vo],
                       counts: CatalogCounts(movies: 35_219, series: 22_174, channels: 722),
                       lastImport: Calendar.current.date(bySettingHour: 4, minute: 10, second: 0, of: .now), tmdbRate: 0.97)
    }

    func revokeDevice() async throws { try await gate() }

    // MARK: - Home

    func home() async throws -> HomeScreen {
        try await gate()
        let recentMovies = movies.filter(\.hasTMDB).sorted { ($0.addedAt ?? .distantPast) > ($1.addedAt ?? .distantPast) }
        let recentSeries = series.sorted { ($0.addedAt ?? .distantPast) > ($1.addedAt ?? .distantPast) }
        var resume: [(Date, ContentCard)] = []
        for (id, p) in progress where p.isResumable {
            if let m = movies.first(where: { $0.id == id }) { resume.append((m.addedAt ?? .now, card(for: m))) }
            else if let (s, e) = episode(id) { resume.append((e.airDate ?? .now, card(for: s, episode: e))) }
        }
        // Most recently watched first; the fixtures have no timestamp, so use position share as a proxy.
        let resumeCards = resume.sorted { ($0.1.progress?.fraction ?? 0) > ($1.1.progress?.fraction ?? 0) }.map(\.1)
        var rows: [HomeRow] = []
        if !resumeCards.isEmpty { rows.append(HomeRow(id: "resume", kind: .resume, title: "Reprendre", cards: resumeCards)) }
        rows.append(HomeRow(id: "recent-movies", kind: .recentMovies, title: "Films récents", cards: recentMovies.prefix(12).map { card(for: $0) }))
        rows.append(HomeRow(id: "recent-series", kind: .recentSeries, title: "Séries récentes", cards: recentSeries.prefix(12).map { card(for: $0) }))
        let favs = (movies + series).filter { favorites.contains($0.id) }.map { card(for: $0) }
        if !favs.isEmpty { rows.append(HomeRow(id: "favorites", kind: .favorites, title: "Ma liste", cards: favs)) }
        let heroDetail = recentMovies.first!
        let hero = HomeHero(card: card(for: heroDetail), tagline: "FILM · NOUVEAUTÉ", overview: heroDetail.overview,
                            runtime: heroDetail.runtime, certification: heroDetail.certification, versions: heroDetail.versions)
        return HomeScreen(hero: hero, rows: rows, generatedAt: .now)
    }

    // MARK: - Lists

    func list(_ query: ListQuery) async throws -> Page<ContentCard> {
        try await gate()
        let offset = Int(query.cursor ?? "0") ?? 0
        if scenario.failingSecondPage, offset > 0 { throw CatalogError.server("Le fournisseur n'a pas répondu (page \(offset / Self.pageSize + 1))") }
        let all = filtered(query)
        let slice = Array(all.dropFirst(offset).prefix(Self.pageSize))
        let next = offset + slice.count < all.count ? String(offset + slice.count) : nil
        return Page(items: slice, nextCursor: next)
    }

    private func filtered(_ query: ListQuery) -> [ContentCard] {
        let pool = query.kind == .series ? series : movies
        var cards = pool.map { card(for: $0) }
        if let g = query.genre { cards = cards.filter { $0.genres.contains(g) } }
        if let l = query.language { cards = cards.filter { $0.languages.contains(l) } }
        if let q = query.minQuality { cards = cards.filter { ($0.maxQuality ?? .sd) >= q } }
        if let dr = query.dynamicRange { cards = cards.filter { ($0.dynamicRange ?? .sdr) >= dr } }
        if query.vfAvailable { cards = cards.filter { $0.languages.contains(.vf) } }
        if query.completeSeasonVF {
            cards = cards.filter { c in
                guard let eps = episodesBySeries[c.id] else { return false }
                return eps.allSatisfy { $0.versions.languages.contains(.vf) }
            }
        }
        if query.newEpisodes {
            cards = cards.filter { c in (episodesBySeries[c.id] ?? []).contains { ($0.airDate ?? .distantPast) > Date.now.addingTimeInterval(-90 * 86400) } }
        }
        switch query.sort {
        case .recent, .latestEpisodes: cards.sort { ($0.addedAt ?? .distantPast) > ($1.addedAt ?? .distantPast) }
        case .title: cards.sort { $0.title.localizedStandardCompare($1.title) == .orderedAscending }
        case .year: cards.sort { ($0.year ?? 0) > ($1.year ?? 0) }
        case .rating: cards.sort { ($0.rating ?? 0) > ($1.rating ?? 0) }
        }
        return cards
    }

    func genres(kind: ContentKind) async throws -> [Genre] {
        try await gate()
        let pool = kind == .series ? series : movies
        var counts: [String: Int] = [:]
        for d in pool { for g in d.genres { counts[g, default: 0] += 1 } }
        return counts.map { Genre(id: $0.key, name: $0.key, count: $0.value) }.sorted { $0.count > $1.count }
    }

    // MARK: - Sheets

    func detail(id: ContentID) async throws -> ContentDetail {
        try await gate()
        if let d = (movies + series).first(where: { $0.id == id }) { return merged(d) }
        throw CatalogError.notFound
    }

    func season(seriesID: ContentID, number: Int) async throws -> [Episode] {
        try await gate()
        if scenario.failingSeason == number { throw CatalogError.server("Le fournisseur n'a pas répondu.") }
        guard let eps = episodesBySeries[seriesID] else { throw CatalogError.notFound }
        return eps.filter { $0.season == number }.map { e in
            Episode(id: e.id, season: e.season, number: e.number, title: e.title, overview: e.overview, runtime: e.runtime,
                    still: e.still, airDate: e.airDate, versions: e.versions, progress: progress[e.id])
        }
    }

    func playbackContext(id: ContentID) async throws -> PlaybackContext {
        try await gate()
        if let m = movies.first(where: { $0.id == id }) {
            let p = progress[id]
            return PlaybackContext(content: PlaybackContent(id: id, kind: .movie, title: m.title, subtitle: nil, episode: nil, backdrop: m.backdrop),
                                   versions: m.versions, resumeAt: p?.isResumable == true ? p?.position : nil,
                                   duration: p?.duration ?? m.runtime.map { TimeInterval($0 * 60) }, next: nil, seriesID: nil)
        }
        if let (s, e) = episode(id) {
            let eps = episodesBySeries[s.id] ?? []
            let idx = eps.firstIndex(of: e)!
            let nextEp = idx + 1 < eps.count ? eps[idx + 1] : nil
            let p = progress[id]
            return PlaybackContext(content: PlaybackContent(id: id, kind: .episode, title: e.title, subtitle: s.title, episode: e.ref, backdrop: s.backdrop),
                                   versions: e.versions, resumeAt: p?.isResumable == true ? p?.position : nil,
                                   duration: p?.duration ?? e.runtime.map { TimeInterval($0 * 60) },
                                   next: nextEp.map { NextEpisode(id: $0.id, seriesTitle: s.title, episode: $0.ref, runtime: $0.runtime,
                                                                  languages: $0.versions.languages, maxQuality: $0.versions.maxQuality,
                                                                  dynamicRange: $0.versions.maxDynamicRange, still: $0.still) },
                                   seriesID: s.id)
        }
        if let c = channel(id) {
            let now = try await epg(channelID: id)
            return PlaybackContext(content: PlaybackContent(id: id, kind: .live, title: c.name, subtitle: now.now?.title, episode: nil, backdrop: nil),
                                   versions: c.versions, resumeAt: nil, duration: nil, next: nil, seriesID: nil)
        }
        throw CatalogError.notFound
    }

    // MARK: - Live

    func channels() async throws -> [ChannelGroup] {
        try await gate()
        return groups
    }

    func epg(channelID: ContentID) async throws -> EPGNow {
        try await gate()
        if scenario.emptyEPG { return .empty }
        guard let c = channel(channelID), let titles = epgTitles[c.category], !titles.isEmpty else { return .empty }
        // Deterministic schedule: slots of 45 to 120 minutes anchored on the hour, seeded by the channel.
        let seed = c.name.unicodeScalars.reduce(0) { $0 + Int($1.value) }
        let slot = TimeInterval([45, 60, 90, 120][seed % 4] * 60)
        let anchor = Calendar.current.startOfDay(for: .now)
        let elapsed = Date.now.timeIntervalSince(anchor)
        let index = Int(elapsed / slot)
        let start = anchor.addingTimeInterval(TimeInterval(index) * slot)
        let now = Programme(title: titles[(index + seed) % titles.count], start: start, end: start.addingTimeInterval(slot), overview: nil)
        let next = Programme(title: titles[(index + seed + 1) % titles.count], start: now.end, end: now.end.addingTimeInterval(slot), overview: nil)
        return EPGNow(now: now, next: next)
    }

    // MARK: - Search

    func search(_ query: String, scope: SearchScope) async throws -> SearchResults {
        try await gate()
        let q = query.trimmingCharacters(in: .whitespaces).folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
        if q.isEmpty || scenario.emptySearch { return SearchResults(query: query, best: nil, movies: [], series: [], live: []) }
        func matches(_ d: ContentDetail) -> Bool {
            let hay = ([d.title, d.director ?? ""] + d.cast.map(\.name)).joined(separator: " ")
                .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
            return hay.contains(q)
        }
        let m = (scope == .all || scope == .movies) ? movies.filter(matches).map { card(for: $0) } : []
        let s = (scope == .all || scope == .series) ? series.filter(matches).map { card(for: $0) } : []
        let l = (scope == .all || scope == .live) ? groups.flatMap(\.channels).filter {
            $0.name.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current).contains(q)
        }.map { c in
            ContentCard(id: c.id, kind: .live, title: c.name, year: nil, poster: c.logo, backdrop: nil, rating: nil, genres: [c.category],
                        languages: c.versions.languages, maxQuality: c.maxQuality, dynamicRange: nil, progress: nil, episode: nil, hint: nil, addedAt: nil)
        } : []
        let best = (m + s + l).min { a, b in
            let ta = a.title.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current).hasPrefix(q)
            let tb = b.title.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current).hasPrefix(q)
            if ta != tb { return ta }
            return (a.rating ?? 0) > (b.rating ?? 0)
        }
        return SearchResults(query: query, best: best, movies: m, series: s, live: l)
    }

    // MARK: - Writes

    func report(_ report: ProgressReport) async throws {
        try await gate()
        progress[report.contentID] = Progress(position: report.position, duration: report.duration,
                                              finished: report.duration > 0 && report.position / report.duration >= 0.9)
    }

    func setFavorite(id: ContentID, _ favorite: Bool) async throws {
        try await gate()
        if favorite { favorites.insert(id) } else { favorites.remove(id) }
    }
}

// MARK: - Demo stream rewriting

private extension Source {
    func resolvingDemoStreams() -> Source {
        Source(id: id, container: container, streamURL: DemoStreams.resolve(streamURL), origin: origin)
    }
}
private extension Version {
    func resolvingDemoStreams() -> Version {
        Version(id: id, language: language, quality: quality, dynamicRange: dynamicRange, sources: sources.map { $0.resolvingDemoStreams() })
    }
}
private extension ContentDetail {
    func resolvingDemoStreams() -> ContentDetail {
        ContentDetail(id: id, kind: kind, title: title, originalTitle: originalTitle, year: year, endYear: endYear, overview: overview,
                      genres: genres, runtime: runtime, certification: certification, rating: rating, poster: poster, backdrop: backdrop,
                      cast: cast, director: director, trailer: trailer.map(DemoStreams.resolve), hasTMDB: hasTMDB,
                      providerCategory: providerCategory, rawTitle: rawTitle, versions: versions.map { $0.resolvingDemoStreams() },
                      progress: progress, isFavorite: isFavorite, seasons: seasons, currentEpisode: currentEpisode, addedAt: addedAt)
    }
}
private extension Episode {
    func resolvingDemoStreams() -> Episode {
        Episode(id: id, season: season, number: number, title: title, overview: overview, runtime: runtime, still: still, airDate: airDate,
                versions: versions.map { $0.resolvingDemoStreams() }, progress: progress)
    }
}
private extension Channel {
    func resolvingDemoStreams() -> Channel {
        Channel(id: id, name: name, number: number, logo: logo, category: category, versions: versions.map { $0.resolvingDemoStreams() })
    }
}

nonisolated extension Array where Element == Version {
    /// One entry per language × quality × dynamic range, keeping the first occurrence.
    func deduplicatedByLanguageQuality() -> [Version] {
        var seen = Set<String>()
        return filter { seen.insert("\($0.language.rawValue)/\($0.quality.rawValue)/\($0.dynamicRange?.rawValue ?? "")").inserted }
    }
}
