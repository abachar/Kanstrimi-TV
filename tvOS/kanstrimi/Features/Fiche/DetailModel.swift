import Foundation
import Observation

/// Loads the sheet, its seasons on demand, and turns "Lecture" into a playback context.
@Observable
final class DetailModel {
    let id: ContentID
    private let env: AppEnvironment
    private(set) var detail: ContentDetail?
    private(set) var error: CatalogError?
    private(set) var isLoading = false
    private(set) var episodes: [Int: [Episode]] = [:]
    private(set) var seasonErrors: [Int: CatalogError] = [:]
    private(set) var loadingSeasons: Set<Int> = []
    var selectedSeason: Int?
    var favoriteBusy = false

    init(id: ContentID, env: AppEnvironment) {
        self.id = id
        self.env = env
    }

    var isSeries: Bool { detail?.kind == .series }

    func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            let d = try await env.call { try await env.client.detail(id: id) }
            detail = d
            if d.kind == .series {
                let season = d.currentEpisode?.season ?? d.seasons?.first?.number
                selectedSeason = season
                if let season { await loadSeason(season) }
            }
        } catch {
            self.error = (error as? CatalogError) ?? .server(error.localizedDescription)
        }
    }

    func loadSeason(_ number: Int) async {
        guard episodes[number] == nil, !loadingSeasons.contains(number) else { return }
        loadingSeasons.insert(number)
        seasonErrors[number] = nil
        defer { loadingSeasons.remove(number) }
        do {
            episodes[number] = try await env.call { try await env.client.season(seriesID: id, number: number) }
        } catch {
            seasonErrors[number] = (error as? CatalogError) ?? .server(error.localizedDescription)
        }
    }

    func retrySeason(_ number: Int) async {
        seasonErrors[number] = nil
        await loadSeason(number)
    }

    func toggleFavorite() async {
        guard var d = detail, !favoriteBusy else { return }
        favoriteBusy = true
        defer { favoriteBusy = false }
        d.isFavorite.toggle()
        detail = d
        do { try await env.call { try await env.client.setFavorite(id: id, d.isFavorite) } }
        catch { d.isFavorite.toggle(); detail = d }
    }

    // MARK: - Versions

    /// The version `Lecture` will play, as the engine decides it.
    var choice: VersionChooser.Choice? {
        guard let d = detail else { return nil }
        if d.kind == .series {
            return env.player.chooser.choose(from: d.versions, seriesChoice: env.preferences.seriesChoice(for: id))
        }
        let remembered = env.preferences.rememberVersionPerTitle ? env.preferences.rememberedVersion(for: id) : nil
        return env.player.chooser.choose(from: d.versions, remembered: remembered)
    }

    var seriesChoice: VersionChoiceKey? {
        env.preferences.seriesChoice(for: id) ?? choice.map { VersionChoiceKey($0.version) }
    }

    /// Main button label: Lecture · Reprendre à 47 min · Revoir · Reprendre S2 É4 · Lire S1 É1.
    var primaryLabel: String {
        guard let d = detail else { return "Lecture" }
        if d.kind == .series {
            guard let e = d.currentEpisode else { return "Lire S1 É1" }
            return d.progress?.isResumable == true ? "Reprendre · \(e.shortCode)" : "Lire \(e.shortCode)"
        }
        if let p = d.progress {
            if p.isWatched { return "Revoir" }
            if p.isResumable { return "Reprendre à \(Int(p.position / 60)) min" }
        }
        return "Lecture"
    }

    // MARK: - Playback

    func playPrimary() async {
        guard let d = detail else { return }
        if d.kind == .series {
            guard let cur = d.currentEpisode else { return }
            await loadSeason(cur.season)
            if let ep = episodes[cur.season]?.first(where: { $0.number == cur.number }) { await play(episode: ep) }
            return
        }
        play(movie: d, version: nil, source: nil)
    }

    func play(movie d: ContentDetail, version: Version?, source: Source?) {
        let resume = d.progress?.isResumable == true ? d.progress?.position : nil
        let ctx = PlaybackContext(content: PlaybackContent(id: d.id, kind: .movie, title: d.title, subtitle: nil, episode: nil, backdrop: d.backdrop),
                                  versions: d.versions, resumeAt: resume, duration: d.progress?.duration ?? d.runtime.map { TimeInterval($0 * 60) },
                                  next: nil, seriesID: nil)
        if let version { env.player.play(ctx, version: version, source: source) } else { env.player.play(ctx) }
    }

    func play(episode: Episode) async {
        guard let ctx = try? await env.call({ try await env.client.playbackContext(id: episode.id) }) else { return }
        env.player.play(ctx)
    }

    func playTrailer() {
        guard let d = detail, let url = d.trailer else { return }
        let v = Version(id: "trailer", language: .vo, quality: .hd, dynamicRange: nil,
                        sources: [Source(id: "trailer", container: "MP4", streamURL: url, origin: "Bande-annonce")])
        let ctx = PlaybackContext(content: PlaybackContent(id: ContentID("\(d.id.rawValue):trailer"), kind: .movie, title: "Bande-annonce · \(d.title)", subtitle: nil, episode: nil, backdrop: d.backdrop),
                                  versions: [v], resumeAt: nil, duration: nil, next: nil, seriesID: nil)
        env.player.play(ctx, version: v)
    }

    /// Picker result for a movie: remember (or not) and play.
    func chose(version: Version, source: Source?, remember: Bool, asDefault: Bool) {
        guard let d = detail else { return }
        if d.kind == .series {
            env.preferences.setSeriesChoice(VersionChoiceKey(version), for: id)
        } else if remember {
            env.preferences.remember(versionID: version.id, for: id)
        } else {
            env.preferences.remember(versionID: nil, for: id)
        }
        if asDefault {
            var order = env.preferences.languageOrder.filter { $0 != version.language }
            order.insert(version.language, at: 0)
            env.preferences.languageOrder = order
            env.preferences.maxQuality = version.quality
        }
        if d.kind != .series { play(movie: d, version: version, source: source) }
    }

    /// Episodes of the selected season missing the series language, for the warning line.
    func languageGaps(in season: Int) -> [Episode] {
        guard let lang = seriesChoice?.language, let eps = episodes[season] else { return [] }
        return eps.filter { !$0.languages.contains(lang) && !$0.versions.isEmpty }
    }
}
