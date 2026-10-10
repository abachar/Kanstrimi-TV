package dev.crafters.kanstrimi.features.detail

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.crafters.kanstrimi.contract.Episode
import dev.crafters.kanstrimi.ui.AccentTag
import dev.crafters.kanstrimi.ui.Badge
import dev.crafters.kanstrimi.ui.WideCard
import dev.crafters.kanstrimi.ui.theme.Theme

/**
 * One episode inside the sheet: the still (progress and « vu » on it), the number and the title, the summary, then
 * `facts`, `badges` and `hint` as the server wrote them. A tap plays it, a long press marks it seen or not.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun EpisodeRow(episode: Episode, stillWidth: Dp, onClick: () -> Unit, onLongClick: () -> Unit) {
    val item = episode.item
    val playable = episode.versions.isNotEmpty()
    Row(
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
            .combinedClickable(enabled = playable, onClick = onClick, onLongClick = onLongClick)
            .padding(10.dp).alpha(if (playable) 1f else 0.5f),
        horizontalArrangement = Arrangement.spacedBy(20.dp), verticalAlignment = Alignment.Top,
    ) {
        WideCard(item, width = stillWidth, onClick = onClick, showsTitle = false)
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("${episode.number}", style = MaterialTheme.typography.titleMedium, color = Theme.secondary)
                Text(item.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            item.overview?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = Theme.secondary, maxLines = 2, overflow = TextOverflow.Ellipsis) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                item.facts?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = Theme.secondary) }
                item.badges.forEach { Badge(it, small = true) }
                item.hint?.let { AccentTag(it) }
            }
        }
    }
}
