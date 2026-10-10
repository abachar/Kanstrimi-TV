package dev.crafters.kanstrimi.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.crafters.kanstrimi.app.AppEnvironment
import dev.crafters.kanstrimi.app.LocalEnvironment
import dev.crafters.kanstrimi.contract.Channel
import dev.crafters.kanstrimi.contract.ContentItem
import dev.crafters.kanstrimi.contract.Quality

// What a channel card draws from what this device knows, like the Apple app's `ChannelViews`.

/**
 * A `ChannelCard` fed from what this device knows of the channel (`AppEnvironment.channelItem`), and that asks its
 * programme on air when `loads`: the rows of the Direct screen do not, the column beside them shows it.
 */
@Composable
fun LoadedChannelCard(
    channel: Channel,
    modifier: Modifier = Modifier,
    status: ChannelItem.Status? = null,
    hours: Boolean = false,
    loads: Boolean = true,
    selected: Boolean = false,
    onClick: () -> Unit,
) {
    val env = LocalEnvironment.current
    LaunchedEffect(channel.id, loads) { if (loads) env.loadNowPlaying(channel) }
    ChannelCard(item = env.channelItem(channel, status), modifier = modifier, hours = hours, selected = selected, onClick = onClick)
}

/** A channel as its card shows it: the quality it starts in here, its programme on air, its guide state. */
fun AppEnvironment.channelItem(channel: Channel, status: ChannelItem.Status? = null): ChannelItem {
    // A channel drawn from a card of the home (no versions, no favourite) takes both from the detail that
    // `loadNowPlaying` fetched, once known; a listed channel is already complete and fresher than the cache.
    val full = if (channel.versions.isEmpty()) channelCache.latest(channel.id) ?: channel else channel
    return ChannelItem(
        id = channel.id, name = channel.name, logo = channel.logo, status = status,
        quality = (liveVersion(full)?.quality ?: full.maxQuality)?.label, isFavorite = full.isFavorite,
        now = nowPlaying(channel), hasEpg = guide(channel).hasEpg,
    )
}

/** A card of the home's « Chaînes les plus regardées » as a channel: its logo is the card's poster, its quality its badge. */
fun ContentItem.asChannel(): Channel =
    Channel(id = id, name = title, logo = poster, maxQuality = Quality.entries.firstOrNull { it.label == quality })

/** A row of channel cards (the home's « Chaînes les plus regardées »): a tap plays the channel. */
@Composable
fun ChannelRow(title: String, cards: List<ContentItem>, onWatch: (String) -> Unit) {
    val metrics = LocalMetrics.current
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        RowTitle(title, modifier = Modifier.padding(horizontal = metrics.inset))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(metrics.spacing), contentPadding = PaddingValues(horizontal = metrics.inset)) {
            items(cards, key = { it.id }) { c ->
                LoadedChannelCard(channel = c.asChannel(), modifier = Modifier.width(metrics.channelCardWidth)) { onWatch(c.id) }
            }
        }
    }
}
