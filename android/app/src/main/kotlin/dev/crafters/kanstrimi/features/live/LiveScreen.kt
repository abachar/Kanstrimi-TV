package dev.crafters.kanstrimi.features.live

import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.compose.ContentFrame
import androidx.media3.ui.compose.SURFACE_TYPE_SURFACE_VIEW
import dev.crafters.kanstrimi.R
import dev.crafters.kanstrimi.app.LocalEnvironment
import dev.crafters.kanstrimi.client.CatalogException
import dev.crafters.kanstrimi.contract.Channel
import dev.crafters.kanstrimi.contract.ChannelGroup
import dev.crafters.kanstrimi.contract.Language
import dev.crafters.kanstrimi.ui.Badge
import dev.crafters.kanstrimi.ui.LiveTag
import dev.crafters.kanstrimi.ui.LoadedChannelCard
import dev.crafters.kanstrimi.ui.LoadingPanel
import dev.crafters.kanstrimi.ui.LocalMetrics
import dev.crafters.kanstrimi.ui.MainTab
import dev.crafters.kanstrimi.ui.ProgrammeCard
import dev.crafters.kanstrimi.ui.StatePanel
import dev.crafters.kanstrimi.ui.theme.Theme

/** A category of the Direct: the device's lists first, then one per theme of a market. */
private sealed interface Category {
    data object Recent : Category
    data object MostWatched : Category
    data object Favorites : Category
    data class Group(val id: String) : Category
}

/**
 * The Direct in three columns, like the iPad: the categories with their count, the channels of the selected one,
 * and on the right the preview of the chosen channel with its programme. No focus on a tablet: a tap chooses the
 * channel (its preview, outlined), a second tap, the preview or « Regarder » plays it. Choosing a category chooses
 * its first channel. The preview runs only while this screen is the one on screen and the app is in front: the
 * account allows one connection, the player takes it.
 */
