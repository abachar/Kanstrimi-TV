package dev.crafters.kanstrimi.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import dev.crafters.kanstrimi.R
import dev.crafters.kanstrimi.contract.ContentItem
import dev.crafters.kanstrimi.contract.ContentKind
import dev.crafters.kanstrimi.contract.Person
import dev.crafters.kanstrimi.contract.Programme
import dev.crafters.kanstrimi.contract.Studio
import dev.crafters.kanstrimi.ui.theme.Theme
import java.time.Instant

/**
 * The cards, dumb like the Apple app's (`Shared/Cards`): a `ContentItem` and an action in, nothing loaded, the
 * parent gives the width. Texts come written by the server.
 */

/**
 * A 2:3 poster with the hint, the quality, the progress, a check once seen, and the facts in small grey text under
 * it: a movie, a series, a saga. A channel (the search mixes them in) takes the same shape: its logo whole on its
 * colour and « DIRECT ». `onLongClick`: the card's menu, when the parent has one.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun PosterCard(item: ContentItem, width: Dp, onClick: () -> Unit, onLongClick: (() -> Unit)? = null) {
    Column(modifier = Modifier.width(width).combinedClickable(onClick = onClick, onLongClick = onLongClick), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(modifier = Modifier.fillMaxWidth().aspectRatio(2f / 3f).clip(RoundedCornerShape(12.dp))) {
            if (item.kind == ContentKind.LIVE) {
                ChannelPoster(item)
            } else {
                ArtImage(id = item.id, url = item.poster, title = item.title, modifier = Modifier.fillMaxSize(), titleSize = 18)
                Box(modifier = Modifier.fillMaxSize().background(Brush.verticalGradient(0.5f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.75f))))
                Column(modifier = Modifier.align(Alignment.BottomStart).padding(10.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    item.hint?.let { AccentTag(it) }
                    item.quality?.let { Badge(it) }
                }
                item.progress?.let { ProgressBar(it.toFloat(), modifier = Modifier.align(Alignment.BottomCenter).padding(horizontal = 10.dp, vertical = 6.dp)) }
                if (item.watched) WatchedCheck(modifier = Modifier.align(Alignment.TopEnd).padding(8.dp))
            }
        }
        Text(item.facts ?: " ", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** A channel's logo whole on its colour, « DIRECT » in the corner, its name when there is no logo. */
@Composable
private fun ChannelPoster(item: ContentItem) {
    val (a, b) = Theme.art(item.id)
    Box(modifier = Modifier.fillMaxSize().background(Brush.linearGradient(listOf(a, b))), contentAlignment = Alignment.Center) {
        Text(item.title, color = Color.White.copy(alpha = 0.85f), fontWeight = FontWeight.Black, fontSize = 18.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(16.dp))
        if (item.poster != null) {
            AsyncImage(model = item.poster, contentDescription = item.title, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize().padding(24.dp))
        }
        Box(modifier = Modifier.align(Alignment.TopStart).padding(8.dp)) { LiveTag() }
    }
}

/** A 16:9 card: the picture, the badges on top, the title and the caption (« 1 h 08 restantes ») drawn at the bottom. */
@Composable
fun WideCard(item: ContentItem, width: Dp, showsTitle: Boolean = true, onClick: () -> Unit) {
    Box(modifier = Modifier.width(width).aspectRatio(16f / 9f).clip(RoundedCornerShape(14.dp)).clickable(onClick = onClick)) {
        ArtImage(id = item.id, url = item.picture ?: item.poster, modifier = Modifier.fillMaxSize())
        Box(modifier = Modifier.fillMaxSize().background(Brush.verticalGradient(0.35f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.8f))))
        if (showsTitle) {
            Row(modifier = Modifier.padding(10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                item.badges.forEach { Badge(it, small = true) }
            }
        }
        Column(modifier = Modifier.align(Alignment.BottomStart).fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (showsTitle) {
                Text(item.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                item.caption?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = Color.White.copy(alpha = 0.85f)) }
            }
            item.progress?.let { ProgressBar(it.toFloat()) }
        }
        if (item.watched) WatchedCheck(modifier = Modifier.align(Alignment.TopEnd).padding(8.dp))
    }
}

/**
 * A poster with the long-press menu of the catalogue: « Lecture » and « Voir la fiche ». Not for a channel nor a
 * saga, which have no sheet to play. A tap does `onOpen`.
 */
