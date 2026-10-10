package dev.crafters.kanstrimi.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import dev.crafters.kanstrimi.ui.theme.Theme

/** A screen not built yet. */
@Composable
fun ComingSoon(title: String) {
    StatePanel(title = title, message = "Cet écran arrive dans un prochain lot.")
}

/** Generic empty / error state with one action. */
@Composable
fun StatePanel(title: String, message: String, actionTitle: String? = null, action: (() -> Unit)? = null) {
    Column(
        modifier = Modifier.fillMaxSize().padding(40.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        Text(message, color = Theme.secondary, textAlign = TextAlign.Center)
        if (actionTitle != null && action != null) {
            Button(onClick = action, colors = ButtonDefaults.buttonColors(containerColor = Theme.surfaceButton, contentColor = Theme.text)) { Text(actionTitle) }
        }
    }
}

/** Poster or backdrop art: the image when there is one, a deterministic gradient with the title otherwise. */
@Composable
fun ArtImage(id: String, url: String?, modifier: Modifier = Modifier, title: String? = null, titleSize: Int = 16) {
    val (a, b) = Theme.art(id)
    Box(modifier = modifier.background(Brush.linearGradient(listOf(a, b))), contentAlignment = Alignment.Center) {
        if (title != null) {
            Text(
                title, color = Color.White.copy(alpha = 0.85f), fontWeight = FontWeight.Black, fontSize = titleSize.sp,
                textAlign = TextAlign.Center, maxLines = 5, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(10.dp),
            )
        }
        if (url != null) {
            AsyncImage(model = url, contentDescription = title, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        }
    }
}

/** Small bordered badge: « 4K », « DOLBY VISION », « FR ». */
@Composable
fun Badge(text: String, filled: Boolean = false, small: Boolean = false) {
    val size = if (small) 11.sp else 13.sp
    Text(
        text = text.uppercase(),
        fontSize = size,
        fontWeight = FontWeight.Bold,
        color = if (filled) Theme.background else Theme.text,
        letterSpacing = 0.5.sp,
        modifier = Modifier
            .background(if (filled) Theme.text else Color.Transparent, RoundedCornerShape(5.dp))
            .border(1.5.dp, Theme.text.copy(alpha = 0.6f), RoundedCornerShape(5.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

/** The amber tag on a capsule: a hint, a warning, « RECOMMANDÉ ». */
@Composable
fun AccentTag(text: String) {
    Text(
        text, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color.Black, letterSpacing = 0.5.sp,
        modifier = Modifier.background(Theme.accent, RoundedCornerShape(50)).padding(horizontal = 7.dp, vertical = 2.dp),
    )
}

/** Thin progress bar drawn on cards. */
@Composable
fun ProgressBar(fraction: Float, modifier: Modifier = Modifier, height: Int = 4) {
    Box(modifier = modifier.fillMaxWidth().height(height.dp).clip(RoundedCornerShape(50)).background(Theme.surfaceStrong)) {
        Box(modifier = Modifier.fillMaxWidth(fraction.coerceIn(0f, 1f)).height(height.dp).background(Theme.text))
    }
}

/** « Kanstrimi » in the accent colour, spaced capitals. */
@Composable
fun Wordmark(size: Int, tracking: Float = 3f) {
    Text("Kanstrimi", color = Theme.accent, fontSize = size.sp, fontWeight = FontWeight.Bold, letterSpacing = tracking.sp)
}

/** A title's logo when TMDB has one, held in the box; the title in large type while it loads, when it fails and without one. */
@Composable
fun LogoOrTitle(title: String, logo: String?, modifier: Modifier = Modifier, titleSize: Int = 40, maxLogoWidth: Int = 380, logoHeight: Int = 110) {
    var failed by androidx.compose.runtime.remember(logo) { androidx.compose.runtime.mutableStateOf(logo == null) }
    var loaded by androidx.compose.runtime.remember(logo) { androidx.compose.runtime.mutableStateOf(false) }
    Box(modifier = modifier) {
        if (logo != null && !failed) {
            AsyncImage(
                model = logo, contentDescription = title, contentScale = ContentScale.Fit, alignment = Alignment.CenterStart,
                onSuccess = { loaded = true }, onError = { failed = true },
                modifier = Modifier.widthIn(max = maxLogoWidth.dp).height(logoHeight.dp),
            )
        }
        if (!loaded) {
            Text(title, fontSize = titleSize.sp, lineHeight = (titleSize * 1.1f).sp, fontWeight = FontWeight.Black, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}