@Composable
fun LiveScreen() {
    val env = LocalEnvironment.current
    val metrics = LocalMetrics.current
    val preview = env.livePreview
    var groups by remember { mutableStateOf<List<ChannelGroup>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var selected by remember { mutableStateOf<Category?>(null) }
    var selectedChannelId by remember { mutableStateOf<String?>(null) }
    var attempt by remember { mutableIntStateOf(0) }

    // Every channel once, and by id: a channel sits in several groups, the first one wins.
    val all = remember(groups) { groups.orEmpty().flatMap { it.channels } }
    val byId = remember(all) { all.groupBy { it.id }.mapValues { it.value.first() } }
    val recents = env.recentChannels.entries.mapNotNull { byId[it.id] }
    val favorites = remember(all) { all.filter { it.isFavorite }.distinctBy { it.id } }
    // The server's ranking over the last 30 days.
    val mostWatched = remember(all) { all.filter { it.watchedRank != null }.distinctBy { it.id }.sortedBy { it.watchedRank } }
    // The channels of the selected category, in the order used for zapping.
    val visible: List<Channel> = when (val s = selected) {
        Category.Recent -> recents
        Category.MostWatched -> mostWatched
        Category.Favorites -> favorites
        is Category.Group -> groups.orEmpty().firstOrNull { it.id == s.id }?.channels.orEmpty()
        null -> emptyList()
    }
    val selectedChannel = selectedChannelId?.let { byId[it] }
    val detail = selectedChannelId?.let { env.channelCache.latest(it) }?.takeIf { it.id == selectedChannelId }

    // Loaded once, then again each time the player leaves a channel (its watch time moves « Les plus regardées »).
    val progressRevision by env.progressRevision.collectAsState()
    LaunchedEffect(progressRevision, attempt) {
        try {
            val loaded = env.client.channels()
            groups = loaded
            error = null
            val loadedAll = loaded.flatMap { it.channels }
            if (selected == null) {
                selected = when {
                    env.recentChannels.entries.any { e -> loadedAll.any { it.id == e.id } } -> Category.Recent
                    loadedAll.any { it.watchedRank != null } -> Category.MostWatched
                    loadedAll.any { it.isFavorite } -> Category.Favorites
                    else -> Category.Group(loaded.firstOrNull()?.id ?: "")
                }
            }
        } catch (e: CatalogException) {
            if (groups == null) error = e.message
        }
    }
    LaunchedEffect(visible.isEmpty(), selectedChannelId) {
        if (selectedChannelId == null) visible.firstOrNull()?.let { selectedChannelId = it.id }
    }
    // The detail is the latest word on the channel: its guide, its versions for the preview.
    LaunchedEffect(selectedChannelId) { selectedChannelId?.let { env.channelCache.channel(it) } }
    // Back from the player: on the channel that was playing (a zap may have moved it), not on the first one.
    val playingId = env.player.channel?.id
    LaunchedEffect(playingId) { if (playingId != null && byId.containsKey(playingId)) selectedChannelId = playingId }

    // The preview runs while this tab is the one on screen, nothing pushed above it, the player down and the app in front.
    var inFront by remember { mutableStateOf(true) }
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_START) inFront = true
            if (event == Lifecycle.Event.ON_STOP) inFront = false
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer); preview.stop() }
    }
    val active = inFront && env.navigator.tab == MainTab.LIVE.key && env.navigator.stack(MainTab.LIVE.key).isEmpty() && !env.player.isPresented
    LaunchedEffect(active, selectedChannel, detail) {
        if (!active) { preview.stop(); return@LaunchedEffect }
        val c = selectedChannel ?: return@LaunchedEffect
        // The version the channel would start in: « TF1 » switched to FHD previews in FHD.
        val versions = detail?.versions ?: c.versions
        val url = env.player.startChoice(c.id, versions)?.source?.streamUrl ?: return@LaunchedEffect
        preview.show(c.id, url)
    }

    fun watch(c: Channel) {
        preview.stop()
        val order = if (visible.any { it.id == c.id }) visible else listOf(c) + visible
        env.player.playChannel(c, order)
        env.recentChannels.record(c)
    }

    val g = groups
    when {
        g != null -> {
            // Columns in proportion of the width left inside the margins, as on the iPad.
            val width = metrics.width - metrics.inset * 2 - 60.dp
            Row(modifier = Modifier.fillMaxSize().padding(horizontal = metrics.inset).padding(top = 28.dp), horizontalArrangement = Arrangement.spacedBy(30.dp)) {
                Categories(
                    groups = g, recents = recents.size, mostWatched = mostWatched.size, favorites = favorites.size, selected = selected,
                    modifier = Modifier.width(width * 0.28f),
                ) { category ->
                    selected = category
                    selectedChannelId = null
                }
                ChannelList(visible, selectedChannelId, modifier = Modifier.width(width * 0.38f)) { c ->
                    if (c.id == selectedChannelId) watch(c) else selectedChannelId = c.id
                }
                Side(selectedChannel, detail, modifier = Modifier.weight(1f), onWatch = { selectedChannel?.let { watch(it) } })
            }
        }
        error != null -> StatePanel("Chaînes indisponibles", error ?: "", actionTitle = "Réessayer") { attempt++ }
        else -> LoadingPanel()
    }
}

// MARK: - Column 1: categories

@Composable
private fun Categories(groups: List<ChannelGroup>, recents: Int, mostWatched: Int, favorites: Int, selected: Category?, modifier: Modifier, onSelect: (Category) -> Unit) {
    // The groups by market, in the server's order: « France · Sport » goes under « France ».
    val markets = remember(groups) { groups.groupBy { it.section }.entries.toList() }
    LazyColumn(modifier = modifier, contentPadding = PaddingValues(bottom = 40.dp)) {
        item(key = "title") { Text("Direct", fontSize = 32.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 16.dp)) }
        if (recents > 0) item(key = "recent") { CategoryRow("Récentes", recents, painterResource(R.drawable.ic_schedule), selected == Category.Recent) { onSelect(Category.Recent) } }
        if (mostWatched > 0) item(key = "most") { CategoryRow("Les plus regardées", mostWatched, painterResource(R.drawable.ic_whatshot), selected == Category.MostWatched) { onSelect(Category.MostWatched) } }
        if (favorites > 0) item(key = "favorites") { CategoryRow("Favoris", favorites, androidx.compose.ui.graphics.vector.rememberVectorPainter(Icons.Filled.FavoriteBorder), selected == Category.Favorites) { onSelect(Category.Favorites) } }
        markets.forEach { (market, themes) ->
            // A grey heading per market, its themes under it.
            item(key = "market:$market") {
                Text(market.uppercase(), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = Theme.secondary, modifier = Modifier.padding(start = 16.dp, top = 22.dp, bottom = 2.dp))
            }
            items(themes, key = { "group:${it.id}" }) { group ->
                CategoryRow(group.theme, group.channels.size, null, selected == Category.Group(group.id)) { onSelect(Category.Group(group.id)) }
            }
        }
    }
}