@Composable
fun MenuPoster(item: ContentItem, width: Dp, onOpen: () -> Unit, onPlay: () -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    val hasMenu = item.kind != ContentKind.LIVE && item.kind != ContentKind.SAGA
    Box {
        PosterCard(item, width = width, onClick = onOpen, onLongClick = if (hasMenu) ({ expanded = true }) else null)
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(text = { Text("Lecture") }, onClick = { expanded = false; onPlay() })
            DropdownMenuItem(text = { Text("Voir la fiche") }, onClick = { expanded = false; onOpen() })
        }
    }
}

/** The last card of a shelf that has more: « Voir tout » and the total, 2:3 like the posters beside it. */
@Composable
fun SeeAllCard(total: Int, width: Dp, onClick: () -> Unit) {
    Column(modifier = Modifier.width(width), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Column(
            modifier = Modifier.fillMaxWidth().aspectRatio(2f / 3f).clip(RoundedCornerShape(12.dp)).background(Theme.surface).clickable(onClick = onClick),
            verticalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterVertically), horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(painterResource(R.drawable.ic_grid), contentDescription = null, tint = Theme.text, modifier = Modifier.width(36.dp).height(36.dp))
            Text("Voir tout", fontWeight = FontWeight.SemiBold)
            Text(formatCount(total), style = MaterialTheme.typography.bodySmall, color = Theme.secondary)
        }
        Text(" ", style = MaterialTheme.typography.bodySmall)
    }
}

/** A studio logo on a light tile (TMDB logos are drawn for a light background), its name when there is no logo. 2:1. */
@Composable
fun StudioTile(studio: Studio, width: Dp, onClick: (() -> Unit)? = null) {
    Box(
        modifier = Modifier.width(width).aspectRatio(2f).clip(RoundedCornerShape(12.dp)).background(Theme.logoTile)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        Text(studio.name, color = Color.Black, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center, modifier = Modifier.padding(8.dp))
        if (studio.logo != null) {
            AsyncImage(model = studio.logo, contentDescription = studio.name, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize().padding(width * 0.1f))
        }
    }
}

/** A round photo (initials while it loads or when there is none), the name under it, then the role. */
@Composable
fun CastCell(person: Person, width: Dp, photo: Dp, onClick: (() -> Unit)? = null) {
    Column(
        modifier = Modifier.width(width).then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier).padding(vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        CastPhoto(name = person.name, url = person.photo, diameter = photo)
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(person.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis)
            person.role?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = Theme.secondary, textAlign = TextAlign.Center, maxLines = 1, overflow = TextOverflow.Ellipsis) }
        }
    }
}

/**
 * A channel as every channel card shows it, built by the screens (`channelItem`): the quality last chosen, the
 * programme on air and whether it was played belong to this device.
 */
data class ChannelItem(
    val id: String,
    val name: String,
    val logo: String? = null,
    val status: Status? = null,
    /** The quality last chosen for it, else its best. */
    val quality: String? = null,
    val isFavorite: Boolean = false,
    val now: Programme? = null,
    /** false: the server knows it has no guide (« Pas de programme »). */
    val hasEpg: Boolean? = null,
) {
    sealed interface Status {
        data object Playing : Status
        /** Watched before; dated when this device saw it. */
        data class Watched(val at: Instant?) : Status
    }
}

/**
 * Every channel the same way: logo, name and favourite, then « EN COURS » or when it was watched, the quality last
 * chosen; under them what is on air with its progress, its hours when `hours`. As wide as its parent makes it (a
 * tile in a row, the whole width of a list): the home, the Direct screen, the player's list and its « Récentes ».
 * `selected`: the channel the Direct's side column shows, outlined.
 */
