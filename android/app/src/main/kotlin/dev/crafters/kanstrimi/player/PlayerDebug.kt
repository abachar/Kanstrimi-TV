package dev.crafters.kanstrimi.player

import dev.crafters.kanstrimi.client.CatalogClient
import dev.crafters.kanstrimi.contract.ContentItem
import dev.crafters.kanstrimi.contract.ContentKind
import dev.crafters.kanstrimi.contract.NextEpisode
import dev.crafters.kanstrimi.contract.Provider
import dev.crafters.kanstrimi.contract.Quality
import dev.crafters.kanstrimi.contract.Source
import dev.crafters.kanstrimi.contract.Version

/**
 * Debug only (`MainActivity.debugHooks`): the player staged in a state without a stream for the captures, or
 * playing a public test file to check the engine on the emulator. Never the provider, never the production server.
 */
object PlayerDebug {
    /** `debug.play <id>` with `debug.playerState`: the demo title in that state; without a state, played for real (no stream in the demo: the dialog after 10 s). */
    suspend fun play(player: PlayerService, client: CatalogClient, id: String, state: String?) {
        val staged = state?.let { s -> PlayerService.PreviewState.entries.firstOrNull { it.name == s } }
        var ctx = runCatching { player.loadContext(id) }.getOrNull() ?: return
        if (staged == null) return player.play(ctx)
        // The demo's `/playback` names no next episode: the one after the current in the sheet stands in, else the first.
        if (staged == PlayerService.PreviewState.nextEpisode && ctx.next == null) {
            val series = ctx.seriesId?.let { runCatching { client.detail(it) }.getOrNull() }
            val episodes = series?.seasons.orEmpty().flatMap { it.episodes }
            val idx = episodes.indexOfFirst { it.id == ctx.content.id }
            val next = episodes.getOrNull(idx + 1) ?: episodes.firstOrNull { it.id != ctx.content.id }
            if (next != null) {
                ctx = ctx.copy(next = NextEpisode(next.id, next.title, next.season, next.number, next.runtime, next.languages, null, null, next.still, next.item, "ÉPISODE SUIVANT"))
            }
        }
        val suggestions = runCatching { client.suggestions(ctx.content.id) }.getOrNull()
        player.debugPut(ctx, staged, suggestions)
    }

    /** `debug.playUrl <url>`: a public file played as a one-version, one-source title, through the whole pipeline. */
    fun playUrl(player: PlayerService, url: String) {
        val source = Source(id = "debug", container = url.substringAfterLast('.').uppercase(), streamUrl = url, provider = Provider("debug", "Fichier public", "debug"))
        val version = Version(id = "debug-vo", language = "VO", quality = Quality.HD, sources = listOf(source))
        val item = ContentItem(id = "debug:url", kind = ContentKind.MOVIE, title = url.substringAfterLast('/'))
        player.play(PlaybackContext(PlaybackContent(item.id, ContentKind.MOVIE, item.title), listOf(version)))
    }
}