/** Every name starts at the same edge: the groups keep an empty slot where the others have their icon. */
@Composable
private fun CategoryRow(name: String, count: Int, icon: Painter?, selected: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 10.dp).alpha(if (selected) 1f else 0.7f),
        horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(modifier = Modifier.width(30.dp), contentAlignment = Alignment.Center) {
            if (icon != null) Icon(icon, contentDescription = null, tint = Theme.text, modifier = Modifier.size(22.dp))
        }
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(name, style = MaterialTheme.typography.bodyLarge, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text("$count chaîne${if (count > 1) "s" else ""}", style = MaterialTheme.typography.bodySmall, color = Theme.secondary)
        }
    }
}

// MARK: - Column 2: channels

/** The side column shows the chosen channel's programme: the rows ask nothing, their list copy is enough. */
@Composable
private fun ChannelList(channels: List<Channel>, selectedId: String?, modifier: Modifier, onTap: (Channel) -> Unit) {
    LazyColumn(modifier = modifier, verticalArrangement = Arrangement.spacedBy(10.dp), contentPadding = PaddingValues(top = 10.dp, bottom = 40.dp)) {
        items(channels, key = { it.id }) { c ->
            LoadedChannelCard(channel = c, modifier = Modifier.fillMaxWidth(), loads = false, selected = c.id == selectedId) { onTap(c) }
        }
        if (channels.isEmpty()) item(key = "empty") { Text("Aucune chaîne dans cette catégorie.", color = Theme.secondary, modifier = Modifier.padding(30.dp)) }
    }
}

// MARK: - Column 3: preview and programme

@Composable
private fun Side(channel: Channel?, detail: Channel?, modifier: Modifier, onWatch: () -> Unit) {
    val env = LocalEnvironment.current
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(20.dp)) {
        PreviewBox(modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(RoundedCornerShape(22.dp)).clickable(enabled = channel != null, onClick = onWatch))
        if (channel == null) return@Column
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                LiveTag("EN DIRECT", size = 12)
                Text(channel.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                // The quality and language the channel is shown in; its best and languages when it has no version.
                val v = env.liveVersion(channel)
                if (v != null) {
                    Badge(v.quality.label)
                    Badge(Language.short(v.language))
                } else {
                    channel.maxQuality?.let { Badge(it.label) }
                    channel.versions.map { it.language }.distinct().take(2).forEach { Badge(Language.short(it)) }
                }
            }
            val now = detail?.let { env.guide(it).now }
            when {
                now != null -> ProgrammeCard(now, modifier = Modifier.fillMaxWidth())
                detail == null -> Box(modifier = Modifier.fillMaxWidth().height(48.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Theme.text, modifier = Modifier.size(24.dp)) }
                else -> Text("Programme inconnu", color = Theme.secondary)
            }
            // The server's chips, as the badges beside the name; the version the channel starts in is filled.
            val start = env.liveVersion(channel)?.id
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                channel.versions.forEach { v -> Badge(v.chip ?: v.quality.label, filled = v.id == start) }
            }
            Button(
                onClick = onWatch, modifier = Modifier.fillMaxWidth().padding(top = 6.dp).height(44.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Theme.text, contentColor = Color.Black),
            ) {
                Icon(Icons.Filled.PlayArrow, contentDescription = null)
                Spacer(modifier = Modifier.width(6.dp))
                Text("Regarder", fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

/** The preview's surface, black until its first picture; a tap plays the channel full screen. */
@OptIn(UnstableApi::class)
@Composable
private fun PreviewBox(modifier: Modifier) {
    val preview = LocalEnvironment.current.livePreview
    Box(modifier = modifier.background(Color.Black), contentAlignment = Alignment.Center) {
        preview.player?.let { p -> ContentFrame(p, Modifier.fillMaxSize(), SURFACE_TYPE_SURFACE_VIEW, ContentScale.Fit) }
        if (preview.channelId == null || !preview.hasImage) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Icon(painterResource(R.drawable.ic_tv), contentDescription = null, tint = Theme.secondary, modifier = Modifier.size(50.dp))
                val caption = when {
                    preview.channelId == null -> "Aperçu de la chaîne choisie"
                    preview.failed -> "Aperçu indisponible"
                    else -> "Ouverture du flux… ≈ 2 s"
                }
                Text(caption, style = MaterialTheme.typography.bodyLarge, color = Theme.secondary)
            }
        }
    }
}
