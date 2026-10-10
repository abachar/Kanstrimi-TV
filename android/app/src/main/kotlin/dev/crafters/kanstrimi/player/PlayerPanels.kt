package dev.crafters.kanstrimi.player

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import dev.crafters.kanstrimi.R
import dev.crafters.kanstrimi.app.AppEnvironment
import dev.crafters.kanstrimi.contract.ContentKind
import dev.crafters.kanstrimi.contract.Episode
import dev.crafters.kanstrimi.ui.Badge
import dev.crafters.kanstrimi.ui.WideCard
import dev.crafters.kanstrimi.ui.theme.Theme
import kotlinx.coroutines.launch

/** What the bar of the touch controls opens above its buttons (the Apple app's `BarPanel`). */
enum class BarPanel(val title: String) { PROGRAMME("Programme"), RECENTS("Récentes"), EPISODES("Épisodes"), RELATED("Similaires"), CAST("Distribution"), INFOS("Infos") }

/** The panels the bar offers: live, an episode, a film. Similaires once the server answered with some, Distribution when the title has a cast. */
val PlayerService.panels: List<BarPanel>
    get() {
        if (isLive) return listOf(BarPanel.PROGRAMME, BarPanel.RECENTS, BarPanel.INFOS)
        val episodes = if (context?.content?.kind == ContentKind.EPISODE) listOf(BarPanel.EPISODES) else emptyList()
        val related = if (suggestions?.related?.isNotEmpty() == true) listOf(BarPanel.RELATED) else emptyList()
        val cast = if (context?.cast?.isNotEmpty() == true) listOf(BarPanel.CAST) else emptyList()
        return episodes + related + cast + listOf(BarPanel.INFOS)
    }

@Composable
fun PanelContent(panel: BarPanel, player: PlayerService, env: AppEnvironment, onPick: () -> Unit) {
    when (panel) {
        BarPanel.PROGRAMME -> ProgrammeStrip(player, env)
        BarPanel.RECENTS -> RecentChannelsStrip(player, env, onPick)
        BarPanel.EPISODES -> SeasonEpisodesStrip(player, env, onPick)
        BarPanel.RELATED -> RelatedStrip(player, env, onPick)
        BarPanel.CAST -> PlayerCastStrip(player, env)
        BarPanel.INFOS -> PlayerInfos(player)
    }
}

private val cardWidth = 300.dp

/** Épisodes: the season playing, the current episode marked; a click plays another. */
@Composable
private fun SeasonEpisodesStrip(player: PlayerService, env: AppEnvironment, onPick: () -> Unit) {
    val scope = rememberCoroutineScope()
    LaunchedEffect(player.context?.seriesId) { player.loadTitleCard() }
    val series = player.titleCard
    val season = player.context?.content?.episode?.season
    val episodes: List<Episode> = series?.seasons.orEmpty().filter { it.number == season }.flatMap { it.episodes }
    when {
        player.titleCardFailed -> Text("Épisodes indisponibles", color = Theme.secondary, modifier = Modifier.padding(vertical = 30.dp))
        series == null -> Box(modifier = Modifier.height(100.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Color.White) }
        else -> LazyRow(horizontalArrangement = Arrangement.spacedBy(16.dp), contentPadding = PaddingValues(vertical = 8.dp)) {
            items(episodes, key = { it.id }) { ep ->
                val current = ep.id == player.context?.content?.id
                Box(modifier = Modifier.then(if (current) Modifier.border(2.dp, Theme.accent, RoundedCornerShape(14.dp)) else Modifier)) {
                    WideCard(item = ep.item, width = cardWidth) {
                        if (current || ep.versions.isEmpty()) return@WideCard
                        scope.launch {
                            val played = player.playPicked { env.attempt("Lecture") { PlaybackContext.of(ep, series, env.client.playback(ep.id)) } }
                            if (played) onPick()
                        }
                    }
                }
            }
        }
    }
}

/** Similaires: « Si vous avez aimé… », five titles; a click plays one (a series where it resumes). */
@Composable
private fun RelatedStrip(player: PlayerService, env: AppEnvironment, onPick: () -> Unit) {
    val scope = rememberCoroutineScope()
    LazyRow(horizontalArrangement = Arrangement.spacedBy(16.dp), contentPadding = PaddingValues(vertical = 8.dp)) {
        items(player.suggestions?.related.orEmpty(), key = { it.id }) { item ->
            WideCard(item = item, width = cardWidth) {
                scope.launch {
                    val played = player.playPicked { env.attempt("Lecture") { PlaybackContext.of(item, env.client.playback(item.id)) } }
                    if (played) onPick()
                }
            }
        }
    }
}

