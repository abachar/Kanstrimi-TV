package dev.crafters.kanstrimi.player

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.crafters.kanstrimi.app.AppEnvironment
import dev.crafters.kanstrimi.contract.Programme
import dev.crafters.kanstrimi.ui.ChannelItem
import dev.crafters.kanstrimi.ui.ChannelLogo
import dev.crafters.kanstrimi.ui.LoadedChannelCard
import dev.crafters.kanstrimi.ui.LocalMetrics
import dev.crafters.kanstrimi.ui.ProgrammeCard
import dev.crafters.kanstrimi.ui.formatHour
import dev.crafters.kanstrimi.ui.theme.Theme

// The live player's panels, like the Apple app's `LiveOverlays` and `PlayerStrips`; its channel list is in `SideLists.kt`.

/** « Ensuite : Le Journal · 20:00 »: how the programme after the one on air is announced, everywhere. */
val Programme.nextLine: String get() = "Ensuite : $title · ${formatHour(start)}"

/** Programme: the channel's programmes from the one on air onwards, one card each, the current one marked. */
@Composable
fun ProgrammeStrip(player: PlayerService, env: AppEnvironment) {
    val channelId = player.channel?.id
    val variantId = player.variant?.id
    /** null while loading. */
    var programmes by remember { mutableStateOf<List<Programme>?>(null) }
    LaunchedEffect(channelId, variantId) {
        programmes = null
        if (channelId == null) return@LaunchedEffect
        // An unreliable guide is no reason for an error screen: a failure reads as an unknown programme.
        programmes = runCatching { env.client.programmes(channelId, variantId) }.getOrDefault(emptyList())
    }
    val p = programmes
    when {
        p == null -> Box(modifier = Modifier.height(100.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Color.White) }
        p.isEmpty() -> Text("Programme inconnu pour cette chaîne", color = Theme.secondary, modifier = Modifier.padding(vertical = 30.dp))
        else -> LazyRow(horizontalArrangement = Arrangement.spacedBy(16.dp), contentPadding = PaddingValues(vertical = 8.dp)) {
            items(p, key = { it.start.epochSecond }) { programme -> ProgrammeCard(programme, modifier = Modifier.width(300.dp).height(176.dp)) }
        }
    }
}

/** Récentes: the channels watched lately, most recent first; a tap zaps to one. */
@Composable
fun RecentChannelsStrip(player: PlayerService, env: AppEnvironment, onPick: () -> Unit) {
    val metrics = LocalMetrics.current
    val recents = env.recentChannels.entries
    if (recents.isEmpty()) {
        Text("Aucune chaîne regardée récemment.", color = Theme.secondary, modifier = Modifier.padding(vertical = 30.dp))
        return
    }
    LazyRow(horizontalArrangement = Arrangement.spacedBy(16.dp), contentPadding = PaddingValues(vertical = 8.dp)) {
        items(recents, key = { it.id }) { r ->
            // The list the live started from knows the channel whole; a channel from elsewhere takes its detail from the cache.
            val channel = player.channels.firstOrNull { it.id == r.id } ?: env.channelCache.latest(r.id) ?: r.channel
            val playing = r.id == player.channel?.id
            LoadedChannelCard(channel = channel, modifier = Modifier.width(metrics.channelCardWidth), status = if (playing) ChannelItem.Status.Playing else ChannelItem.Status.Watched(r.watchedAt)) {
                if (playing) return@LoadedChannelCard
                val full = if (channel.variants.isEmpty()) env.channelCache.latest(r.id) else channel
                if (full == null || full.variants.isEmpty()) { env.notify("Chaîne indisponible"); return@LoadedChannelCard }
                val order = if (player.channels.any { it.id == full.id }) player.channels else listOf(full) + player.channels
                player.playChannel(full, order)
                env.recentChannels.record(full)
                onPick()
            }
        }
    }
}

/** Infos in live: the channel and what it shows, the guide's summary included, then what the engine reads in the stream. */
@Composable
fun LivePlayerInfos(player: PlayerService, facts: @Composable () -> Unit) {
    val channel = player.channel ?: return
    val epg = player.epg
    Row(horizontalArrangement = Arrangement.spacedBy(28.dp), modifier = Modifier.widthIn(max = 1100.dp).padding(bottom = 8.dp)) {
        ChannelLogo(id = channel.id, name = channel.name, logo = channel.logo, size = 72.dp)
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(channel.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            val now = epg.now
            if (now != null) {
                Text(now.title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = Theme.text)
                Text("${formatHour(now.start)} – ${formatHour(now.end)}", style = MaterialTheme.typography.bodyMedium, color = Theme.secondary)
                now.overview?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = Theme.text, maxLines = 3, overflow = TextOverflow.Ellipsis) }
            } else {
                Text("Programme inconnu pour cette chaîne", style = MaterialTheme.typography.bodyMedium, color = Theme.secondary)
            }
            epg.next?.let { Text(it.nextLine, style = MaterialTheme.typography.bodyMedium, color = Theme.secondary) }
            facts()
        }
    }
}
