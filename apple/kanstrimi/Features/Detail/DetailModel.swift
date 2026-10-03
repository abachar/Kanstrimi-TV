import Foundation
import Observation

/// Loads the full card (`GET /movies/{id}` or `GET /series/{id}`, seasons included) and turns
/// "Lecture" into a playback context.
@Observable
final class DetailModel {
    let id: ContentID
    private let env: AppEnvironment
    private(set) var detail: Card?
    private(set) var error: CatalogError?
    private(set) var isLoading = false
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
            let d = try await env.client.detail(id: id)
            detail = d
            if d.kind == .series {
                selectedSeason = d.currentEpisode?.season ?? d.seasons?.first?.number
            }
        } catch {
            self.error = (error as? CatalogError) ?? .server(error.localizedDescription)
        }
    }

    /// After a playback: the new progress, without moving the season shown nor flashing an error.
    func refresh() async {
        guard let d = try? await env.client.detail(id: id) else { return }
        detail = d
    }

    func episodes(in season: Int) -> [Episode] {
        detail?.seasons?.first { $0.number == season }?.episodes ?? []
    }

    /// Seen or not: the movie, one episode, or a whole season; the sheet reloads with the new progress.
    func setWatched(_ watched: Bool, episode: Episode? = nil, season: Int? = nil) async {
        let target = episode?.id ?? id
        let dropped = season.map { episodes(in: $0).map(\.id) } ?? [target]
        dropped.forEach { env.progressQueue.drop($0) }
        guard await env.attempt("Marquage", { try await env.client.setWatched(id: target, watched, season: season) }) != nil else { return }
        await refresh()
    }

    func toggleFavorite() async {
        guard var d = detail, !favoriteBusy else { return }
        favoriteBusy = true
        defer { favoriteBusy = false }
        let target = !(d.isFavorite ?? false)
        d.isFavorite = target
        detail = d
        do { try await env.client.setFavorite(id: id, target) }
        catch { d.isFavorite = !target; detail = d }
    }

    // MARK: - Versions

    /// The version `Lecture` will play, as the engine decides it.
    var choice: VersionChooser.Choice? {
        guard let d = detail else { return nil }
        if d.kind == .series {
            // Series versions carry no sources: choose on the current episode's versions when known.
            let pool = currentEpisode?.versions ?? d.versions
            return env.player.chooser.choose(from: pool, seriesChoice: env.preferences.seriesChoice(for: id))
        }
        let remembered = env.preferences.rememberVersionPerTitle ? env.preferences.rememberedVersion(for: id) : nil
        return env.player.chooser.choose(from: d.versions, remembered: remembered)
    }

    var currentEpisode: Episode? {
        guard let d = detail, let cur = d.currentEpisode else { return nil }
        return episodes(in: cur.season).first { $0.number == cur.number }
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

    /// « Depuis le début » is offered when the main button resumes: the movie, or the current episode.
    var canRestart: Bool {
        guard let d = detail else { return false }
        return d.kind == .series ? currentEpisode?.progress?.isResumable == true : d.progress?.isResumable == true
    }

    // MARK: - Playback

    func playPrimary(fromStart: Bool = false) async {
        guard let d = detail else { return }
        if d.kind == .series {
            if let ep = currentEpisode { await play(episode: ep, fromStart: fromStart) }
            return
        }
        play(movie: d, version: nil, source: nil, fromStart: fromStart)
    }

    /// The sheet already carries the versions: no call.
    func play(movie d: Card, version: Version?, source: Source?, fromStart: Bool = false) {
        let resume = !fromStart && d.progress?.isResumable == true ? d.progress?.position : nil
        let ctx = PlaybackContext(content: PlaybackContent(id: d.id, kind: .movie, title: d.title, subtitle: nil, episode: nil, backdrop: d.backdrop),
                                  versions: d.versions, resumeAt: resume, duration: d.progress?.duration ?? d.runtime.map { TimeInterval($0 * 60) },
                                  cast: d.cast)
        if let version { env.player.play(ctx, version: version, source: source) } else { env.player.play(ctx) }
    }

    /// `/playback` of the episode: fresh links, and what follows written by the server (« À suivre »).
    func play(episode: Episode, fromStart: Bool = false) async {
        guard let d = detail,
              let ctx = await env.attempt("Lecture", { try await env.playbackContext(for: episode, of: d) }) else { return }
        env.player.play(fromStart ? ctx.resuming(at: nil) : ctx)
    }

    /// Picker result. A series keeps the language picked; a film plays the version, and forgets the
    /// one remembered for it: only a switch made while playing is remembered.
    func chose(version: Version, source: Source?) {
        guard let d = detail else { return }
        if d.kind == .series {
            env.preferences.setSeriesChoice(VersionChoiceKey(version), for: id)
        } else {
            env.preferences.remember(versionID: nil, for: id)
            play(movie: d, version: version, source: source)
        }
    }

    /// Episodes of the selected season missing the series language, for the warning line.
    func languageGaps(in season: Int) -> [Episode] {
        guard let lang = seriesChoice?.language else { return [] }
        return episodes(in: season).filter { !$0.languages.contains(lang) && !$0.versions.isEmpty }
    }
}
