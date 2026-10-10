package dev.crafters.kanstrimi.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.crafters.kanstrimi.contract.ContentItem

/**
 * The cards, dumb like the Apple app's (`Shared/Cards`): a `ContentItem` and an action in, nothing loaded, the
 * parent gives the width. Texts come written by the server.
 */

/** A 2:3 poster with the hint, the quality, the progress and the facts in small grey text under it. */
@Composable
fun PosterCard(item: ContentItem, width: Dp, onClick: () -> Unit) {
    Column(modifier = Modifier.width(width).clickable(onClick = onClick), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(modifier = Modifier.fillMaxWidth().aspectRatio(2f / 3f).clip(RoundedCornerShape(12.dp))) {
            ArtImage(id = item.id, url = item.poster, title = item.title, modifier = Modifier.fillMaxSize(), titleSize = 18)
            Box(modifier = Modifier.fillMaxSize().background(Brush.verticalGradient(0.5f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.75f))))
            Column(modifier = Modifier.align(Alignment.BottomStart).padding(10.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                item.hint?.let { AccentTag(it) }
                item.quality?.let { Badge(it) }
            }
            item.progress?.let { ProgressBar(it.toFloat(), modifier = Modifier.align(Alignment.BottomCenter).padding(horizontal = 10.dp, vertical = 6.dp)) }
        }
        Text(item.facts ?: " ", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** A 16:9 card: the picture, the badges on top, the title and the caption (« 1 h 08 restantes ») drawn at the bottom. */
@Composable
fun WideCard(item: ContentItem, width: Dp, onClick: () -> Unit) {
    Box(modifier = Modifier.width(width).aspectRatio(16f / 9f).clip(RoundedCornerShape(14.dp)).clickable(onClick = onClick)) {
        ArtImage(id = item.id, url = item.picture ?: item.poster, modifier = Modifier.fillMaxSize())
        Box(modifier = Modifier.fillMaxSize().background(Brush.verticalGradient(0.35f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.8f))))
        Row(modifier = Modifier.padding(10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            item.badges.forEach { Badge(it, small = true) }
        }
        Column(modifier = Modifier.align(Alignment.BottomStart).fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(item.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            item.caption?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = Color.White.copy(alpha = 0.85f)) }
            item.progress?.let { ProgressBar(it.toFloat()) }
        }
    }
}

/** The title over a row or a section, dimmed a little: the cards lead. */
@Composable
fun RowTitle(text: String, modifier: Modifier = Modifier) {
    Text(text, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.8f), modifier = modifier)
}

/** Horizontal row with a title: posters, or wide cards for « Reprendre ». */
@Composable
fun CardRow(title: String, cards: List<ContentItem>, landscape: Boolean, inset: Dp, posterWidth: Dp, onSelect: (ContentItem) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        RowTitle(title, modifier = Modifier.padding(horizontal = inset))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(16.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = inset)) {
            items(cards, key = { it.id }) { c ->
                if (landscape) WideCard(c, width = posterWidth * 2, onClick = { onSelect(c) }) else PosterCard(c, width = posterWidth, onClick = { onSelect(c) })
            }
        }
    }
}