@Composable
fun ChannelCard(item: ChannelItem, modifier: Modifier = Modifier, hours: Boolean = false, selected: Boolean = false, onClick: () -> Unit) {
    val shape = RoundedCornerShape(14.dp)
    Column(
        modifier = modifier.clip(shape).background(if (selected) Theme.surfaceRaised else Theme.surface, shape)
            .then(if (selected) Modifier.border(1.5.dp, Theme.text.copy(alpha = 0.6f), shape) else Modifier)
            .clickable(onClick = onClick).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
            ChannelLogo(id = item.id, name = item.name, logo = item.logo, size = 64.dp)
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(item.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                    if (item.isFavorite) Icon(Icons.Filled.Favorite, contentDescription = "Favori", tint = Theme.accent, modifier = Modifier.size(14.dp))
                }
                when (val s = item.status) {
                    ChannelItem.Status.Playing -> OnAirLabel()
                    is ChannelItem.Status.Watched -> Text(s.at?.let(::formatAgo) ?: "Regardée récemment", style = MaterialTheme.typography.bodySmall, color = Theme.secondary, maxLines = 1)
                    null -> {}
                }
            }
            item.quality?.let { Badge(it) }
        }
        val p = item.now
        if (p != null) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(p.title, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    ProgressBar(p.fraction(), modifier = Modifier.weight(1f))
                    if (hours) Text("${formatHour(p.start)} – ${formatHour(p.end)}", style = MaterialTheme.typography.bodySmall, color = Theme.secondary, maxLines = 1)
                }
            }
        } else {
            Text(if (item.hasEpg == false) "Pas de programme" else " ", style = MaterialTheme.typography.bodyLarge, color = Theme.secondary, maxLines = 1)
        }
    }
}

/**
 * A programme of the guide: its hours, title and summary, then « EN COURS » and its progress while on air. The
 * player's Programme panel and the Direct screen. As large as its parent makes it: given a height, « EN COURS »
 * sits at the bottom of the card; else the card is as tall as its text.
 */
@Composable
fun ProgrammeCard(programme: Programme, modifier: Modifier = Modifier) {
    val now = Instant.now()
    val onAir = !programme.start.isAfter(now) && programme.end.isAfter(now)
    Column(modifier = modifier.clip(RoundedCornerShape(14.dp)).background(Theme.surface).padding(20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("${formatHour(programme.start)} – ${formatHour(programme.end)}", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = Theme.secondary)
        Text(programme.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
        programme.overview?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = Theme.secondary, maxLines = 3, overflow = TextOverflow.Ellipsis) }
        if (onAir) {
            androidx.compose.foundation.layout.Spacer(modifier = Modifier.weight(1f, fill = false))
            OnAirLabel()
            ProgressBar(programme.fraction())
        }
    }
}

/** Card that takes the place of a page that failed to load, in a grid. */
@Composable
fun RetryCard(message: String, width: Dp, onClick: () -> Unit) {
    Column(
        modifier = Modifier.width(width).aspectRatio(2f / 3f).clip(RoundedCornerShape(12.dp)).background(Theme.surface).clickable(onClick = onClick).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically), horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(Icons.Filled.Refresh, contentDescription = null, tint = Theme.text, modifier = Modifier.width(32.dp).height(32.dp))
        Text("Suite non chargée", fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
        Text(message, style = MaterialTheme.typography.bodySmall, color = Theme.secondary, textAlign = TextAlign.Center, maxLines = 3, overflow = TextOverflow.Ellipsis)
        Text("Réessayer", style = MaterialTheme.typography.labelLarge, color = Theme.accent)
    }
}

/** The title over a row or a section, dimmed a little: the cards lead. `count` beside it when the row has a total. */
@Composable
fun RowTitle(text: String, modifier: Modifier = Modifier, count: Int? = null) {
    Row(modifier = modifier, horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(text, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.8f))
        count?.let { Text(formatCount(it), style = MaterialTheme.typography.bodySmall, color = Theme.secondary) }
    }
}

/**
 * Horizontal row with a title: posters, or wide cards for « Reprendre » (`landscape`). A long press on a title's
 * poster offers « Lecture » (`onPlay`) and « Voir la fiche ».
 */
@Composable
fun CardRow(title: String, cards: List<ContentItem>, landscape: Boolean, onPlay: (ContentItem) -> Unit, onSelect: (ContentItem) -> Unit) {
    val metrics = LocalMetrics.current
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        RowTitle(title, modifier = Modifier.padding(horizontal = metrics.inset))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(metrics.spacing), contentPadding = PaddingValues(horizontal = metrics.inset)) {
            items(cards, key = { it.id }) { c ->
                if (landscape) {
                    WideCard(c, width = metrics.wideWidth, onClick = { onSelect(c) })
                } else {
                    MenuPoster(c, width = metrics.posterWidth, onOpen = { onSelect(c) }, onPlay = { onPlay(c) })
                }
            }
        }
    }
}
