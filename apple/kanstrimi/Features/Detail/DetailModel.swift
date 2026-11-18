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
    var selectedSeason: Int?
    var favoriteBusy = false

    init(id: ContentID, env: AppEnvironment) {
        self.id = id
        self.env = env
    }

    var isSeries: Bool { detail?.kind == .series }

    func load() async {
        error = nil
        do {
            let d = try await env.client.detail(id: id)
            detail = d
            if d.kind == .series {
                selectedSeason = d.currentEpisode?.season ?? d.seasons?.first?.number
            }
        } catch is CancellationError {
            // The sheet left the screen first (a saga closing above it): it loads again when it comes back.
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

    /// Ma liste, as the app last set it, else as the server served it.
    var isFavorite: Bool { env.isFavorite(id, else: detail?.isFavorite ?? false) }

    func toggleFavorite() async {
        guard detail != nil, !favoriteBusy else { return }
        favoriteBusy = true
        defer { favoriteBusy = false }
        await env.setFavorite(id, !isFavorite)
    }

    // MARK: - Variants

    /// The variant the profile chose for the title: what was chosen here since launch, else what the sheet says.
    var remembered: RememberedVariant? { env.player.remembered(detail?.remembered, for: id) }

    /// The variant `Lecture` will play, as the engine decides it.
    var choice: VariantChooser.Choice? {
        guard let d = detail else { return nil }
        // A series' own variants play nothing: choose on the current episode's when known.
        let pool = d.kind == .series ? (currentEpisode?.variants ?? d.variants) : d.variants
        return env.player.startChoice(id, variants: pool, remembered: d.remembered)
    }

    var currentEpisode: Episode? {
        guard let d = detail, let cur = d.currentEpisode else { return nil }
        return episodes(in: cur.season).first { $0.number == cur.number }
    }

    /// What the series plays in, « FR · 4K DV », and its language: the choice remembered for it, else what Lecture would play.
    var seriesLabel: String? { remembered?.label ?? choice?.variant.label }
    var seriesLanguage: Language? { remembered?.language ?? choice?.variant.language }

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
        play(movie: d, variant: nil, fromStart: fromStart)
    }

    /// The sheet already carries the variants: no call.
    func play(movie d: Card, variant: Variant?, fromStart: Bool = false) {
        let resume = !fromStart && d.progress?.isResumable == true ? d.progress?.position : nil
        let ctx = PlaybackContext(content: PlaybackContent(id: d.id, kind: .movie, title: d.title, subtitle: nil, episode: nil, backdrop: d.backdrop),
                                  variants: d.variants, resumeAt: resume, duration: d.progress?.duration ?? d.runtime.map { TimeInterval($0 * 60) },
                                  cast: d.cast, remembered: d.remembered)
        if let variant { env.player.play(ctx, variant: variant) } else { env.player.play(ctx) }
    }

    /// `/playback` of the episode: fresh links, and what follows written by the server (« À suivre »).
    func play(episode: Episode, fromStart: Bool = false) async {
        guard let d = detail,
              let ctx = await env.attempt("Lecture", { try await env.playbackContext(for: episode, of: d) }) else { return }
        env.player.play(fromStart ? ctx.resuming(at: nil) : ctx)
    }

    /// Picker result. A series keeps the variant picked (for the profile, on the server); a film plays it, and
    /// forgets the one kept for it: only a switch made while playing is kept.
    func chose(variant: Variant) {
        guard let d = detail else { return }
        if d.kind == .series {
            env.player.remember(variant, for: id)
        } else {
            env.player.forgetVariant(for: id)
            play(movie: d, variant: variant)
        }
    }

    /// Episodes of the selected season missing the series language, for the warning line.
    func languageGaps(in season: Int) -> [Episode] {
        guard let lang = seriesLanguage else { return [] }
        return episodes(in: season).filter { !$0.languages.contains(lang) && !$0.variants.isEmpty }
    }
}
