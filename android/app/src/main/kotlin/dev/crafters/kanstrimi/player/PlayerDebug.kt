package dev.crafters.kanstrimi.player

import android.media.MediaCodec
import android.media.MediaCodecList
import android.util.Log
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
        if (id == "live" || id.startsWith("live:")) return playChannel(player, client, id, staged)
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

    /** `debug.play live` or `live:<id>`: the demo's channel in its list; staged with `livePlaying`, else played (no stream in the demo). */
    private suspend fun playChannel(player: PlayerService, client: CatalogClient, id: String, staged: PlayerService.PreviewState?) {
        val all = runCatching { client.channels() }.getOrNull().orEmpty().flatMap { it.channels }.distinctBy { it.id }
        val channel = all.firstOrNull { it.id == id } ?: all.firstOrNull() ?: return
        if (staged == null) return player.playChannel(channel, all)
        val ctx = PlaybackContext(PlaybackContent(channel.id, ContentKind.LIVE, channel.name), channel.versions)
        player.debugPut(ctx, staged, channels = all)
    }

    /**
     * `debug.codecs`: the device's video decoders in logcat (tag kanstrimi.codecs), one line each with the MIME
     * types it takes, then whether the MPEG-2 software decoder the system hides from tablets can be opened by name.
     */
    fun logCodecs() {
        val tag = "kanstrimi.codecs"
        MediaCodecList(MediaCodecList.ALL_CODECS).codecInfos.filter { !it.isEncoder && it.supportedTypes.any { t -> t.startsWith("video/") } }
            .forEach { Log.i(tag, "${it.name} ${if (it.isHardwareAccelerated) "matériel" else "logiciel"} ${it.supportedTypes.joinToString(" ")}") }
        for (name in listOf("c2.android.mpeg2.decoder", "OMX.google.mpeg2.decoder")) {
            val result = runCatching { MediaCodec.createByCodecName(name).release(); "ouvert" }.getOrElse { "refusé: $it" }
            Log.i(tag, "$name par son nom: $result")
        }
    }

    /** `debug.playUrl <url>`: a public file played as a one-version, one-source title, through the whole pipeline. */
    fun playUrl(player: PlayerService, url: String) {
        val source = Source(id = "debug", container = url.substringAfterLast('.').uppercase(), streamUrl = url, provider = Provider("debug", "Fichier public", "debug"))
        val version = Version(id = "debug-vo", language = "VO", quality = Quality.HD, sources = listOf(source))
        val item = ContentItem(id = "debug:url", kind = ContentKind.MOVIE, title = url.substringAfterLast('/'))
        player.play(PlaybackContext(PlaybackContent(item.id, ContentKind.MOVIE, item.title), listOf(version)))
    }
}
