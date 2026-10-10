package dev.crafters.kanstrimi.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.crafters.kanstrimi.contract.ContentItem
import dev.crafters.kanstrimi.ui.theme.Theme

/**
 * What follows the end of a title, the same for the next episode and the suggested title (the Apple app's
 * `UpNextCard`): the heading with its countdown, the picture and its logo, the facts and badges, the overview, a
 * language warning, then « Lire maintenant » and « Annuler ». Dumb: the parent gives the width and the texts.
 */
@Composable
fun UpNextCard(heading: String, item: ContentItem, onPlay: () -> Unit, onCancel: () -> Unit, modifier: Modifier = Modifier, warning: String? = null) {
    Column(
        modifier = modifier.background(Color(0xE61C1D23), RoundedCornerShape(22.dp)).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(heading, color = Theme.accent, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.5.sp)
        Box(modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(RoundedCornerShape(12.dp))) {
            ArtImage(id = item.id, url = item.picture ?: item.poster, modifier = Modifier.fillMaxSize())
            Box(modifier = Modifier.fillMaxSize().background(Brush.verticalGradient(0.5f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.55f))))
            LogoOrTitle(title = item.title, logo = item.logo, titleSize = 22, maxLogoWidth = 220, logoHeight = 64, modifier = Modifier.align(Alignment.BottomStart).padding(14.dp))
        }
        item.facts?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = Theme.secondary, maxLines = 1, overflow = TextOverflow.Ellipsis) }
        if (item.badges.isNotEmpty()) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { item.badges.forEach { Badge(it, small = true) } }
        }
        item.overview?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = Theme.text.copy(alpha = 0.85f), maxLines = 3, overflow = TextOverflow.Ellipsis) }
        warning?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = Theme.accent, maxLines = 2, overflow = TextOverflow.Ellipsis) }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            Button(onClick = onPlay, colors = ButtonDefaults.buttonColors(containerColor = Theme.text, contentColor = Color.Black)) {
                Icon(Icons.Filled.PlayArrow, contentDescription = null)
                Text("Lire maintenant", fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 4.dp))
            }
            TextButton(onClick = onCancel) { Text("Annuler", color = Theme.text) }
        }
    }
}