/** Distribution: the cast of the movie or of the series, as on its sheet. Choosing an actor leaves the player for their titles. */
@Composable
private fun PlayerCastStrip(player: PlayerService, env: AppEnvironment) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(20.dp), contentPadding = PaddingValues(vertical = 8.dp)) {
        items(player.context?.cast.orEmpty(), key = { it.id ?: it.name }) { person ->
            Column(
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.width(104.dp).clickable(enabled = person.id != null) {
                    // The actor's titles are a screen of the catalogue lots: the player is left, its position kept.
                    player.stop()
                    env.notify("${person.name} : fiche d'acteur dans un prochain lot")
                },
            ) {
                Box(modifier = Modifier.size(84.dp).clip(CircleShape).background(Theme.surfaceRaised), contentAlignment = Alignment.Center) {
                    if (person.photo != null) AsyncImage(model = person.photo, contentDescription = person.name, contentScale = ContentScale.Crop, modifier = Modifier.size(84.dp))
                    else Text(person.name.take(1), fontWeight = FontWeight.Bold, color = Theme.text)
                }
                Text(person.name, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, color = Theme.text, maxLines = 2, textAlign = TextAlign.Center, overflow = TextOverflow.Ellipsis)
                person.role?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = Theme.secondary, maxLines = 1, textAlign = TextAlign.Center, overflow = TextOverflow.Ellipsis) }
            }
        }
    }
}

/** Infos: in live the channel and what it shows; otherwise the title's facts and summary. Then what the engine reads in the stream: the picture's badges, the sound's. */
@Composable
private fun PlayerInfos(player: PlayerService) {
    if (player.isLive) {
        LivePlayerInfos(player) { StreamFactsRow(player) }
        return
    }
    LaunchedEffect(player.context?.content?.id) { player.loadTitleCard() }
    val card = player.titleCard
    val id = player.context?.content?.id
    val episode = card?.seasons.orEmpty().flatMap { it.episodes }.firstOrNull { it.id == id }
    val facts = episode?.let { ep ->
        listOfNotNull(ep.airDate?.take(4), ep.runtime?.let { "$it min" }).joinToString(" · ").ifEmpty { null }
    } ?: card?.facts
    val overview = episode?.overview ?: card?.overview
    Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.widthIn(max = 1100.dp).padding(bottom = 8.dp)) {
        facts?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = Theme.secondary) }
        overview?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = Theme.text, maxLines = 4, overflow = TextOverflow.Ellipsis) }
        StreamFactsRow(player)
    }
}

/** What plays, as the engine read it: definition, dynamic range, codec, frame rate, decoder; then the sound's codec, channels, decoder. */
@Composable
private fun StreamFactsRow(player: PlayerService) {
    val version = player.version ?: return
    val facts = player.streamFacts
    val picture = if (facts?.videoCodec == null) {
        listOfNotNull(version.quality.label, version.dynamicRange?.label ?: "SDR")
    } else {
        listOfNotNull(
            definition(facts.width), facts.dynamicRange ?: "SDR", facts.videoCodec,
            if (facts.frameRate > 0) "${Math.round(facts.frameRate)} i/s" else null, decoderLabel(facts.videoDecoder),
        )
    }
    val sound = if (facts?.audioCodec == null) emptyList() else listOfNotNull(facts.audioCodec, ExoPlaybackEngine.channelsLabel(facts.channels), decoderLabel(facts.audioDecoder))
    Row(horizontalArrangement = Arrangement.spacedBy(28.dp), verticalAlignment = Alignment.CenterVertically) {
        FactGroup(R.drawable.ic_movie, picture)
        if (sound.isNotEmpty()) FactGroup(R.drawable.ic_audiotrack, sound)
        facts?.engine?.let { if (it != "ExoPlayer") Badge(it, small = true) }
        val source = player.source
        if (version.sources.size > 1 && source != null) Text(player.sourceLabel(source, version), style = MaterialTheme.typography.bodySmall, color = Theme.secondary)
    }
}

@Composable
private fun FactGroup(icon: Int, facts: List<String>) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(painterResource(icon), contentDescription = null, tint = Theme.secondary, modifier = Modifier.size(18.dp))
        facts.forEach { Badge(it, small = true) }
    }
}

private fun definition(width: Int): String = when {
    width >= 3200 -> "4K"
    width >= 1900 -> "FHD"
    width >= 1200 -> "HD"
    width > 0 -> "SD"
    else -> "?"
}

/** « FFmpeg » for Jellyfin's or mpv's software decoders, « MediaCodec » for the device's; null until known. */
private fun decoderLabel(name: String?): String? = when {
    name == null -> null
    name.startsWith("ffmpeg", ignoreCase = true) -> "FFmpeg"
    else -> "MediaCodec"
}
