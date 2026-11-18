package dev.crafters.kanstrimi.player

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import dev.crafters.kanstrimi.app.AppEnvironment
import dev.crafters.kanstrimi.ui.ChannelItem
import dev.crafters.kanstrimi.ui.LoadedChannelCard
import dev.crafters.kanstrimi.ui.VariantList
import dev.crafters.kanstrimi.ui.VariantMarks
import kotlinx.coroutines.delay

// The lists beside the video, like the Apple app's `SideLists`: the channels from the left, the variants from the right.

/** Which list is up beside the video. */
enum class SideListKind { CHANNELS, VARIANTS }

private enum class Side { LEADING, TRAILING }

private val listWidth = 420.dp
private val listPadding = 32.dp
/** A list left alone this long closes by itself. */
private const val SIDE_LIST_TIMEOUT_MS = 10_000L

/**
 * A list beside the video, which stays readable next to it, darkened towards the list. `content` draws the list
 * itself, on the panel it is handed (its width, its background). It closes on a tap on the video beside it, on a
 * swipe back towards the edge it came from, and by itself after ten seconds without a touch.
 */
@Composable
private fun SideList(side: Side, onClose: () -> Unit, content: @Composable (Modifier) -> Unit) {
    val close by rememberUpdatedState(onClose)
    /** Bumped at each touch, anywhere: the countdown to the automatic close starts again. */
    var activity by remember { mutableIntStateOf(0) }
    LaunchedEffect(activity) {
        delay(SIDE_LIST_TIMEOUT_MS)
        close()
    }
    Row(
        modifier = Modifier.fillMaxSize()
            // Seen on their way down to the list and the video, not taken from them.
            .pointerInput(Unit) {
                awaitPointerEventScope {
                    while (true) {
                        awaitPointerEvent(PointerEventPass.Initial)
                        activity += 1
                    }
                }
            }
            .pointerInput(side) {
                var travelled = 0f
                detectHorizontalDragGestures(
                    onDragStart = { travelled = 0f },
                    onHorizontalDrag = { change, dx -> travelled += dx; change.consume() },
                    onDragEnd = {
                        val back = if (side == Side.LEADING) travelled < -80.dp.toPx() else travelled > 80.dp.toPx()
                        if (back) close()
                    },
                )
            },
    ) {
        val panel = Modifier.width(listWidth).fillMaxHeight().background(Color.Black.copy(alpha = 0.78f))
        // The video darkened towards the list; a tap there closes it.
        val shade: @Composable () -> Unit = {
            val gradient = if (side == Side.LEADING) Brush.horizontalGradient(0f to Color.Black.copy(alpha = 0.5f), 0.3f to Color.Transparent)
            else Brush.horizontalGradient(0.7f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.5f))
            Box(
                modifier = Modifier.weight(1f).fillMaxHeight().background(gradient)
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { close() },
            )
        }
        if (side == Side.TRAILING) shade()
        content(panel)
        if (side == Side.LEADING) shade()
    }
}

@Composable
private fun SideListTitle(text: String) {
    Text(text, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 6.dp))
}

/**
 * « Chaînes », or a swipe to the right in live: the channels of the list the live started from, each with what it
 * shows now, on the left of the video; a tap zaps (the same engine takes the new stream) and closes the list. It
 * opens on the channel playing.
 */
@Composable
fun ChannelListOverlay(player: PlayerService, env: AppEnvironment, onClose: () -> Unit) {
    val listState = rememberLazyListState()
    LaunchedEffect(Unit) {
        val idx = player.channels.indexOfFirst { it.id == player.channel?.id }
        if (idx > 0) listState.scrollToItem(idx)
    }
    SideList(Side.LEADING, onClose) { panel ->
        LazyColumn(state = listState, modifier = panel, contentPadding = PaddingValues(listPadding), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item(key = "title") { SideListTitle("Chaînes") }
            items(player.channels, key = { it.id }) { c ->
                LoadedChannelCard(channel = c, modifier = Modifier.fillMaxWidth(), status = if (c.id == player.channel?.id) ChannelItem.Status.Playing else null) {
                    player.playChannel(c, player.channels)
                    env.recentChannels.record(c)
                    onClose()
                }
            }
        }
    }
}

/**
 * The round button of the bar: the variants of what plays (a movie, an episode, a channel) on the right of the
 * video, in the server's order, a heading per language when the title comes in several, the one playing ticked,
 * those that failed here lately marked. A tap on another one switches at once, keeps the choice for the title and
 * closes the list; a tap on the one playing only closes it. It opens on the one playing.
 */
@Composable
fun VariantListOverlay(player: PlayerService, onClose: () -> Unit) {
    val variants = player.context?.variants.orEmpty().filter { it.isPlayable }
    SideList(Side.TRAILING, onClose) { panel ->
        Column(modifier = panel.verticalScroll(rememberScrollState()).padding(listPadding), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            SideListTitle("Variantes")
            // Two lines for a name: the list is narrow, and what tells two variants apart is at its end.
            VariantList(
                variants, marks = { VariantMarks(playing = it.id == player.variant?.id, failed = player.failedVariants.isFailed(it.id)) },
                nameLines = 2, shownId = player.variant?.id,
            ) { v ->
                if (v.id != player.variant?.id) player.switchVariant(v)
                onClose()
            }
        }
    }
}
